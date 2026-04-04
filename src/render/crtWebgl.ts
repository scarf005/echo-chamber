type ProgramBundle = {
  program: WebGLProgram
  positionLocation: number
}

type BlurProgram = ProgramBundle & {
  textureLocation: WebGLUniformLocation
  texelLocation: WebGLUniformLocation
  directionLocation: WebGLUniformLocation
}

type BurnInProgram = ProgramBundle & {
  currentLocation: WebGLUniformLocation
  previousLocation: WebGLUniformLocation
  decayLocation: WebGLUniformLocation
}

type CompositeProgram = ProgramBundle & {
  sourceLocation: WebGLUniformLocation
  bloomLocation: WebGLUniformLocation
  burnInLocation: WebGLUniformLocation
  resolutionLocation: WebGLUniformLocation
  sourceResolutionLocation: WebGLUniformLocation
  timeLocation: WebGLUniformLocation
  eventIntensityLocation: WebGLUniformLocation
  eventLineLocation: WebGLUniformLocation
}

type TextureTarget = {
  texture: WebGLTexture
  framebuffer: WebGLFramebuffer
  width: number
  height: number
}

type CrtRenderer = {
  canvas: HTMLCanvasElement
  gl: WebGLRenderingContext
  quadBuffer: WebGLBuffer
  sourceTexture: WebGLTexture
  blurProgram: BlurProgram
  burnInProgram: BurnInProgram
  compositeProgram: CompositeProgram
  bloomTargets: [TextureTarget, TextureTarget]
  burnInTargets: [TextureTarget, TextureTarget]
  burnInIndex: 0 | 1
  sourceWidth: number
  sourceHeight: number
}

type RenderCrtFrameOptions = {
  deltaTime: number
  time: number
  eventIntensity: number
  eventLineY: number
  uploadSource?: boolean
}

const vertexShaderSource = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const blurFragmentShaderSource = `
precision mediump float;

uniform sampler2D u_texture;
uniform vec2 u_texel;
uniform vec2 u_direction;

varying vec2 v_uv;

float rgb2grey(vec3 value) {
  return dot(value, vec3(0.21, 0.72, 0.04));
}

void main() {
  vec2 stepOffset = u_texel * u_direction;
  vec3 sample0 = texture2D(u_texture, v_uv).rgb;
  vec3 sample1 = texture2D(u_texture, v_uv + stepOffset * 1.3846153846).rgb;
  vec3 sample2 = texture2D(u_texture, v_uv - stepOffset * 1.3846153846).rgb;
  vec3 sample3 = texture2D(u_texture, v_uv + stepOffset * 3.2307692308).rgb;
  vec3 sample4 = texture2D(u_texture, v_uv - stepOffset * 3.2307692308).rgb;

  vec3 blurred = sample0 * 0.2270270270;
  blurred += sample1 * 0.3162162162;
  blurred += sample2 * 0.3162162162;
  blurred += sample3 * 0.0702702703;
  blurred += sample4 * 0.0702702703;

  float threshold = smoothstep(0.12, 0.65, rgb2grey(blurred));
  gl_FragColor = vec4(blurred * threshold, 1.0);
}
`

const burnInFragmentShaderSource = `
precision mediump float;

uniform sampler2D u_current;
uniform sampler2D u_previous;
uniform float u_decay;

varying vec2 v_uv;

void main() {
  vec3 currentColor = texture2D(u_current, v_uv).rgb;
  vec3 previousColor = texture2D(u_previous, v_uv).rgb;
  vec3 accumulated = max(previousColor - vec3(u_decay), currentColor);
  gl_FragColor = vec4(accumulated, 1.0);
}
`

