'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

type Message = {
  id: string
  sender_id: string | null
  sender_name: string | null
  recipient_id: string | null
  content: string
  created_at: string
}
type Person = { id: string; name: string }

// activeChat: 'group' | userId(string) | null(목록)
export default function ChatPage() {
  const { profile } = useAuth()
  const me = profile?.id
  const [people, setPeople] = useState<Person[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // 직원 목록 로드
  useEffect(() => {
    if (!me) return
    supabase.from('profiles').select('id, name').neq('id', me).then(({ data }) => setPeople(data || []))
  }, [me])

  const belongs = useCallback((m: Message) => {
    if (active === 'group') return m.recipient_id == null
    if (active && me) return (m.sender_id === me && m.recipient_id === active) || (m.sender_id === active && m.recipient_id === me)
    return false
  }, [active, me])

  // 대화 선택 시 메시지 로드 + 실시간 구독
  useEffect(() => {
    if (!active || !me) { setMessages([]); return }
    let on = true
    async function load() {
      let q = supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(300)
      if (active === 'group') q = q.is('recipient_id', null)
      else q = q.or(`and(sender_id.eq.${me},recipient_id.eq.${active}),and(sender_id.eq.${active},recipient_id.eq.${me})`)
      const { data } = await q
      if (on) setMessages(data || [])
    }
    load()
    const ch = supabase.channel('chat-' + active)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new as Message
        if (belongs(m)) setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
      })
      .subscribe()
    return () => { on = false; supabase.removeChannel(ch) }
  }, [active, me, belongs])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const content = text.trim()
    if (!content || !active) return
    setSending(true)
    const recipient_id = active === 'group' ? null : active
    const { error } = await supabase.from('messages').insert([{
      sender_id: me ?? null, sender_name: profile?.name ?? '직원', recipient_id, content,
    }])
    if (!error && recipient_id) {
      // 1:1 메시지는 상대에게 알림
      await supabase.from('notifications').insert([{
        user_id: recipient_id, type: 'chat', title: `${profile?.name || '직원'} 님의 메시지`,
        body: content.slice(0, 40), link: '/chat',
      }])
    }
    setSending(false)
    if (error) { alert('전송 실패: ' + error.message); return }
    setText('')
  }

  const activeName = active === 'group' ? '전체 채팅방' : people.find(p => p.id === active)?.name || '대화'
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col h-screen">
        <div className="flex-1 flex min-h-0">

          {/* 대화 목록 */}
          <div className={`${active ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-64 border-r border-gray-200 bg-white`}>
            <div className="px-4 py-4 border-b border-gray-200">
              <h1 className="text-lg font-bold text-gray-900">채팅</h1>
            </div>
            <div className="flex-1 overflow-auto">
              <button onClick={() => setActive('group')}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${active === 'group' ? 'bg-green-50' : ''}`}>
                <span className="text-sm font-medium text-gray-800">📢 전체 채팅방</span>
                <p className="text-xs text-gray-400 mt-0.5">모든 직원</p>
              </button>
              {people.map(p => (
                <button key={p.id} onClick={() => setActive(p.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 flex items-center gap-2.5 ${active === p.id ? 'bg-green-50' : ''}`}>
                  <span className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-sm flex-shrink-0">{p.name?.slice(0, 1) || '?'}</span>
                  <span className="text-sm text-gray-800">{p.name}</span>
                </button>
              ))}
              {people.length === 0 && <p className="text-center text-xs text-gray-400 py-6">다른 직원이 없어요</p>}
            </div>
          </div>

          {/* 대화 화면 */}
          <div className={`${active ? 'flex' : 'hidden md:flex'} flex-col flex-1 min-w-0`}>
            {!active ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">왼쪽에서 대화를 선택하세요</div>
            ) : (
              <>
                <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => setActive(null)} className="md:hidden text-gray-400 text-sm">←</button>
                  <span className="font-bold text-gray-900">{activeName}</span>
                </header>
                <div className="flex-1 overflow-auto px-4 py-4 pb-24 md:pb-4 bg-gray-50">
                  {messages.length === 0 ? (
                    <div className="text-center text-gray-400 py-10 text-sm">아직 대화가 없어요. 첫 메시지를 남겨보세요!</div>
                  ) : (
                    <div className="flex flex-col gap-2 max-w-2xl mx-auto">
                      {messages.map(m => {
                        const mine = m.sender_id === me
                        return (
                          <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                            {!mine && active === 'group' && <span className="text-xs text-gray-500 mb-0.5 ml-1">{m.sender_name || '직원'}</span>}
                            <div className="flex items-end gap-1.5">
                              {mine && <span className="text-[10px] text-gray-400">{fmtTime(m.created_at)}</span>}
                              <div className={`px-3 py-2 rounded-2xl text-sm max-w-[75vw] md:max-w-md whitespace-pre-wrap break-words ${
                                mine ? 'bg-green-600 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                              }`}>{m.content}</div>
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
                  className="fixed bottom-14 md:bottom-0 left-0 md:left-[calc(14rem+16rem)] right-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-2">
                  <input value={text} onChange={e => setText(e.target.value)}
                    placeholder="메시지를 입력하세요..."
                    className="flex-1 border border-gray-300 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  <button type="submit" disabled={sending || !text.trim()}
                    className="bg-green-600 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex-shrink-0">전송</button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
