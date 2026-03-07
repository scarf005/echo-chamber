import { createProgram, createTexture, QUAD } from "./utils.js"
import * as shaders from "./shaders.js"
import Palette from "./palette.js"

const VERTICES_PER_TILE = 6

export default class Scene {
  constructor(options, palette = Palette.default()) {
    this._data = {
      glyph: new Uint16Array(),
      style: new Uint16Array(),
    }
    this._buffers = {}
    this._attribs = {}
    this._uniforms = {}
    this._drawRequested = false
    this._gl = this._initGL()
    this.configure(options)
    this.palette = palette
  }

  get node() {
    return this._gl.canvas
  }

  configure(options) {
    const gl = this._gl
    const uniforms = this._uniforms

    if (options.tileCount || options.tileSize) {
      const node = this.node
      const tileSize = options.tileSize || [
        node.width / this._tileCount[0],
        node.height / this._tileCount[1],
      ]
      const tileCount = options.tileCount || this._tileCount
      node.width = tileCount[0] * tileSize[0]
      node.height = tileCount[1] * tileSize[1]
      gl.viewport(0, 0, node.width, node.height)
      gl.uniform2ui(uniforms.viewportSize, node.width, node.height)
    }

    if (options.tileCount) {
      this._tileCount = options.tileCount
      this._createGeometry(this._tileCount)
      this._createData(this._tileCount[0] * this._tileCount[1])
    }

    options.tileSize && gl.uniform2uiv(uniforms.tileSize, options.tileSize)
    options.font && this._uploadFont(options.font)
  }

  get palette() {
    return this._palette
  }

  set palette(palette) {
    if (this._palette) {
      this._palette.scene = null
    }

    this._palette = palette
    this._palette.scene = this
  }

  draw(position, glyph, fg, bg) {
    let index = position[1] * this._tileCount[0] + position[0]
    index *= VERTICES_PER_TILE
    this._data.glyph[index + 2] = glyph
    this._data.glyph[index + 5] = glyph
    const style = (bg << 8) + fg
    this._data.style[index + 2] = style
    this._data.style[index + 5] = style
    this._requestDraw()
  }

  clear(bg = 0) {
    const gl = this._gl
    this._palette.updateClearColor(gl, bg)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  uploadPaletteData(data) {
    const gl = this._gl
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this._textures.palette)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data)
    this._requestDraw()
  }

  _initGL() {
    const node = document.createElement("canvas")
    const gl = node.getContext("webgl2")

    if (!gl) {
      throw new Error("WebGL 2 not supported")
    }

    const program = createProgram(gl, shaders.VS, shaders.FS)
    gl.useProgram(program)

    const attributeCount = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES)

    for (let index = 0; index < attributeCount; index += 1) {
      gl.enableVertexAttribArray(index)
      const info = gl.getActiveAttrib(program, index)
      this._attribs[info.name] = index
    }

    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS)

    for (let index = 0; index < uniformCount; index += 1) {
      const info = gl.getActiveUniform(program, index)
      this._uniforms[info.name] = gl.getUniformLocation(program, info.name)
    }

    gl.uniform1i(this._uniforms.font, 0)
    gl.uniform1i(this._uniforms.palette, 1)

    this._textures = {
      font: createTexture(gl),
      palette: createTexture(gl),
    }

    return gl
  }

  _createGeometry(size) {
    const gl = this._gl
    this._buffers.position && gl.deleteBuffer(this._buffers.position)
    this._buffers.uv && gl.deleteBuffer(this._buffers.uv)
    Object.assign(this._buffers, createGeometry(gl, this._attribs, size))
  }

  _createData(tileCount) {
    const gl = this._gl
    const attribs = this._attribs

    this._buffers.glyph && gl.deleteBuffer(this._buffers.glyph)
    this._buffers.style && gl.deleteBuffer(this._buffers.style)

    this._data.glyph = new Uint16Array(tileCount * VERTICES_PER_TILE)
    this._data.style = new Uint16Array(tileCount * VERTICES_PER_TILE)

    const glyph = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, glyph)
    gl.vertexAttribIPointer(attribs.glyph, 1, gl.UNSIGNED_SHORT, 0, 0)

    const style = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, style)
    gl.vertexAttribIPointer(attribs.style, 1, gl.UNSIGNED_SHORT, 0, 0)

    Object.assign(this._buffers, { glyph, style })
  }

  _requestDraw() {
    if (this._drawRequested) {
      return
    }

    this._drawRequested = true
    requestAnimationFrame(() => this._draw())
  }

  _draw() {
    const gl = this._gl
    this._drawRequested = false

    gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers.glyph)
    gl.bufferData(gl.ARRAY_BUFFER, this._data.glyph, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers.style)
    gl.bufferData(gl.ARRAY_BUFFER, this._data.style, gl.DYNAMIC_DRAW)
    gl.drawArrays(
      gl.TRIANGLES,
      0,
      this._tileCount[0] * this._tileCount[1] * VERTICES_PER_TILE,
    )
  }

  _uploadFont(pixels) {
    const gl = this._gl
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this._textures.font)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    this._requestDraw()
  }
}

function createGeometry(gl, attribs, size) {
  const tileCount = size[0] * size[1]
  const positionData = new Uint16Array(tileCount * QUAD.length)
  const uvData = new Uint8Array(tileCount * QUAD.length)
  let offset = 0

  for (let y = 0; y < size[1]; y += 1) {
    for (let x = 0; x < size[0]; x += 1) {
      QUAD.forEach((value) => {
        positionData[offset] = (offset % 2 ? y : x) + value
        uvData[offset] = value
        offset += 1
      })
    }
  }

  const position = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, position)
  gl.vertexAttribIPointer(attribs.position, 2, gl.UNSIGNED_SHORT, 0, 0)
  gl.bufferData(gl.ARRAY_BUFFER, positionData, gl.STATIC_DRAW)

  const uv = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, uv)
  gl.vertexAttribIPointer(attribs.uv, 2, gl.UNSIGNED_BYTE, 0, 0)
  gl.bufferData(gl.ARRAY_BUFFER, uvData, gl.STATIC_DRAW)

  return { position, uv }
}