const compositeFragmentShaderSource = `
precision mediump float;

uniform sampler2D u_source;
uniform sampler2D u_bloom;
uniform sampler2D u_burnIn;
uniform vec2 u_resolution;
uniform vec2 u_sourceResolution;
uniform float u_time;
uniform float u_eventIntensity;
uniform float u_eventLineY;

varying vec2 v_uv;

float rgb2grey(vec3 value) {
  return dot(value, vec3(0.21, 0.72, 0.04));
}

float hash(vec2 value) {
  return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
}

vec2 distortCoordinates(vec2 uv) {
  vec2 centered = uv * 2.0 - 1.0;
  vec2 curved = centered + centered * vec2(
    centered.y * centered.y * 0.018,
    centered.x * centered.x * 0.026
  );
  return curved * 0.5 + 0.5;
}

void main() {
  vec2 warped = distortCoordinates(v_uv);

  if (warped.x < 0.0 || warped.x > 1.0 || warped.y < 0.0 || warped.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec2 texel = 1.0 / u_sourceResolution;
  vec3 sourceColor = texture2D(u_source, warped).rgb;
  vec3 bloomColor = texture2D(u_bloom, warped).rgb;
  vec3 burnInColor = texture2D(u_burnIn, warped).rgb;
  vec2 aberrationDirection = warped - vec2(0.5);
  float aberrationDistance = length(aberrationDirection);
  vec2 aberrationUnit = aberrationDistance > 0.0
    ? aberrationDirection / aberrationDistance
    : vec2(0.0);
  float rgbShift = u_eventIntensity * 0.01 * (0.2 + aberrationDistance * 1.8);
  vec2 aberrationOffset = aberrationUnit * rgbShift;
  vec3 shiftedColor = vec3(
    texture2D(u_source, warped + aberrationOffset).r,
    sourceColor.g,
    texture2D(u_source, warped - aberrationOffset).b
  );
  vec3 localGlow = shiftedColor * 0.05;
  localGlow += texture2D(u_source, warped + vec2(texel.x, 0.0)).rgb * 0.025;
  localGlow += texture2D(u_source, warped - vec2(texel.x, 0.0)).rgb * 0.025;

  float bloomAlpha = smoothstep(0.025, 0.4, rgb2grey(bloomColor));
  float burnInAlpha = smoothstep(0.04, 0.3, rgb2grey(burnInColor));
  float scanline = 0.94 + 0.06 * sin(warped.y * u_resolution.y * 1.1);
  float vignette = 1.0 - smoothstep(0.32, 0.92, distance(v_uv, vec2(0.5))) * 0.18;
  float ambientTop = smoothstep(1.05, -0.08, warped.y) * 0.05;
  float ambientCurve = smoothstep(0.98, 0.12, distance(warped, vec2(0.5))) * 0.018;
  vec3 ambientLight = (bloomColor * 0.08 + vec3(0.012, 0.018, 0.016)) * (ambientTop + ambientCurve);
  float glowLine = exp(-pow((warped.y - u_eventLineY) / 0.03, 2.0)) * (u_eventIntensity * 0.29);
  float staticNoise = (hash(floor(warped * u_resolution * 0.33) + vec2(u_time * 23.0, u_time * 17.0)) - 0.5) * 0.018;
  float flicker = 0.992 + 0.008 * sin(u_time * 42.0);

  vec3 color = shiftedColor;
  color = max(color, max(burnInColor - vec3(0.03), vec3(0.0)) * burnInAlpha * 0.65);
  color += bloomColor * bloomAlpha * 0.22;
  color += localGlow * vec3(0.03, 0.05, 0.04);
  color += ambientLight;
  color += vec3(0.05, 0.08, 0.06) * glowLine;
  color += staticNoise;
  color *= vec3(0.985, 1.01, 0.99);
  color *= scanline * vignette * flicker;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`

const compileShader = (
  gl: WebGLRenderingContext,
  type: number,
  source: string,
) => {
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

const createProgram = (
  gl: WebGLRenderingContext,
  fragmentShaderSource: string,
) => {
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

  const positionLocation = gl.getAttribLocation(program, "a_position")

  if (positionLocation < 0) {
    gl.deleteProgram(program)
    throw new Error("Missing WebGL attribute: a_position")
  }

  return { program, positionLocation }
}

const getUniformLocation = (
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  name: string,
) => {
  const location = gl.getUniformLocation(program, name)

  if (!location) {
    throw new Error(`Missing WebGL uniform: ${name}`)
  }

  return location
}

const setupTexture = (gl: WebGLRenderingContext, texture: WebGLTexture) => {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
}

const createTextureTarget = (
  gl: WebGLRenderingContext,
  width: number,
  height: number,
) => {
  const texture = gl.createTexture()
  const framebuffer = gl.createFramebuffer()

  if (!texture || !framebuffer) {
    throw new Error("Failed to create render target")
  }

  setupTexture(gl, texture)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  )
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  )

  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("Incomplete framebuffer")
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  return { texture, framebuffer, width, height }
}

const bindQuad = (
  gl: WebGLRenderingContext,
  quadBuffer: WebGLBuffer,
  positionLocation: number,
) => {
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
}

