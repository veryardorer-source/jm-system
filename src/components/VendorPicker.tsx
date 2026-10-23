'use client'

// 공정 협력업체 고르기 + 업체 확정 — 공정을 누르면 뜨는 작은 창 안에서 바로 저장 (2026-10-23 시안 확정)
// 업체 목록 = [거래처] + 예전에 공정에 직접 적은 업체. 공정 이름과 분야가 맞는 업체가 먼저.
import { useEffect, useState } from 'react'
import { supabase, type Schedule } from '@/lib/supabase'
import { toast } from '@/components/Toaster'

type Vendor = { name: string; category: string }

// ProjectGantt가 이 파일을 불러 쓰므로 날짜 도우미는 여기 따로 둔다(서로 불러오기 방지)
const parseDate = (s?: string | null) => { const m = (s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null }
const todayStart = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t }

// 한 화면에서 여러 번 열어도 한 번만 불러온다
let vendorCache: Promise<Vendor[]> | null = null
function loadVendors(): Promise<Vendor[]> {
  if (!vendorCache) {
    vendorCache = Promise.all([
      supabase.from('contacts').select('company, category'),
      supabase.from('schedules').select('vendor').not('vendor', 'is', null),
    ]).then(([c, s]) => {
      const map = new Map<string, Vendor>()
      ;(c.data || []).forEach(x => { if (x.company) map.set(x.company, { name: x.company, category: x.category || '' }) })
      ;(s.data || []).forEach(x => { const v = (x.vendor || '').trim(); if (v && !map.has(v)) map.set(v, { name: v, category: '' }) })
      return [...map.values()]
    })
  }
  return vendorCache
}

function rememberVendors(list: Vendor[]) { vendorCache = Promise.resolve(list) }

// 거래처 분야(목공, 전기·조명 …)가 공정 이름에 들어 있으면 그 공정 업체로 본다
// 같은 일을 다르게 부르는 말 묶음 — "목작업" 공정에 분야 "목자재" 업체가 앞에 오게
const TRADE_WORDS = [
  ['목공', '목작업', '목자재', '목재', '목수', '목'],
  ['전기', '조명', '배선', '콘센트'],
  ['설비', '배관', '수도', '방수'],
  ['타일', '도기', '위생'],
  ['도배', '벽지'],
  ['필름', '인테리어필름', '시트'],
  ['도장', '페인트', '도색'],
  ['금속', '샷시', '창호', '유리', '철물'],
  ['경량', '천정', '천장', '벽체', '석고'],
  ['바닥', '마루', '데코타일', '장판'],
  ['가구', '싱크', '붙박이'],
  ['철거'], ['청소', '입주청소'], ['에어컨', '냉난방', '공조'], ['사인', '간판'], ['블라인드', '커튼'],
]
function matches(task: string, category: string) {
  const tokens = category.split(/[,/·\s]+/).filter(t => t.length >= 2)
  if (tokens.some(t => task.includes(t))) return true
  return TRADE_WORDS.some(g => g.some(w => w.length >= 2 ? task.includes(w) : task.startsWith(w)) && tokens.some(t => g.some(w => t.includes(w))))
}

