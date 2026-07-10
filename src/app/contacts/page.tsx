'use client'

import { useEffect, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { useAuth, canEdit } from '@/lib/auth-context'

type Contact = {
  id: string
  company: string
  category: string
  person: string
  phone: string
  memo: string
  created_by: string
  created_at: string
}

const CATEGORY_SUGGEST = ['목공', '전기', '설비', '타일', '도배', '필름', '도장', '철거', '금속', '유리', '간판', '자재', '가구', '기타']
const EMPTY = { company: '', category: '', person: '', phone: '', memo: '' }

export default function ContactsPage() {
  const { profile } = useAuth()
  const readOnly = !canEdit(profile)
  const [list, setList] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('전체')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => { fetchList() }, [])

  async function fetchList() {
    setLoading(true)
    const { data } = await supabase.from('contacts').select('*').order('company')
    setList(data || [])
    setLoading(false)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.company.trim()) return
    setSaving(true)
    const payload = { ...form, company: form.company.trim(), created_by: editing?.created_by || profile?.name || '' }
    const { error } = editing
      ? await supabase.from('contacts').update(payload).eq('id', editing.id)
      : await supabase.from('contacts').insert([payload])
    setSaving(false)
    if (error) { alert('저장 실패: ' + error.message + (error.message.includes('does not exist') ? '\n(관리자에게: db/contacts.sql 실행 필요)' : '')); return }
    setForm(EMPTY); setEditing(null); setShowForm(false)
    fetchList()
  }

  async function del(c: Contact) {
    if (!confirm(`"${c.company}" 연락처를 삭제할까요?`)) return
    await supabase.from('contacts').delete().eq('id', c.id)
    fetchList()
  }

  async function copyPhone(c: Contact) {
    await navigator.clipboard.writeText(c.phone)
    setCopiedId(c.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const cats = Array.from(new Set(list.map(c => c.category).filter(Boolean)))
  const filtered = list.filter(c => {
    if (cat !== '전체' && c.category !== cat) return false
    const s = q.trim().toLowerCase()
    if (!s) return true
    return [c.company, c.category, c.person, c.phone, c.memo].some(v => (v || '').toLowerCase().includes(s))
  })

  if (profile?.role === 'partner') return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">접근 권한이 없습니다.</div>
    </div>
  )

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900">거래처</h1>
            <p className="text-sm text-gray-500 mt-0.5">총 {list.length}곳 · 전화번호 탭하면 바로 전화</p>
          </div>
          {!readOnly && (
            <button onClick={() => { setEditing(null); setForm(EMPTY); setShowForm(true) }}
              className="bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700">+ 거래처 추가</button>
          )}
        </header>

        <div className="flex-1 overflow-auto px-4 md:px-8 py-4 md:py-6 pb-20 md:pb-6">
          {/* 검색 + 분야 필터 */}
          <div className="flex flex-col gap-2 mb-4 max-w-3xl">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="업체명·담당자·전화번호·메모 검색"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            {cats.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {['전체', ...cats].map(c => (
                  <button key={c} onClick={() => setCat(c)}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium ${cat === c ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-300 hover:border-green-400'}`}>
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">📇</p>
              <p className="font-medium">{list.length === 0 ? '등록된 거래처가 없어요' : '검색 결과가 없어요'}</p>
              {list.length === 0 && !readOnly && <p className="text-xs mt-2">우측 상단 <span className="text-green-600 font-medium">+ 거래처 추가</span>로 등록해 보세요</p>}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl">
              {filtered.map(c => (
                <div key={c.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 group">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-gray-900 truncate">{c.company}</p>
                    {c.category && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full flex-shrink-0">{c.category}</span>}
                  </div>
                  {c.person && <p className="text-sm text-gray-600 mt-1">{c.person}</p>}
                  {c.phone && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <a href={`tel:${c.phone.replace(/[^0-9+]/g, '')}`}
                        className="text-base font-medium text-green-700 hover:underline">📞 {c.phone}</a>
                      <button onClick={() => copyPhone(c)}
                        className="text-xs text-gray-400 hover:text-green-600 border border-gray-200 rounded px-1.5 py-0.5">
                        {copiedId === c.id ? '복사됨 ✓' : '복사'}
                      </button>
                    </div>
                  )}
                  {c.memo && <p className="text-xs text-gray-400 mt-1.5 whitespace-pre-wrap">{c.memo}</p>}
                  {!readOnly && (
                    <div className="flex gap-2 justify-end mt-2">
                      <button onClick={() => { setEditing(c); setForm({ company: c.company, category: c.category || '', person: c.person || '', phone: c.phone || '', memo: c.memo || '' }); setShowForm(true) }}
                        className="text-xs text-green-500 hover:text-green-700">수정</button>
                      <button onClick={() => del(c)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold">{editing ? '거래처 수정' : '거래처 추가'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={save} className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">업체명 *</label>
                <input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} required
                  placeholder="예) OO목재, OO전기"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">분야</label>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {CATEGORY_SUGGEST.map(c => (
                    <button type="button" key={c} onClick={() => setForm({ ...form, category: c })}
                      className={`text-xs px-2.5 py-1 rounded-full border ${form.category === c ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-300'}`}>
                      {c}
                    </button>
                  ))}
                </div>
                <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                  placeholder="직접 입력도 가능"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">담당자</label>
                <input value={form.person} onChange={e => setForm({ ...form, person: e.target.value })} placeholder="이름 (직함)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">전화번호</label>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} type="tel" placeholder="010-0000-0000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">메모</label>
                <textarea value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} rows={3}
                  placeholder="계좌번호, 단가, 특이사항 등"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y" />
              </div>
              <button type="submit" disabled={saving || !form.company.trim()}
                className="bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {saving ? '저장 중...' : editing ? '수정 저장' : '거래처 추가'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
