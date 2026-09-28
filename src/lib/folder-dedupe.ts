// NAS 등 저장 폴더 중복 방지 — '전체 저장' 시 폴더에 이미 있는 파일과 내용(SHA-256)이 같으면 건너뛴다.
// 파일 이름이 달라도(같은 사진을 여러 사람이 다른 이름으로 올린 경우) 내용이 같으면 같은 파일로 본다.
// 폴더 안 파일을 전부 읽으면 느리므로, 먼저 '크기'만 모아두고 크기가 같은 파일만 골라 지문을 비교한다.

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

type DirHandle = FileSystemDirectoryHandle & {
  values: () => AsyncIterableIterator<FileSystemHandle>
}

export class FolderIndex {
  private names = new Set<string>()
  private bySize = new Map<number, FileSystemFileHandle[]>()
  private hashCache = new Map<FileSystemFileHandle, string>()
  private known = new Set<string>() // 이미 확인한(또는 이번에 저장한) 내용 지문

  private constructor(private dir: FileSystemDirectoryHandle) {}

  // 폴더 맨 위 파일들의 이름·크기를 모은다 (하위 폴더는 보지 않음)
  static async scan(dir: FileSystemDirectoryHandle): Promise<FolderIndex> {
    const idx = new FolderIndex(dir)
    for await (const h of (dir as DirHandle).values()) {
      if (h.kind !== 'file') continue
      const fh = h as FileSystemFileHandle
      idx.names.add(fh.name.toLowerCase())
      try {
        const size = (await fh.getFile()).size
        const list = idx.bySize.get(size) || []
        list.push(fh)
        idx.bySize.set(size, list)
      } catch { /* 읽기 실패 파일은 비교 대상에서 제외 */ }
    }
    return idx
  }

  // 같은 내용의 파일이 폴더에 이미 있는지 (있으면 true)
  async hasSameContent(blob: Blob, hash: string): Promise<boolean> {
    if (this.known.has(hash)) return true
    for (const fh of this.bySize.get(blob.size) || []) {
      let h = this.hashCache.get(fh)
      if (!h) {
        try { h = await sha256Hex(await fh.getFile()) } catch { continue }
        this.hashCache.set(fh, h)
      }
      if (h === hash) { this.known.add(hash); return true }
    }
    return false
  }

  // 겹치지 않는 이름 (이름만 같고 내용이 다른 파일을 덮어쓰지 않게 _2, _3 … 을 붙인다)
  freeName(name: string): string {
    if (!this.names.has(name.toLowerCase())) return name
    const dot = name.lastIndexOf('.')
    const base = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    for (let n = 2; ; n++) {
      const cand = `${base}_${n}${ext}`
      if (!this.names.has(cand.toLowerCase())) return cand
    }
  }

  async write(name: string, blob: Blob, hash: string): Promise<void> {
    const fh = await this.dir.getFileHandle(name, { create: true })
    const ws = await fh.createWritable()
    await ws.write(blob)
    await ws.close()
    this.names.add(name.toLowerCase())
    this.known.add(hash)
  }
}

// 시스템 안 중복 — 원본 지문(file_hash)이 같은 자료는 먼저 올라온 1개만 남긴다
export function uniqueByOriginal<T extends { file_hash?: string | null; created_at: string }>(list: T[]): { keep: T[]; dropped: number } {
  const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const seen = new Set<string>()
  const keep: T[] = []
  for (const f of sorted) {
    if (f.file_hash) {
      if (seen.has(f.file_hash)) continue
      seen.add(f.file_hash)
    }
    keep.push(f)
  }
  return { keep, dropped: list.length - keep.length }
}
