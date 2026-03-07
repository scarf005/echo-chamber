export default class Palette {
  constructor() {
    this._length = 0
    this._scene = null
    const canvas = document.createElement("canvas")
    canvas.width = 256
    canvas.height = 1
    this._ctx = canvas.getContext("2d")
  }

  static default() {
    return this.fromArray(["black", "white"])
  }

  static fromArray(data) {
    const palette = new this()
    data.forEach((color) => palette.add(color))
    return palette
  }

  set scene(scene) {
    this._scene = scene
    scene && scene.uploadPaletteData(this._ctx.canvas)
  }

  get length() {
    return this._length
  }

  updateClearColor(gl, index) {
    const ctx = this._ctx
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height)
    const offset = index * 4
    const { data } = imageData
    gl.clearColor(
      data[offset + 0] / 255,
      data[offset + 1] / 255,
      data[offset + 2] / 255,
      data[offset + 3] / 255,
    )
  }

  set(index, color) {
    const ctx = this._ctx
    ctx.fillStyle = color
    ctx.fillRect(index, 0, 1, 1)
    this._scene && this._scene.uploadPaletteData(ctx.canvas)
    return index
  }

  add(color) {
    return this.set(this._length++, color)
  }

  clear() {
    const ctx = this._ctx
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    this._length = 0
  }
}
