'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const CHANNELS = [
  { key: 'blog', label: '블로그' },
  { key: 'instagram', label: '인스타' },
]
const TYPES = ['디자인', '시공', '마감']
const STATUSES = ['계획중', '작성중', '발행완료']
const STATUS_STYLE: Record<string, string> = {
  '계획중': 'bg-gray-100 text-gray-600 border-gray-300',
  '작성중': 'bg-amber-100 text-amber-700 border-amber-300',
  '발행완료': 'bg-green-100 text-green-700 border-green-300',
}

type Slot = { status: string; content: string; link: string; saving?: boolean; saved?: boolean; drafting?: boolean }

export default function SnsTab({ projectId, readOnly = false }: { projectId: string; readOnly?: boolean }) {
  const [slots, setSlots] = useState<Record<string, Slot>>({})
  const [loading, setLoading] = useState(true)

  const keyOf = (ch: string, t: string) => `${ch}|${t}`

  useEffect(() => {
    let on = true
    async function load() {
      const { data } = await supabase.from('sns_posts').select('*').eq('project_id', projectId)
      if (!on) return
      const map: Record<string, Slot> = {}
      for (const ch of CHANNELS) for (const t of TYPES) map[keyOf(ch.key, t)] = { status: '계획중', content: '', link: '' }
      for (const row of data || []) {
        map[keyOf(row.channel, row.post_type)] = { status: row.status || '계획중', content: row.content || '', link: row.link || '' }
      }
      setSlots(map); setLoading(false)
    }
    load()
    return () => { on = false }
  }, [projectId])

  function update(k: string, patch: Partial<Slot>) {
    setSlots(prev => ({ ...prev, [k]: { ...prev[k], ...patch, saved: false } }))
  }

  async function save(ch: string, t: string) {
    const k = keyOf(ch, t)
    const s = slots[k]
    update(k, { saving: true })
    const { error } = await supabase.from('sns_posts').upsert({
      project_id: projectId, channel: ch, post_type: t,
      status: s.status, content: s.content, link: s.link,
      published_at: s.status === '발행완료' ? new Date().toISOString() : null,
    }, { onConflict: 'project_id,channel,post_type' })
    update(k, { saving: false, saved: !error })
    if (error) alert('저장 실패: ' + error.message)
  }

  async function generateDraft(ch: string, t: string) {
    const k = keyOf(ch, t)
    update(k, { drafting: true })
    try {
      const res = await fetch('/api/sns/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, channel: ch, postType: t }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'AI 초안 작성 실패'); return }
      update(k, { content: data.content, status: slots[k].status === '계획중' ? '작성중' : slots[k].status })
    } catch {
      alert('AI 초안 작성 중 오류가 발생했어요')
    } finally {
      update(k, { drafting: false })
    }
  }

  if (loading) return <div className="text-center text-gray-400 py-16">불러오는 중...</div>

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-500">현장 1곳당 <b>디자인 · 시공 · 마감</b> 포스팅을 블로그·인스타별로 관리하세요. (초안을 적어두고 네이버/인스타에 붙여넣어 발행)</p>
      {CHANNELS.map(ch => (
        <div key={ch.key}>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">{ch.key === 'blog' ? '📝' : '📷'} {ch.label}</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {TYPES.map(t => {
              const k = keyOf(ch.key, t)
              const s = slots[k] || { status: '계획중', content: '', link: '' }
              return (
                <div key={k} className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">{t} 포스팅</span>
                    {readOnly ? (
                      <span className={`text-xs px-2 py-1 rounded-full border font-medium ${STATUS_STYLE[s.status] || ''}`}>{s.status}</span>
                    ) : (
                      <select value={s.status} onChange={e => update(k, { status: e.target.value })}
                        className={`text-xs px-2 py-1 rounded-full border font-medium ${STATUS_STYLE[s.status] || ''}`}>
                        {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                      </select>
                    )}
                  </div>
                  {!readOnly && (
                    <div className="flex justify-end">
                      <button onClick={() => generateDraft(ch.key, t)} disabled={s.drafting}
                        className="text-xs border border-green-300 text-green-700 bg-green-50 px-3 py-1.5 rounded-lg hover:bg-green-100 disabled:opacity-50">
                        {s.drafting ? 'AI 작성 중...' : '✨ AI 초안 작성'}
                      </button>
                    </div>
                  )}
                  {readOnly ? (
                    <p className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap min-h-[5rem]">{s.content || <span className="text-gray-400">내용 없음</span>}</p>
                  ) : (
                    <textarea value={s.content} onChange={e => update(k, { content: e.target.value })}
                      placeholder="초안 내용 (제목/본문)을 적어두세요. 위 'AI 초안 작성'을 누르면 해당 단계 사진을 보고 자동으로 채워줘요."
                      rows={4}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
                  )}
                  {!readOnly && (
                    <input value={s.link} onChange={e => update(k, { link: e.target.value })}
                      placeholder="발행 링크 (URL)"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  )}
                  <div className="flex items-center justify-between">
                    {s.link ? <a href={s.link} target="_blank" rel="noreferrer" className="text-xs text-green-600 hover:underline">발행글 열기 ↗</a> : <span />}
                    {!readOnly && (
                      <button onClick={() => save(ch.key, t)} disabled={s.saving}
                        className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50">
                        {s.saving ? '저장 중...' : s.saved ? '저장됨 ✓' : '저장'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <p className="text-xs text-gray-400">※ AI 초안은 디자인=현장사진·도면·3D, 시공=시공사진, 마감=마감사진 카테고리의 최근 자료를 보고 작성돼요. 부족하면 같은 현장의 다른 자료로 보충돼요. 해당 자료가 없으면 먼저 자료 탭에서 올려주세요.</p>
    </div>
  )
}
