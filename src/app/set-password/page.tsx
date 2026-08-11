'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

// 비밀번호 설정 — 초대 메일 링크로 들어온 직원이 자기 비밀번호를 직접 정하는 화면.
// (링크의 로그인 토큰은 주소 #해시로 오고, supabase 클라이언트가 자동으로 세션을 만든다)
export default function SetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState<'checking' | 'ok' | 'expired'>('checking')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    let done = false
    // 해시 토큰 처리(SIGNED_IN)를 기다렸다가, 일정 시간 안에 세션이 없으면 만료로 판단
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session && !done) { done = true; setReady('ok') }
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !done) { done = true; setReady('ok') }
    })
    const timer = setTimeout(() => { if (!done) setReady('expired') }, 4000)
    return () => { subscription.unsubscribe(); clearTimeout(timer) }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pw.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return }
    if (pw !== pw2) { setError('비밀번호가 일치하지 않습니다.'); return }
    setSaving(true)
    setError('')
    const supabase = createClient()
    const { error: upErr } = await supabase.auth.updateUser({ password: pw })
    setSaving(false)
    if (upErr) { setError('설정 실패: ' + upErr.message); return }
    alert('비밀번호가 설정되었습니다. 이제 시스템을 사용할 수 있어요!')
    router.push('/')
  }

  if (ready === 'checking') {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">확인 중...</div>
  }

  if (ready === 'expired') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 bg-amber-400 rounded-2xl flex items-center justify-center text-white text-2xl mx-auto mb-4">⏳</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">링크가 만료됐어요</h1>
          <p className="text-sm text-gray-500 mb-6">초대 링크는 일정 시간이 지나면 만료돼요.<br />관리자에게 초대 메일을 다시 보내달라고 요청하세요.</p>
          <Link href="/login" className="inline-block bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700">
            로그인 화면으로
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-green-600 rounded-2xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">JM</div>
          <h1 className="text-2xl font-bold text-gray-900">비밀번호 설정</h1>
          <p className="text-sm text-gray-500 mt-1">앞으로 로그인할 때 쓸 비밀번호를 정해주세요</p>
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
              {saving ? '설정 중...' : '비밀번호 설정하고 시작하기'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
