'use client'

import Link from 'next/link'

// 공개 회원가입 폐쇄 (2026-08-11) — 계정은 관리자가 [회원 관리 > 직원 추가]로만 생성(초대)한다.
// 예전 링크로 들어온 사람을 위해 페이지는 남겨두고 안내만 표시.
export default function SignupClosedPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-14 h-14 bg-green-600 rounded-2xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">JM</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">초대제 가입</h1>
        <p className="text-sm text-gray-500 mb-1">JM 관리 시스템은 관리자 초대로만 가입할 수 있어요.</p>
        <p className="text-sm text-gray-500 mb-6">관리자(대표)에게 계정 생성을 요청하세요.<br />계정을 받으면 알려준 이메일·비밀번호로 로그인하면 됩니다.</p>
        <Link href="/login" className="inline-block bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700">
          로그인 하러 가기
        </Link>
      </div>
    </div>
  )
}
