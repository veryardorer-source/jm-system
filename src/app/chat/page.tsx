'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { useAuth, canEdit } from '@/lib/auth-context'

type Message = {
  id: string
  sender_id: string | null
  sender_name: string | null
  recipient_id: string | null
  room_id: string | null
  content: string
  image_url?: string | null
  file_url?: string | null
  file_name?: string | null
  created_at: string
}
type Person = { id: string; name: string }
type Room = { id: string; name: string }
type Active =
  | { kind: 'all' }
  | { kind: 'dm'; id: string; name: string }
  | { kind: 'room'; id: string; name: string }
  | null

export default function ChatPage() {
  const { profile } = useAuth()
  const me = profile?.id
  const readOnly = !canEdit(profile)
  const [people, setPeople] = useState<Person[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [active, setActive] = useState<Active>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // 새 채팅방 만들기
  const [showNew, setShowNew] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)

  const scrollToBottom = useCallback(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [])

  const loadRooms = useCallback(async () => {
    if (!me) return
    const { data: mem } = await supabase.from('chat_room_members').select('room_id').eq('user_id', me)
    const ids = (mem || []).map(m => m.room_id)
    if (ids.length === 0) { setRooms([]); return }
    const { data } = await supabase.from('chat_rooms').select('id, name').in('id', ids).order('created_at', { ascending: true })
    setRooms(data || [])
  }, [me])

  useEffect(() => {
    if (!me) return
    supabase.from('profiles').select('id, name').neq('id', me).then(({ data }) => setPeople(data || []))
    loadRooms()
  }, [me, loadRooms])

  const belongs = useCallback((m: Message) => {
    if (!active) return false
    if (active.kind === 'all') return m.recipient_id == null && m.room_id == null
    if (active.kind === 'room') return m.room_id === active.id
    if (active.kind === 'dm' && me) return m.room_id == null && ((m.sender_id === me && m.recipient_id === active.id) || (m.sender_id === active.id && m.recipient_id === me))
    return false
  }, [active, me])

  useEffect(() => {
    if (!active || !me) { setMessages([]); return }
    let on = true
    async function load() {
      let q = supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(300)
      if (active!.kind === 'all') q = q.is('recipient_id', null).is('room_id', null)
      else if (active!.kind === 'room') q = q.eq('room_id', active!.id)
      else q = q.is('room_id', null).or(`and(sender_id.eq.${me},recipient_id.eq.${active!.id}),and(sender_id.eq.${active!.id},recipient_id.eq.${me})`)
      const { data } = await q
      if (on) setMessages(data || [])
    }
    load()
    const ch = supabase.channel('chat-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new as Message
        if (belongs(m)) setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
      })
      .subscribe()
    return () => { on = false; supabase.removeChannel(ch) }
  }, [active, me, belongs])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  async function pushNotif(body: string) {
    if (!active) return
    if (active.kind === 'dm') {
      await supabase.from('notifications').insert([{ user_id: active.id, type: 'chat', title: `${profile?.name || '직원'} 님의 메시지`, body, link: '/chat' }])
    } else if (active.kind === 'room') {
      const { data: mem } = await supabase.from('chat_room_members').select('user_id').eq('room_id', active.id)
      const rows = (mem || []).filter(x => x.user_id !== me).map(x => ({ user_id: x.user_id, type: 'chat', title: `${active.name} · ${profile?.name || '직원'}`, body, link: '/chat' }))
      if (rows.length) await supabase.from('notifications').insert(rows)
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const content = text.trim()
    if (!content || !active) return
    setSending(true)
    const recipient_id = active.kind === 'dm' ? active.id : null
    const room_id = active.kind === 'room' ? active.id : null
    const { error } = await supabase.from('messages').insert([{ sender_id: me ?? null, sender_name: profile?.name ?? '직원', recipient_id, room_id, content }])
    if (!error) await pushNotif(content.slice(0, 40))
    setSending(false)
    if (error) { alert('전송 실패: ' + error.message); return }
    setText('')
  }

  async function sendImage(file: File) {
    if (!file || !active) return
    setSending(true)
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `chat/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('uploads').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true })
    if (upErr) { setSending(false); alert('이미지 업로드 실패: ' + upErr.message); return }
    const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(path)
    const recipient_id = active.kind === 'dm' ? active.id : null
    const room_id = active.kind === 'room' ? active.id : null
    const { error } = await supabase.from('messages').insert([{ sender_id: me ?? null, sender_name: profile?.name ?? '직원', recipient_id, room_id, content: '', image_url: urlData.publicUrl }])
    if (!error) await pushNotif('📷 사진')
    setSending(false)
    if (error) alert('전송 실패: ' + error.message)
  }

  async function sendFile(file: File) {
    if (!file || !active) return
    // 이미지는 미리보기되도록 기존 이미지 전송으로
    if ((file.type || '').startsWith('image/')) { sendImage(file); return }
    setSending(true)
    const ext = file.name.split('.').pop() || 'bin'
    const path = `chat/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('uploads').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true })
    if (upErr) { setSending(false); alert('파일 업로드 실패: ' + upErr.message); return }
    const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(path)
    const recipient_id = active.kind === 'dm' ? active.id : null
    const room_id = active.kind === 'room' ? active.id : null
    const { error } = await supabase.from('messages').insert([{ sender_id: me ?? null, sender_name: profile?.name ?? '직원', recipient_id, room_id, content: '', file_url: urlData.publicUrl, file_name: file.name }])
    if (!error) await pushNotif('📎 ' + file.name)
    setSending(false)
    if (error) alert('전송 실패: ' + error.message)
  }

  async function createRoom(e: React.FormEvent) {
    e.preventDefault()
    if (!me || !roomName.trim() || picked.size === 0) return
    setCreating(true)
    const { data: room, error } = await supabase.from('chat_rooms').insert([{ name: roomName.trim(), created_by: me }]).select('id, name').single()
    if (error || !room) { setCreating(false); alert('생성 실패: ' + (error?.message || '')); return }
    const members = Array.from(new Set([me, ...picked])).map(uid => ({ room_id: room.id, user_id: uid }))
    await supabase.from('chat_room_members').insert(members)
    setCreating(false)
    setShowNew(false); setRoomName(''); setPicked(new Set())
    await loadRooms()
    setActive({ kind: 'room', id: room.id, name: room.name })
  }

  function togglePick(id: string) {
    setPicked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const activeName = !active ? '' : active.kind === 'all' ? '전체 채팅방' : active.name
  const showSenderName = active?.kind === 'all' || active?.kind === 'room'
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  function renderContent(t: string, mine: boolean) {
    return t.split(/(https?:\/\/[^\s]+)/g).map((p, i) =>
      /^https?:\/\//.test(p)
        ? <a key={i} href={p} target="_blank" rel="noreferrer" className={`underline break-all ${mine ? 'text-white' : 'text-green-700'}`}>{p}</a>
        : <span key={i}>{p}</span>)
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col h-screen">
        <div className="flex-1 flex min-h-0">

          {/* 대화 목록 */}
          <div className={`${active ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-64 border-r border-gray-200 bg-white`}>
            <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
              <h1 className="text-lg font-bold text-gray-900">채팅</h1>
              {!readOnly && <button onClick={() => setShowNew(true)} className="text-xs bg-green-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-green-700">+ 새 채팅방</button>}
            </div>
            <div className="flex-1 overflow-auto">
              <button onClick={() => setActive({ kind: 'all' })}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${active?.kind === 'all' ? 'bg-green-50' : ''}`}>
                <span className="text-sm font-medium text-gray-800">📢 전체 채팅방</span>
                <p className="text-xs text-gray-400 mt-0.5">모든 직원</p>
              </button>

              {rooms.length > 0 && <div className="px-4 pt-3 pb-1 text-xs text-gray-400 font-semibold">채팅방</div>}
              {rooms.map(r => (
                <button key={r.id} onClick={() => setActive({ kind: 'room', id: r.id, name: r.name })}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 flex items-center gap-2.5 ${active?.kind === 'room' && active.id === r.id ? 'bg-green-50' : ''}`}>
                  <span className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-sm flex-shrink-0">#</span>
                  <span className="text-sm text-gray-800">{r.name}</span>
                </button>
              ))}

              <div className="px-4 pt-3 pb-1 text-xs text-gray-400 font-semibold">직원 (1:1)</div>
              {people.map(p => (
                <button key={p.id} onClick={() => setActive({ kind: 'dm', id: p.id, name: p.name })}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 flex items-center gap-2.5 ${active?.kind === 'dm' && active.id === p.id ? 'bg-green-50' : ''}`}>
                  <span className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-sm flex-shrink-0">{p.name?.slice(0, 1) || '?'}</span>
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
                  <span className="font-bold text-gray-900">{active.kind === 'room' ? '# ' : ''}{activeName}</span>
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
                            {!mine && showSenderName && <span className="text-xs text-gray-500 mb-0.5 ml-1">{m.sender_name || '직원'}</span>}
                            <div className="flex items-end gap-1.5">
                              {mine && <span className="text-[10px] text-gray-400">{fmtTime(m.created_at)}</span>}
                              <div className={`max-w-[75vw] md:max-w-md flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
                                {m.image_url && (
                                  <img src={m.image_url} alt="" onClick={() => window.open(m.image_url!, '_blank')}
                                    className="rounded-2xl max-w-[220px] max-h-[260px] object-cover cursor-pointer border border-gray-200" />
                                )}
                                {m.file_url && (
                                  <a href={m.file_url} target="_blank" rel="noreferrer" download={m.file_name || true}
                                    className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm border max-w-[260px] ${
                                      mine ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-200 text-gray-800'
                                    }`}>
                                    <span className="text-lg flex-shrink-0">📎</span>
                                    <span className="truncate underline">{m.file_name || '파일'}</span>
                                  </a>
                                )}
                                {m.content && (
                                  <div className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                                    mine ? 'bg-green-600 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                                  }`}>{renderContent(m.content, mine)}</div>
                                )}
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
                {readOnly ? (
                  <div className="fixed bottom-14 md:bottom-0 left-0 md:left-[calc(14rem+16rem)] right-0 bg-gray-50 border-t border-gray-200 px-4 py-3 text-center text-xs text-gray-400">
                    외부협력업체 계정은 채팅 보기만 가능합니다.
                  </div>
                ) : (
                  <form onSubmit={send}
                    className="fixed bottom-14 md:bottom-0 left-0 md:left-[calc(14rem+16rem)] right-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-2 items-center">
                    <label className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full border border-gray-300 text-lg cursor-pointer hover:bg-gray-50" title="사진 보내기">
                      🖼️
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) sendImage(f); e.currentTarget.value = '' }} />
                    </label>
                    <label className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full border border-gray-300 text-lg cursor-pointer hover:bg-gray-50" title="파일 보내기">
                      📎
                      <input type="file" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) sendFile(f); e.currentTarget.value = '' }} />
                    </label>
                    <input value={text} onChange={e => setText(e.target.value)}
                      placeholder="메시지를 입력하세요..."
                      className="flex-1 border border-gray-300 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    <button type="submit" disabled={sending || !text.trim()}
                      className="bg-green-600 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex-shrink-0">전송</button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 새 채팅방 모달 */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold">새 채팅방</h2>
              <button onClick={() => { setShowNew(false); setPicked(new Set()); setRoomName('') }} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={createRoom} className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">채팅방 이름 *</label>
                <input value={roomName} onChange={e => setRoomName(e.target.value)} required
                  placeholder="예) 디자인팀, OO현장팀"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">참여 직원 선택 *</label>
                <div className="border border-gray-200 rounded-lg max-h-52 overflow-auto">
                  {people.map(p => (
                    <button type="button" key={p.id} onClick={() => togglePick(p.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left border-b border-gray-100 last:border-0 ${picked.has(p.id) ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                      <span className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs ${picked.has(p.id) ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>{picked.has(p.id) ? '✓' : ''}</span>
                      <span className="text-sm text-gray-800">{p.name}</span>
                    </button>
                  ))}
                  {people.length === 0 && <p className="text-center text-xs text-gray-400 py-4">직원이 없어요</p>}
                </div>
                <p className="text-xs text-gray-400 mt-1">나는 자동으로 포함돼요. ({picked.size}명 선택)</p>
              </div>
              <button type="submit" disabled={creating || !roomName.trim() || picked.size === 0}
                className="bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {creating ? '만드는 중...' : '채팅방 만들기'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
