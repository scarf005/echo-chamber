type CrtRenderer = {
  canvas: HTMLCanvasElement
  gl: WebGLRenderingContext
  program: WebGLProgram
  texture: WebGLTexture
  quadBuffer: WebGLBuffer
  positionLocation: number
  resolutionLocation: WebGLUniformLocation
  sourceResolutionLocation: WebGLUniformLocation
  textureLocation: WebGLUniformLocation
  sourceWidth: number
  sourceHeight: number
}

type RenderCrtFrameOptions = {
  uploadSource?: boolean
}

const vertexShaderSource = `
attribute vec2 a;
varying vec2 v;

void main() {
  v = a * 0.5 + 0.5;
  gl_Position = vec4(a, 0.0, 1.0);
}
`

const fragmentShaderSource = `
precision mediump float;

uniform sampler2D t;
uniform vec2 uResolution;
uniform vec2 uSourceResolution;

varying vec2 v;

void main() {
  vec2 uv = v;
  vec2 centered = uv * 2.0 - 1.0;
  vec2 warped = centered + centered * vec2(centered.y * centered.y * 0.018, centered.x * centered.x * 0.026);
  warped = warped * 0.5 + 0.5;

  if (warped.x < 0.0 || warped.x > 1.0 || warped.y < 0.0 || warped.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec2 texel = 1.0 / uSourceResolution;
  vec3 base = texture2D(t, warped).rgb;
  vec3 glow = base * 0.16;
  glow += texture2D(t, warped + vec2(texel.x, 0.0)).rgb * 0.08;
  glow += texture2D(t, warped - vec2(texel.x, 0.0)).rgb * 0.08;
  glow += texture2D(t, warped + vec2(0.0, texel.y)).rgb * 0.05;
  glow += texture2D(t, warped - vec2(0.0, texel.y)).rgb * 0.05;

  float scanline = 0.94 + 0.06 * sin(warped.y * uResolution.y * 1.1);
  float vignette = 1.0 - smoothstep(0.32, 0.92, distance(v, vec2(0.5))) * 0.18;

  vec3 color = base;
  color += glow * vec3(0.04, 0.06, 0.05);
  color *= vec3(0.985, 1.01, 0.99);
  color *= scanline * vignette;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`

const compileShader = (
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader => {
  const shader = gl.createShader(type)

  if (!shader) {
    throw new Error("Failed to create shader")
  }

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader) ?? "Unknown shader compile error"
    gl.deleteShader(shader)
    throw new Error(error)
  }

  return shader
}

const createProgram = (gl: WebGLRenderingContext): WebGLProgram => {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource)
  const fragmentShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentShaderSource,
  )
  const program = gl.createProgram()

  if (!program) {
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    throw new Error("Failed to create WebGL program")
  }

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program) ?? "Unknown program link error"
    gl.deleteProgram(program)
    throw new Error(error)
  }

  return program
}

const getUniformLocation = (
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation => {
  const location = gl.getUniformLocation(program, name)

  if (!location) {
    throw new Error(`Missing WebGL uniform: ${name}`)
  }

  return location
}

export const createCrtRenderer = (canvas: HTMLCanvasElement): CrtRenderer => {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    stencil: false,
  })

  if (!gl) {
    throw new Error("WebGL not supported")
  }

  const program = createProgram(gl)
  const quadBuffer = gl.createBuffer()
  const texture = gl.createTexture()

  if (!quadBuffer || !texture) {
    throw new Error("Failed to allocate WebGL resources")
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  )

  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

  const positionLocation = gl.getAttribLocation(program, "a")

  if (positionLocation < 0) {
    throw new Error("Missing WebGL attribute: a")
  }

  const textureLocation = getUniformLocation(gl, program, "t")
  gl.useProgram(program)
  gl.uniform1i(textureLocation, 0)
  gl.viewport(0, 0, canvas.width, canvas.height)

  return {
    canvas,
    gl,
    program,
    texture,
    quadBuffer,
    positionLocation,
    resolutionLocation: getUniformLocation(gl, program, "uResolution"),
    sourceResolutionLocation: getUniformLocation(
      gl,
      program,
      "uSourceResolution",
    ),
    textureLocation,
    sourceWidth: 0,
    sourceHeight: 0,
  }
}

export const renderCrtFrame = (
  renderer: CrtRenderer,
  sourceCanvas: HTMLCanvasElement,
  options: RenderCrtFrameOptions,
): void => {
  const { gl } = renderer
  const needsTextureUpload = options.uploadSource === true ||
    renderer.sourceWidth !== sourceCanvas.width ||
    renderer.sourceHeight !== sourceCanvas.height

  gl.useProgram(renderer.program)
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.quadBuffer)
  gl.enableVertexAttribArray(renderer.positionLocation)
  gl.vertexAttribPointer(renderer.positionLocation, 2, gl.FLOAT, false, 0, 0)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, renderer.texture)

  if (needsTextureUpload) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      sourceCanvas,
    )
    renderer.sourceWidth = sourceCanvas.width
    renderer.sourceHeight = sourceCanvas.height
  }

  gl.uniform2f(
    renderer.resolutionLocation,
    renderer.canvas.width,
    renderer.canvas.height,
  )
  gl.uniform2f(
    renderer.sourceResolutionLocation,
    sourceCanvas.width,
    sourceCanvas.height,
  )
  gl.uniform1i(renderer.textureLocation, 0)
  gl.clearColor(0, 0, 0, 1)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}

export const destroyCrtRenderer = (renderer: CrtRenderer | null) => {
  if (!renderer) {
    return
  }

  const { gl } = renderer
  gl.deleteTexture(renderer.texture)
  gl.deleteBuffer(renderer.quadBuffer)
  gl.deleteProgram(renderer.program)
}
