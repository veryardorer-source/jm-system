'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

// 비밀번호 재설정 — 관리자가 발급한 링크(/reset?t=...)에서 새 비밀번호를 정하는 화면.
function ResetInner() {
  const router = useRouter()
  const token = useSearchParams().get('t') || ''
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pw.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return }
    if (pw !== pw2) { setError('비밀번호가 일치하지 않습니다.'); return }
    setSaving(true)
    setError('')
    const res = await fetch('/api/reset/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: pw }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || '오류가 발생했습니다'); setSaving(false); return }
    const supabase = createClient()
    const { error: loginErr } = await supabase.auth.signInWithPassword({ email: data.email, password: pw })
    setSaving(false)
    if (loginErr) { router.push('/login'); return }
    alert('비밀번호가 변경됐어요!')
    router.push('/')
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 bg-amber-400 rounded-2xl flex items-center justify-center text-white text-2xl mx-auto mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">잘못된 링크예요</h1>
          <p className="text-sm text-gray-500 mb-6">카톡으로 받은 링크 전체를 다시 눌러보세요.</p>
          <Link href="/login" className="inline-block bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700">로그인 화면으로</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-green-600 rounded-2xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">JM</div>
          <h1 className="text-2xl font-bold text-gray-900">비밀번호 재설정</h1>
          <p className="text-sm text-gray-500 mt-1">새로 사용할 비밀번호를 정해주세요</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">새 비밀번호 <span className="text-gray-400 font-normal">(8자 이상)</span></label>
              <input type="password" required minLength={8} value={pw} onChange={e => setPw(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">비밀번호 확인</label>
              <input type="password" required value={pw2} onChange={e => setPw2(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <button type="submit" disabled={saving}
              className="bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {saving ? '변경 중...' : '비밀번호 변경하기'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function ResetPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중...</div>}>
      <ResetInner />
    </Suspense>
  )
}
