export {}

self.onmessage = async (event: MessageEvent<File>) => {
  try {
    const L = (await import('libheif-js/wasm-bundle')).default
    // libheif-js 1.19.8: security_limits is 64 bytes. Confined to this disposable worker.
    const globalLimits = L._heif_get_global_security_limits()
    const disabledLimits = L._heif_get_disabled_security_limits()
    L.HEAPU8.copyWithin(globalLimits, disabledLimits, disabledLimits + 64)
    const images = new L.HeifDecoder().decode(new Uint8Array(await event.data.arrayBuffer()))
    try {
      const image = images[0]
      if (!image) throw new Error('No HEIC image')
      const width = image.get_width()
      const height = image.get_height()
      if (width <= 0 || height <= 0) throw new Error('Invalid HEIC dimensions')
      let pixels: Uint8ClampedArray<ArrayBuffer> | null = new Uint8ClampedArray(width * height * 4)
      await new Promise<void>((resolve, reject) => {
        image.display({ data: pixels!, width, height }, result => {
          if (result) resolve()
          else reject(new Error('HEIC display failed'))
        })
      })
      const scale = Math.min(1, 2400 / Math.max(width, height))
      const output = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)))
      const context = output.getContext('2d')
      // Avoid another full-resolution canvas (~800 MB for a 200 MP photo).
      const strip = new OffscreenCanvas(width, 128)
      const stripContext = strip.getContext('2d')
      if (!context || !stripContext) throw new Error('Canvas unavailable')
      for (let y = 0; y < height; y += 128) {
        const rows = Math.min(128, height - y)
        const data = new ImageData(new Uint8ClampedArray(pixels.buffer, y * width * 4, rows * width * 4), width, rows)
        stripContext.putImageData(data, 0, 0)
        const top = Math.round(y * output.height / height)
        const bottom = Math.round((y + rows) * output.height / height)
        if (bottom > top) context.drawImage(strip, 0, 0, width, rows, 0, top, output.width, bottom - top)
      }
      pixels = null
      strip.width = strip.height = 1
      // Lossless small intermediate; existing compressImage applies WebP 80% next.
      const blob = await output.convertToBlob({ type: 'image/png' })
      output.width = output.height = 1
      self.postMessage({ blob })
    } finally {
      for (const image of images) image.free()
    }
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'HEIC conversion failed' })
  }
}