const bindTextureUnit = (
  gl: WebGLRenderingContext,
  texture: WebGLTexture,
  unit: number,
) => {
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, texture)
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

  const quadBuffer = gl.createBuffer()
  const sourceTexture = gl.createTexture()

  if (!quadBuffer || !sourceTexture) {
    throw new Error("Failed to allocate WebGL resources")
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  )
  setupTexture(gl, sourceTexture)

  const blurBase = createProgram(gl, blurFragmentShaderSource)
  const burnInBase = createProgram(gl, burnInFragmentShaderSource)
  const compositeBase = createProgram(gl, compositeFragmentShaderSource)
  const blurProgram: BlurProgram = {
    ...blurBase,
    textureLocation: getUniformLocation(gl, blurBase.program, "u_texture"),
    texelLocation: getUniformLocation(gl, blurBase.program, "u_texel"),
    directionLocation: getUniformLocation(gl, blurBase.program, "u_direction"),
  }
  const burnInProgram: BurnInProgram = {
    ...burnInBase,
    currentLocation: getUniformLocation(gl, burnInBase.program, "u_current"),
    previousLocation: getUniformLocation(gl, burnInBase.program, "u_previous"),
    decayLocation: getUniformLocation(gl, burnInBase.program, "u_decay"),
  }
  const compositeProgram: CompositeProgram = {
    ...compositeBase,
    sourceLocation: getUniformLocation(gl, compositeBase.program, "u_source"),
    bloomLocation: getUniformLocation(gl, compositeBase.program, "u_bloom"),
    burnInLocation: getUniformLocation(gl, compositeBase.program, "u_burnIn"),
    resolutionLocation: getUniformLocation(
      gl,
      compositeBase.program,
      "u_resolution",
    ),
    sourceResolutionLocation: getUniformLocation(
      gl,
      compositeBase.program,
      "u_sourceResolution",
    ),
    timeLocation: getUniformLocation(
      gl,
      compositeBase.program,
      "u_time",
    ),
    eventIntensityLocation: getUniformLocation(
      gl,
      compositeBase.program,
      "u_eventIntensity",
    ),
    eventLineLocation: getUniformLocation(
      gl,
      compositeBase.program,
      "u_eventLineY",
    ),
  }

  const bloomWidth = Math.max(1, Math.floor(canvas.width * 0.25))
  const bloomHeight = Math.max(1, Math.floor(canvas.height * 0.25))

  return {
    canvas,
    gl,
    quadBuffer,
    sourceTexture,
    blurProgram,
    burnInProgram,
    compositeProgram,
    bloomTargets: [
      createTextureTarget(gl, bloomWidth, bloomHeight),
      createTextureTarget(gl, bloomWidth, bloomHeight),
    ],
    burnInTargets: [
      createTextureTarget(gl, canvas.width, canvas.height),
      createTextureTarget(gl, canvas.width, canvas.height),
    ],
    burnInIndex: 0,
    sourceWidth: 0,
    sourceHeight: 0,
  }
}

const uploadSourceTexture = (
  renderer: CrtRenderer,
  sourceCanvas: HTMLCanvasElement,
) => {
  const { gl } = renderer
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
  bindTextureUnit(gl, renderer.sourceTexture, 0)
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
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
}

const renderBlurPass = (
  renderer: CrtRenderer,
  inputTexture: WebGLTexture,
  options: {
    target: TextureTarget
    directionX: number
    directionY: number
  },
) => {
  const { target, directionX, directionY } = options
  const { gl, blurProgram, quadBuffer } = renderer
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
  gl.viewport(0, 0, target.width, target.height)
  gl.useProgram(blurProgram.program)
  bindQuad(gl, quadBuffer, blurProgram.positionLocation)
  bindTextureUnit(gl, inputTexture, 0)
  gl.uniform1i(blurProgram.textureLocation, 0)
  gl.uniform2f(blurProgram.texelLocation, 1 / target.width, 1 / target.height)
  gl.uniform2f(blurProgram.directionLocation, directionX, directionY)
  gl.clearColor(0, 0, 0, 1)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}

