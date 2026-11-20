export function isHeic(file: File) {
  return /\.(heic|heif)$/i.test(file.name) || /^image\/hei(c|f)/i.test(file.type)
}

// A fresh worker per photo releases the WASM heap, including its high-water mark.
export function convertHeic(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./heic.worker.ts', import.meta.url), { type: 'module' })
    const finish = (error?: Error, blob?: Blob) => {
      clearTimeout(timer)
      worker.terminate()
      if (error || !blob) reject(error || new Error('HEIC conversion failed'))
      else resolve(new File([blob], file.name.replace(/\.[^.]+$/, '') + '.png', {
        type: 'image/png', lastModified: file.lastModified,
      }))
    }
    const timer = setTimeout(() => finish(new Error('HEIC conversion timed out')), 90_000)
    worker.onmessage = (event: MessageEvent<{ blob?: Blob; error?: string }>) => {
      finish(event.data.error ? new Error(event.data.error) : undefined, event.data.blob)
    }
    worker.onerror = () => finish(new Error('HEIC worker failed'))
    worker.onmessageerror = () => finish(new Error('HEIC worker message failed'))
    try { worker.postMessage(file) } catch (error) { finish(error as Error) }
  })
}
