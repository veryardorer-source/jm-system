'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

type Message = {
  id: string
  sender_id: string | null
  sender_name: string | null
  content: string
  created_at: string
}

export default function ChatPage() {
  const { profile } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    let active = true
    async function load() {
      const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(300)
      if (active) { setMessages(data || []); setLoading(false) }
    }
    load()

    const channel = supabase
      .channel('messages-room')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        payload => setMessages(prev => prev.some(m => m.id === (payload.new as Message).id) ? prev : [...prev, payload.new as Message]))
      .subscribe()

    return () => { active = false; supabase.removeChannel(channel) }
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const content = text.trim()
    if (!content) return
    setSending(true)
    const { error } = await supabase.from('messages').insert([{
      sender_id: profile?.id ?? null,
      sender_name: profile?.name ?? '직원',
      content,
    }])
    setSending(false)
    if (error) { alert('전송 실패: ' + error.message); return }
    setText('')
  }

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col h-screen">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 flex-shrink-0">
          <h1 className="text-xl font-bold text-gray-900">채팅</h1>
          <p className="text-sm text-gray-500 mt-0.5">직원 전체 대화방</p>
        </header>

        <div className="flex-1 overflow-auto px-4 md:px-8 py-4 pb-24 md:pb-4 bg-gray-50">
          {loading ? (
            <div className="text-center text-gray-400 py-10">불러오는 중...</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-gray-400 py-10">아직 대화가 없어요. 첫 메시지를 남겨보세요!</div>
          ) : (
            <div className="flex flex-col gap-2 max-w-2xl mx-auto">
              {messages.map(m => {
                const mine = m.sender_id === profile?.id
                return (
                  <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    {!mine && <span className="text-xs text-gray-500 mb-0.5 ml-1">{m.sender_name || '직원'}</span>}
                    <div className="flex items-end gap-1.5">
                      {mine && <span className="text-[10px] text-gray-400">{fmtTime(m.created_at)}</span>}
                      <div className={`px-3 py-2 rounded-2xl text-sm max-w-[75vw] md:max-w-md whitespace-pre-wrap break-words ${
                        mine ? 'bg-green-600 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                      }`}>
                        {m.content}
                      </div>
                      {!mine && <span className="text-[10px] text-gray-400">{fmtTime(m.created_at)}</span>}
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <form onSubmit={send}
          className="fixed bottom-14 md:bottom-0 left-0 md:left-56 right-0 bg-white border-t border-gray-200 px-4 md:px-8 py-3 flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)}
            placeholder="메시지를 입력하세요..."
            className="flex-1 border border-gray-300 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          <button type="submit" disabled={sending || !text.trim()}
            className="bg-green-600 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex-shrink-0">
            전송
          </button>
        </form>
      </div>
    </div>
  )
}
