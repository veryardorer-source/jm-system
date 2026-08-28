'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

// 초대 수락 — 카톡으로 받은 초대 링크(/invite?t=...)에서 비밀번호를 직접 정하는 화면.
// 비밀번호를 정하는 순간 계정이 만들어지고 자동 로그인된다.
function InviteInner() {
  const router = useRouter()
  const token = useSearchParams().get('t') || ''
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [doneAlready, setDoneAlready] = useState(false) // 이미 가입 완료된 초대 링크를 다시 연 경우

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pw.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return }
    if (pw !== pw2) { setError('비밀번호가 일치하지 않습니다.'); return }
    setSaving(true)
    setError('')
    const res = await fetch('/api/invite/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: pw }),
    })
    const data = await res.json()
    if (!res.ok) {
      // 이미 가입이 끝난 초대(링크를 다시 연 경우) → 오류 대신 로그인으로 안내
      if (/이미 사용|이미 가입/.test(data.error || '')) { setDoneAlready(true); setSaving(false); return }
      setError(data.error || '오류가 발생했습니다'); setSaving(false); return
    }
    // 만든 계정으로 바로 로그인
    const supabase = createClient()
    const { error: loginErr } = await supabase.auth.signInWithPassword({ email: data.email, password: pw })
    setSaving(false)
    if (loginErr) { router.push('/login'); return } // 계정은 만들어졌으니 로그인 화면에서 다시
    alert(`환영합니다, ${data.name}님! 비밀번호 설정이 완료됐어요.`)
    router.push('/')
  }

  if (doneAlready) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 bg-green-500 rounded-2xl flex items-center justify-center text-white text-2xl mx-auto mb-4">✓</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">이미 가입이 끝났어요</h1>
          <p className="text-sm text-gray-500 mb-2">이 초대 링크는 가입할 때 한 번만 쓰는 거예요.</p>
          <p className="text-sm text-gray-500 mb-6">
            앞으로는 <b>jm-interior.vercel.app</b> 주소로 접속해서<br />
            가입할 때 정한 <b>이메일·비밀번호로 로그인</b>하면 됩니다.<br />
            <span className="text-xs text-gray-400">(홈 화면 바로가기도 로그인 화면에서 다시 만들어 주세요)</span>
          </p>
          <Link href="/login" className="inline-block bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700">
            로그인 하러 가기
          </Link>
        </div>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 bg-amber-400 rounded-2xl flex items-center justify-center text-white text-2xl mx-auto mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">잘못된 초대 링크예요</h1>
          <p className="text-sm text-gray-500 mb-6">링크가 잘렸을 수 있어요. 카톡으로 받은 링크 전체를 다시 눌러보세요.</p>
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
          <h1 className="text-2xl font-bold text-gray-900">JM 관리 시스템 초대</h1>
          <p className="text-sm text-gray-500 mt-1">로그인할 때 쓸 비밀번호를 정해주세요</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">비밀번호 <span className="text-gray-400 font-normal">(8자 이상)</span></label>
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
              {saving ? '설정 중...' : '비밀번호 설정하고 시작하기'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중...</div>}>
      <InviteInner />
    </Suspense>
  )
}
