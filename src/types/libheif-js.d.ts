declare module 'libheif-js/wasm-bundle' {
  interface HeifImage {
    get_width(): number
    get_height(): number
    display(image: { data: Uint8ClampedArray; width: number; height: number }, callback: (result: ImageData | null) => void): void
    free(): void
  }
  const libheif: {
    HEAPU8: Uint8Array
    _heif_get_global_security_limits(): number
    _heif_get_disabled_security_limits(): number
    HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] }
  }
  export default libheif
}
