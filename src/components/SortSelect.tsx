'use client'

// 목록 정렬 선택 — 여러 화면에서 같은 모양으로 쓰는 공용 셀렉트
export default function SortSelect({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} title="정렬 방법"
      className="border border-gray-300 rounded-lg pl-2.5 pr-7 py-2 text-sm text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 cursor-pointer">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