export default function VendorPicker({ schedule, onUpdate }: { schedule: Schedule; onUpdate: (s: Schedule) => void }) {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [vendor, setVendor] = useState(schedule.vendor || '')
  const [booked, setBooked] = useState(!!schedule.vendor_booked)
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)

  useEffect(() => { let on = true; loadVendors().then(v => { if (on) setVendors(v) }); return () => { on = false } }, [])

  async function save(nextVendor: string, nextBooked: boolean) {
    const prev = { vendor, booked }
    const v = nextVendor.trim()
    const b = !!v && nextBooked
    setVendor(v); setBooked(b)
    const { error } = await supabase.from('schedules').update({ vendor: v || null, vendor_booked: b }).eq('id', schedule.id)
    if (error) { setVendor(prev.vendor); setBooked(prev.booked); toast('저장 실패: ' + error.message); return }
    // 직접 적은 업체는 다음부터 칩에 뜨게
    if (v && !vendors.some(x => x.name === v)) { const nv = [...vendors, { name: v, category: '' }]; setVendors(nv); rememberVendors(nv) }
    onUpdate({ ...schedule, vendor: v || null, vendor_booked: b })
    toast(!v ? '업체를 비웠어요' : b !== prev.booked && v === prev.vendor ? (b ? `${v} 확정` : `${v} 확정 풀었어요`) : `업체: ${v}`)
  }

  const task = schedule.task_name || ''
  const query = q.trim()
  const list = vendors
    .filter(v => !query || v.name.includes(query) || v.category.includes(query))
    .sort((a, b) => (+matches(task, b.category) - +matches(task, a.category)) || a.name.localeCompare(b.name, 'ko'))
  // 고른 업체는 항상 맨 앞에
  const chips = [...(vendor ? [vendors.find(v => v.name === vendor) || { name: vendor, category: '' }] : []),
    ...list.filter(v => v.name !== vendor)].slice(0, query ? 12 : 6)

  return (
    <div>
      <p className="text-xs text-gray-400 mt-4 mb-1.5">협력업체 <span className="text-gray-300">· 공정 이름과 분야가 맞는 업체가 먼저</span></p>
      <div className="flex flex-wrap gap-1.5">
        {chips.map(v => {
          const on = v.name === vendor
          return (
            <button key={v.name} onClick={() => save(on ? '' : v.name, on ? false : booked)}
              className={`px-3 py-1.5 rounded-full text-sm border flex items-center gap-1 ${on ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-green-400'}`}>
              {v.name}{v.category && <span className={`text-[10.5px] ${on ? 'text-green-100' : 'text-gray-400'}`}>{v.category}</span>}
            </button>
          )
        })}
        {!searching && (
          <button onClick={() => setSearching(true)} className="px-3 py-1.5 rounded-full text-sm border border-dashed border-gray-300 text-gray-500">🔍 다른 업체</button>
        )}
      </div>
      {searching && (
        <div className="flex gap-1.5 mt-2">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="업체명이나 분야로 찾기"
            onKeyDown={e => { if (e.key === 'Enter' && query) { save(query, booked); setQ(''); setSearching(false) } }}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500" />
          {query && !vendors.some(v => v.name === query) && (
            <button onClick={() => { save(query, booked); setQ(''); setSearching(false) }}
              className="px-3 rounded-lg bg-gray-900 text-white text-sm whitespace-nowrap">+ 직접 입력</button>
          )}
        </div>
      )}

      <button onClick={() => vendor ? save(vendor, !booked) : toast('업체를 먼저 골라 주세요')}
        className={`w-full mt-3 flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left ${booked ? 'border-green-600 bg-green-50' : 'border-gray-200 bg-white'} ${vendor ? '' : 'opacity-50'}`}>
        <span className={`w-6 h-6 rounded-md flex items-center justify-center text-sm font-bold flex-shrink-0 ${booked ? 'bg-green-600 text-white' : 'border-2 border-gray-300 text-transparent'}`}>✓</span>
        <span>
          <span className="block text-sm font-semibold text-gray-900">업체 확정</span>
          <span className="block text-xs text-gray-500">{booked ? '반장님과 날짜까지 정해졌어요' : '반장님과 날짜가 정해지면 눌러 두세요'}</span>
        </span>
      </button>
    </div>
  )
}

// 공정 옆에 붙는 업체 표시 — 업체 이름 + ✓(확정) / 미확정 / 업체 없음(2주 안 공정인데 비어 있을 때)
export function VendorMark({ s, small }: { s: Schedule; small?: boolean }) {
  const sz = small ? 'text-[10px]' : 'text-[11px]'
  if (s.vendor) return (
    <span className={`inline-flex items-center gap-1 align-middle ${sz}`}>
      <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-normal">{s.vendor}</span>
      {s.vendor_booked
        ? <span className="w-[15px] h-[15px] rounded-full bg-green-600 text-white text-[9px] font-bold inline-flex items-center justify-center" aria-label="확정">✓</span>
        : <span className="text-amber-600 font-semibold">미확정</span>}
    </span>
  )
  if (needsVendor(s)) return <span className={`px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 align-middle ${sz}`}>업체 없음</span>
  return null
}

// 앞으로 2주 안(또는 진행 중)인데 아직 업체가 비어 있는 공정
export function needsVendor(s: Schedule) {
  if (s.vendor || (s.phase_status || '예정') === '완료') return false
  const start = parseDate(s.scheduled_date); if (!start) return false
  const end = parseDate(s.end_date) || start
  const today = todayStart()
  const limit = new Date(today.getTime() + 14 * 86400000)
  return end >= today && start <= limit
}
