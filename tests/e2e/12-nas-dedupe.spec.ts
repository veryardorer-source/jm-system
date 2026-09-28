import { test, expect } from '@playwright/test'
import { login, adminClient } from './helpers'

// ⑫ NAS 중복 방지 — '⤓ 전체 저장' 시
//  · 저장 폴더에 이미 있는 사진(이름이 달라도 내용이 같으면) 건너뜀
//  · 시스템 안에 같은 원본(file_hash)이 여러 번 올라온 건 1개만 저장
//  · 이름만 같고 내용이 다른 파일은 덮어쓰지 않고 _2 붙여 저장
// 실제 폴더 선택창은 자동화가 안 되므로 브라우저 내부 폴더(OPFS)로 대신한다.

const bytes = (s: string) => Buffer.from(s.repeat(50))

test('전체 저장은 이미 받은 사진과 같은 사진 중복을 건너뛴다', async ({ page }) => {
  const admin = adminClient()
  const { data: proj } = await admin.from('projects').insert([{ name: 'E2E_NAS현장', status: '시공중' }]).select('id').single()
  const pid = proj!.id as string
  const up = async (key: string, body: Buffer) => {
    const path = `e2e/${pid}/${key}.png`
    await admin.storage.from('uploads').upload(path, body, { contentType: 'image/png', upsert: true })
    return admin.storage.from('uploads').getPublicUrl(path).data.publicUrl
  }
  const urlA = await up('a', bytes('AAAA'))
  const urlA2 = await up('a2', bytes('AAAA')) // 같은 원본을 다른 사람이 다른 이름으로
  const urlB = await up('b', bytes('BBBB'))
  const urlC = await up('c', bytes('CCCC'))
  const row = (name: string, url: string, hash: string, t: string) => ({
    project_id: pid, file_name: name, file_url: url, file_type: 'image/png', category: '시공사진',
    memo: '', uploaded_by: 'E2E', file_hash: hash, created_at: t,
  })
  await admin.from('project_files').insert([
    row('20260901_현장A.png', urlA, 'hashA', '2026-09-01T00:00:00Z'),
    row('20260902_카톡A.png', urlA2, 'hashA', '2026-09-02T00:00:00Z'),
    row('20260903_B.png', urlB, 'hashB', '2026-09-03T00:00:00Z'),
    row('20260904_C.png', urlC, 'hashC', '2026-09-04T00:00:00Z'),
  ])

  try {
    await login(page, 'e2e-admin@jmtest.local')
    await page.goto(`/projects/${pid}`)
    await page.getByRole('button', { name: '자료', exact: true }).click()
    // 폴더 선택창 → 브라우저 내부 폴더(OPFS). B는 NAS에 이미 다른 이름으로, C와 같은 이름의 '다른' 파일도 있음
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory()
      for await (const name of (root as unknown as { keys: () => AsyncIterable<string> }).keys()) await root.removeEntry(name, { recursive: true })
      const put = async (name: string, text: string) => {
        const w = await (await root.getFileHandle(name, { create: true })).createWritable()
        await w.write(new Blob([text.repeat(50)])); await w.close()
      }
      await put('옛날에_받은_B.png', 'BBBB')
      await put('20260904_C.png', 'ZZZZ')
      ;(window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () => root
    })
    const listNames = () => page.evaluate(async () => {
      const root = await navigator.storage.getDirectory()
      const out: string[] = []
      for await (const n of (root as unknown as { keys: () => AsyncIterable<string> }).keys()) out.push(n)
      return out.sort()
    })

    const saveBtn = page.getByRole('button', { name: '⤓ 전체 저장' }).first()
    await saveBtn.click()
    await expect(page.getByText('새로 2개 저장 · 이미 있는 1개 건너뜀 · 같은 사진 중복 1개 제외')).toBeVisible({ timeout: 20_000 })
    const names = await listNames()
    expect(names).toContain('20260904_C_2.png') // 이름만 같은 다른 파일은 덮어쓰지 않음
    expect(names.filter(n => n.includes('A'))).toHaveLength(1) // 같은 원본 A는 한 번만
    expect(names).toHaveLength(4)

    // 다시 전체 저장 → 새로 받을 것 없음
    await saveBtn.click()
    await expect(page.getByText('새로 0개 저장 · 이미 있는 3개 건너뜀 · 같은 사진 중복 1개 제외')).toBeVisible({ timeout: 20_000 })
    expect(await listNames()).toHaveLength(4)
  } finally {
    await admin.storage.from('uploads').remove(['a', 'a2', 'b', 'c'].map(k => `e2e/${pid}/${k}.png`))
  }
})
