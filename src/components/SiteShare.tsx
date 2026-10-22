'use client'

// 현장정보 카드(눌러서 한 칸씩 복사) + 반장님께 '카톡으로 일정 보내기'
// 현장 수정에 적어 둔 주소·출입 비밀번호·주의사항이 일정 문구에 같이 실려 나간다.
import { useState } from 'react'
import type { Project, Schedule } from '@/lib/supabase'
import { parseDate, todayStart } from '@/components/ProjectGantt'
import { toast } from '@/components/Toaster'

const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const mdw = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})`
const COMPANY = 'JM건축인테리어'

async function copyText(text: string, label = '복사했어요') {
  try {
    await navigator.clipboard.writeText(text)
    toast(label)
  } catch {
    // http 환경·권한 거부 등 — 옛 방식으로 한 번 더
    const ta = document.createElement('textarea')
    ta.value = text; document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy'); ta.remove()
    toast(ok ? label : '복사하지 못했어요 — 길게 눌러 직접 복사해 주세요')
  }
}

export function SiteInfoCard({ project, readOnly, onEdit, onShare }: {
  project: Project
  readOnly: boolean
  onEdit: () => void
  onShare: () => void
}) {
  const rows: { k: string; v?: string | null }[] = [
    { k: '주소', v: project.address },
    { k: '공동현관', v: project.entry_code },
    { k: '세대', v: project.door_code },
    { k: '고객', v: project.client_name },
  ]
  const empty = rows.every(r => !r.v) && !project.site_notes
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-gray-700">현장정보 <span className="font-normal text-gray-400">· 누르면 그 칸만 복사</span></h3>
        {!readOnly && <button onClick={onEdit} className="text-xs text-green-600 hover:text-green-700">수정</button>}
      </div>
      {empty ? (
        <button onClick={onEdit} disabled={readOnly} className="w-full text-left text-sm text-gray-400 py-2">
          주소·출입 비밀번호·주의사항을 적어 두면 반장님께 일정 보낼 때 같이 나가요{!readOnly && <span className="text-green-600"> → 적기</span>}
        </button>
      ) : (
        <div className="flex flex-col">
          {rows.filter(r => r.v).map(r => (
            <button key={r.k} onClick={() => copyText(r.v!, `${r.k} 복사했어요`)}
              className="flex items-center gap-3 py-2 border-t border-gray-100 first:border-t-0 text-left hover:bg-gray-50 -mx-2 px-2 rounded">
              <span className="text-xs text-gray-400 w-14 flex-shrink-0">{r.k}</span>
              <span className="text-sm text-gray-800 flex-1 min-w-0 break-all">{r.v}</span>
              <span className="text-xs text-gray-300">복사</span>
            </button>
          ))}
          {project.site_notes && (
            <div className="flex gap-3 py-2 border-t border-gray-100">
              <span className="text-xs text-gray-400 w-14 flex-shrink-0">주의사항</span>
              <span className="text-sm text-gray-700 flex-1 whitespace-pre-line">{project.site_notes}</span>
            </div>
          )}
        </div>
      )}
      <button onClick={onShare} className="mt-3 w-full py-3 rounded-xl border border-green-600 text-green-700 font-semibold text-sm hover:bg-green-50">
        📨 카톡으로 일정 보내기
      </button>
    </div>
  )
}

export function ScheduleShareModal({ project, schedules, onClose }: {
  project: Project
  schedules: Schedule[]
  onClose: () => void
}) {
  const today = todayStart()
  // 오늘 이후(진행 중 포함) 공정만, 날짜순
  const upcoming = schedules
    .map(s => ({ s, start: parseDate(s.scheduled_date), end: parseDate(s.end_date) }))
    .filter(r => r.start && (r.end || r.start)! >= today && (r.s.phase_status || '예정') !== '완료')
    .sort((a, b) => a.start!.getTime() - b.start!.getTime())
  // 기본은 앞으로 7일 — 공정이 많은 현장도 문구가 너무 길어지지 않게
  const [range, setRange] = useState<7 | 14 | 0>(7)
  const inRange = upcoming.filter(r => range === 0 || r.start!.getTime() <= today.getTime() + range * 86400000)
  const tasks = [...new Set(inRange.map(r => r.s.task_name))]
  const vendors = [...new Set(inRange.map(r => r.s.vendor).filter(Boolean))] as string[]
  const [off, setOff] = useState<Set<string>>(() => new Set())   // 빼기로 한 공정 (기본: 범위 안 전부 보냄)
  const [vendor, setVendor] = useState('')
  const [withInfo, setWithInfo] = useState(true)
  const pickTasks = new Set(tasks.filter(t => !off.has(t)))

  const rows = inRange.filter(r => vendor ? r.s.vendor === vendor : pickTasks.has(r.s.task_name))
  const lines: string[] = [`안녕하세요 ${COMPANY}입니다.`, `[${project.name}] 일정 공유드립니다.`, '']
  if (rows.length === 0) lines.push('(보낼 일정이 없어요)')
  rows.forEach(r => {
    const range = r.end && r.end > r.start! ? `${mdw(r.start!)}~${mdw(r.end)}` : mdw(r.start!)
    lines.push(`📅 ${range} ${r.s.task_name}${r.s.vendor && !vendor ? ` (${r.s.vendor})` : ''}${r.s.vendor_booked ? ' ✔확정' : ''}`)
  })
  if (withInfo) {
    const info: string[] = []
    if (project.address) info.push(`📍 ${project.address}`)
    const codes = [project.entry_code && `공동현관 ${project.entry_code}`, project.door_code && `세대 ${project.door_code}`].filter(Boolean)
    if (codes.length) info.push(`🔑 ${codes.join(' / ')}`)
    if (project.site_notes) info.push(`⚠️ ${project.site_notes.trim().split('\n').join('\n   ')}`)
    if (info.length) lines.push('', ...info)
  }
  const text = lines.join('\n')
  const canShare = typeof navigator !== 'undefined' && !!navigator.share

  const toggle = (t: string) => {
    setVendor('')
    setOff(prev => { const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n })
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-5 max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-gray-900">카톡으로 일정 보내기</h3>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">&times;</button>
        </div>
        <p className="text-xs text-gray-400 mb-2">보낼 공정을 고르세요 (완료 안 된 공정)</p>
        <div className="flex gap-1.5 mb-3">
          {([[7, '앞으로 7일'], [14, '2주'], [0, '전체']] as const).map(([v, label]) => (
            <button key={v} onClick={() => { setRange(v); setOff(new Set()); setVendor('') }}
              className={`flex-1 py-2 rounded-lg text-sm border ${range === v ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-600'}`}>{label}</button>
          ))}
        </div>

        {tasks.length === 0 ? (
          <p className="text-sm text-gray-400 py-3">{upcoming.length > 0 ? '이 기간엔 공정이 없어요. 기간을 늘려 보세요.' : '앞으로 잡힌 공정이 없어요. 공정 탭에서 먼저 넣어 주세요.'}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => { setVendor(''); setOff(pickTasks.size === tasks.length ? new Set(tasks) : new Set()) }}
                className="px-3 py-1.5 rounded-full text-xs border border-gray-300 text-gray-500">{pickTasks.size === tasks.length && !vendor ? '전체 해제' : '전체'}</button>
              {tasks.map(t => (
                <button key={t} onClick={() => toggle(t)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${!vendor && pickTasks.has(t) ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-gray-200 text-gray-600'}`}>{t}</button>
              ))}
            </div>
            {vendors.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-gray-400 mb-1.5">협력업체로 골라 보내기</p>
                <div className="flex flex-wrap gap-1.5">
                  {vendors.map(v => (
                    <button key={v} onClick={() => setVendor(vendor === v ? '' : v)}
                      className={`px-3 py-1.5 rounded-full text-sm border ${vendor === v ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-gray-200 text-gray-600'}`}>🔨 {v}</button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <label className="flex items-center gap-2 mt-4 text-sm text-gray-600">
          <input type="checkbox" checked={withInfo} onChange={e => setWithInfo(e.target.checked)} className="w-4 h-4 accent-green-600" />
          주소·출입 비밀번호·주의사항 같이 보내기
        </label>

        <div className="mt-3 bg-[#b2c7d9] rounded-xl p-3">
          <div className="bg-[#fef01b] rounded-lg px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-line text-gray-900 break-keep">{text}</div>
        </div>
        {withInfo && !project.address && !project.entry_code && !project.site_notes && (
          <p className="text-xs text-amber-600 mt-2">현장 수정에서 주소·출입 비밀번호·주의사항을 적어 두면 여기 같이 나가요</p>
        )}

        <div className="flex gap-2 mt-4">
          <button onClick={() => copyText(text, '복사했어요 — 카톡에 붙여넣으세요')} disabled={rows.length === 0}
            className="flex-1 py-3 rounded-xl bg-green-600 text-white font-semibold text-sm disabled:opacity-40">복사하기</button>
          {canShare && (
            <button onClick={() => navigator.share({ text }).catch(() => {})} disabled={rows.length === 0}
              className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold text-sm disabled:opacity-40">카톡 등으로 공유</button>
          )}
        </div>
      </div>
    </div>
  )
}