const renderBurnInPass = (
  renderer: CrtRenderer,
  nextTarget: TextureTarget,
  options: {
    previousTarget: TextureTarget
    decay: number
  },
) => {
  const { previousTarget, decay } = options
  const { gl, burnInProgram, quadBuffer } = renderer
  gl.bindFramebuffer(gl.FRAMEBUFFER, nextTarget.framebuffer)
  gl.viewport(0, 0, nextTarget.width, nextTarget.height)
  gl.useProgram(burnInProgram.program)
  bindQuad(gl, quadBuffer, burnInProgram.positionLocation)
  bindTextureUnit(gl, renderer.sourceTexture, 0)
  bindTextureUnit(gl, previousTarget.texture, 1)
  gl.uniform1i(burnInProgram.currentLocation, 0)
  gl.uniform1i(burnInProgram.previousLocation, 1)
  gl.uniform1f(burnInProgram.decayLocation, decay)
  gl.clearColor(0, 0, 0, 1)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}

const renderCompositePass = (
  renderer: CrtRenderer,
  bloomTexture: WebGLTexture,
  options: {
    burnInTexture: WebGLTexture
  } & RenderCrtFrameOptions,
) => {
  const { burnInTexture } = options
  const { gl, compositeProgram, quadBuffer } = renderer
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, renderer.canvas.width, renderer.canvas.height)
  gl.useProgram(compositeProgram.program)
  bindQuad(gl, quadBuffer, compositeProgram.positionLocation)
  bindTextureUnit(gl, renderer.sourceTexture, 0)
  bindTextureUnit(gl, bloomTexture, 1)
  bindTextureUnit(gl, burnInTexture, 2)
  gl.uniform1i(compositeProgram.sourceLocation, 0)
  gl.uniform1i(compositeProgram.bloomLocation, 1)
  gl.uniform1i(compositeProgram.burnInLocation, 2)
  gl.uniform2f(
    compositeProgram.resolutionLocation,
    renderer.canvas.width,
    renderer.canvas.height,
  )
  gl.uniform2f(
    compositeProgram.sourceResolutionLocation,
    renderer.sourceWidth,
    renderer.sourceHeight,
  )
  gl.uniform1f(compositeProgram.timeLocation, options.time)
  gl.uniform1f(compositeProgram.eventIntensityLocation, options.eventIntensity)
  gl.uniform1f(compositeProgram.eventLineLocation, options.eventLineY)
  gl.clearColor(0, 0, 0, 1)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}

export const renderCrtFrame = (
  renderer: CrtRenderer,
  sourceCanvas: HTMLCanvasElement,
  options: RenderCrtFrameOptions,
) => {
  if (options.uploadSource === true) {
    uploadSourceTexture(renderer, sourceCanvas)
  }

  const previousBurnTarget = renderer.burnInTargets[renderer.burnInIndex]
  const nextBurnIndex = renderer.burnInIndex === 0 ? 1 : 0
  const nextBurnTarget = renderer.burnInTargets[nextBurnIndex]
  const burnDecay = Math.min(0.1875, options.deltaTime * 3.6)

  if (options.uploadSource === true) {
    renderBlurPass(
      renderer,
      renderer.sourceTexture,
      {
        target: renderer.bloomTargets[0],
        directionX: 1,
        directionY: 0,
      },
    )
    renderBlurPass(
      renderer,
      renderer.bloomTargets[0].texture,
      {
        target: renderer.bloomTargets[1],
        directionX: 0,
        directionY: 1,
      },
    )
  }
  renderBurnInPass(renderer, nextBurnTarget, {
    previousTarget: previousBurnTarget,
    decay: burnDecay,
  })
  renderCompositePass(
    renderer,
    renderer.bloomTargets[1].texture,
    {
      ...options,
      burnInTexture: nextBurnTarget.texture,
    },
  )

  renderer.burnInIndex = nextBurnIndex
}

const destroyTextureTarget = (
  gl: WebGLRenderingContext,
  target: TextureTarget,
) => {
  gl.deleteTexture(target.texture)
  gl.deleteFramebuffer(target.framebuffer)
}

export const destroyCrtRenderer = (renderer: CrtRenderer | null) => {
  if (!renderer) {
    return
  }

  const { gl } = renderer
  gl.deleteTexture(renderer.sourceTexture)
  destroyTextureTarget(gl, renderer.bloomTargets[0])
  destroyTextureTarget(gl, renderer.bloomTargets[1])
  destroyTextureTarget(gl, renderer.burnInTargets[0])
  destroyTextureTarget(gl, renderer.burnInTargets[1])
  gl.deleteBuffer(renderer.quadBuffer)
  gl.deleteProgram(renderer.blurProgram.program)
  gl.deleteProgram(renderer.burnInProgram.program)
  gl.deleteProgram(renderer.compositeProgram.program)
}
