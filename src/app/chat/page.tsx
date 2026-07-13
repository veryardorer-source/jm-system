'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { useAuth, canEdit } from '@/lib/auth-context'
import { notifyDM, notifyRoom, notifyMention } from '@/lib/notify'
import { shareUrl, downloadUrl } from '@/lib/media'
import LinkPreview from '@/components/LinkPreview'

type Message = {
  id: string
  sender_id: string | null
  sender_name: string | null
  recipient_id: string | null
  room_id: string | null
  content: string
  image_url?: string | null
  images?: string[] | null   // 여러 장 묶음 전송 (카톡식)
  file_url?: string | null
  file_name?: string | null
  reply_to_id?: string | null
  reply_preview?: string | null
  is_deleted?: boolean | null
  edited_at?: string | null
  pinned?: boolean | null
  created_at: string
}
type Reaction = { id: string; message_id: string; user_id: string; user_name: string | null; emoji: string }
type Person = { id: string; name: string }
type Room = { id: string; name: string }
type Active =
  | { kind: 'all' }
  | { kind: 'dm'; id: string; name: string }
  | { kind: 'room'; id: string; name: string }
  | null

const EMOJIS = ['👍', '❤️', '😂', '😮', '🙏', '✅']

// ── 대화별 안읽음 추적 (마지막으로 읽은 시각을 기기에 저장) ──
const LR_KEY = 'jm_chat_lastread'
function getLastRead(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(LR_KEY) || '{}') } catch { return {} }
}
function markRead(key: string) {
  if (typeof localStorage === 'undefined' || !key) return
  const lr = getLastRead(); lr[key] = new Date().toISOString()
  localStorage.setItem(LR_KEY, JSON.stringify(lr))
}
function convKey(a: Active): string | null {
  if (!a) return null
  if (a.kind === 'all') return 'all'
  if (a.kind === 'room') return 'room:' + a.id
  return 'dm:' + a.id
}
function msgKey(m: Message, myId: string, roomIds: Set<string>): string | null {
  if (m.sender_id === myId) return null               // 내가 보낸 건 제외
  if (m.room_id == null && m.recipient_id == null) return 'all'
  if (m.room_id != null) return roomIds.has(m.room_id) ? 'room:' + m.room_id : null
  if (m.recipient_id === myId) return 'dm:' + (m.sender_id || '')
  return null
}
function escRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

export default function ChatPage() {
  const { profile } = useAuth()
  const me = profile?.id
  const isAdmin = profile?.role === 'admin'
  const readOnly = !canEdit(profile)
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [chatLightbox, setChatLightbox] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [people, setPeople] = useState<Person[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [active, setActive] = useState<Active>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({})
  const [reads, setReads] = useState<string[]>([])       // 상대(들)의 마지막 읽은 시각
  const [participants, setParticipants] = useState(0)    // 나를 제외한 대화 상대 수
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const msgsRef = useRef<Message[]>([])
  const activeRef = useRef<Active>(null)

  // 답장 / 수정 / 메뉴 / 멘션 / 검색
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')

  // 새 채팅방 만들기 / 방 관리
  const [showNew, setShowNew] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [showRoomSettings, setShowRoomSettings] = useState(false)
  const [roomMemberIds, setRoomMemberIds] = useState<Set<string>>(new Set())
  const [renameVal, setRenameVal] = useState('')

  const scrollToBottom = useCallback(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [])

  const loadRooms = useCallback(async () => {
    if (!me) return
    const { data: mem } = await supabase.from('chat_room_members').select('room_id').eq('user_id', me)
    const ids = (mem || []).map(m => m.room_id)
    if (ids.length === 0) { setRooms([]); return }
    const { data } = await supabase.from('chat_rooms').select('id, name').in('id', ids).order('created_at', { ascending: true })
    setRooms(data || [])
  }, [me])

  const reloadReactions = useCallback(async () => {
    const ids = msgsRef.current.map(m => m.id)
    if (!ids.length) { setReactions({}); return }
    const { data } = await supabase.from('message_reactions').select('*').in('message_id', ids)
    const map: Record<string, Reaction[]> = {}
    for (const r of (data || []) as Reaction[]) (map[r.message_id] ||= []).push(r)
    setReactions(map)
  }, [])

  // 상대가 어디까지 읽었는지 불러오기
  const loadReads = useCallback(async (a: Active) => {
    if (!a || a.kind === 'all' || !me) { setReads([]); setParticipants(0); return }
    if (a.kind === 'dm' && a.id === me) { setReads([]); setParticipants(0); return } // 나와의 채팅: 읽음표시 없음
    if (a.kind === 'dm') {
      const { data } = await supabase.from('chat_reads').select('last_read_at').eq('user_id', a.id).eq('conv_key', 'dm:' + me).maybeSingle()
      setParticipants(1); setReads(data?.last_read_at ? [data.last_read_at] : [])
    } else {
      const { data: mem } = await supabase.from('chat_room_members').select('user_id').eq('room_id', a.id)
      const others = (mem || []).map(x => x.user_id).filter(u => u !== me)
      setParticipants(others.length)
      if (!others.length) { setReads([]); return }
      const { data } = await supabase.from('chat_reads').select('last_read_at').eq('conv_key', 'room:' + a.id).in('user_id', others)
      setReads((data || []).map(r => r.last_read_at).filter(Boolean) as string[])
    }
  }, [me])

  // 내가 이 대화를 읽었음을 기록
  const markMyRead = useCallback(async (a: Active) => {
    const key = convKey(a)
    if (!key || !me || !a || a.kind === 'all') return
    await supabase.from('chat_reads').upsert({ user_id: me, conv_key: key, last_read_at: new Date().toISOString() }, { onConflict: 'user_id,conv_key' })
  }, [me])

  useEffect(() => {
    if (!me) return
    supabase.from('profiles').select('id, name').neq('id', me).then(({ data }) => setPeople(data || []))
    loadRooms()
    // 채팅 화면을 열면 안 읽은 채팅 알림을 읽음 처리 (사이드바 채팅 배지 사라짐)
    supabase.from('notifications').update({ is_read: true })
      .eq('user_id', me).eq('type', 'chat').eq('is_read', false).then(() => {})
  }, [me, loadRooms])

  // 안읽음 초기 계산 (페이지 진입/방 목록 로드 시): 마지막 읽은 시각 이후 받은 메시지 수
  useEffect(() => {
    if (!me) return
    let on = true
    const roomIds = new Set(rooms.map(r => r.id))
    ;(async () => {
      const { data } = await supabase.from('messages').select('*')
        .or(`recipient_id.is.null,recipient_id.eq.${me},sender_id.eq.${me}`)
        .order('created_at', { ascending: false }).limit(300)
      if (!on) return
      const lr = getLastRead()
      const counts: Record<string, number> = {}
      for (const m of (data || [])) {
        const key = msgKey(m as Message, me, roomIds)
        if (!key) continue
        if (!lr[key] || (m.created_at as string) > lr[key]) counts[key] = (counts[key] || 0) + 1
      }
      setUnread(counts)
    })()
    return () => { on = false }
  }, [me, rooms])

  // 대화를 열면 그 대화는 읽음 처리 (점 사라짐)
  useEffect(() => {
    const key = convKey(active)
    if (!key) return
    markRead(key)
    setUnread(u => (u[key] ? { ...u, [key]: 0 } : u))
    setReplyTo(null); setEditing(null); setMenuFor(null); setSearchOpen(false); setSearchQ('')
  }, [active])

  // 대화 열면: 읽음 기록 + 상대 읽음 상태 로드
  useEffect(() => {
    activeRef.current = active
    if (active) { markMyRead(active); loadReads(active) }
    else { setReads([]); setParticipants(0) }
  }, [active, markMyRead, loadReads])

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
    const roomIds = new Set(rooms.map(r => r.id))
    const ch = supabase.channel('chat-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new as Message
        if (belongs(m)) {
          setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
          if (m.sender_id !== me) { markRead(convKey(active)!); markMyRead(active) } // 보고 있는 대화는 계속 읽음 처리
        } else {
          // 지금 보고 있지 않은 대화에서 온 메시지 → 안읽음 표시
          const key = msgKey(m, me!, roomIds)
          if (key) setUnread(u => ({ ...u, [key]: (u[key] || 0) + 1 }))
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new as Message
        setMessages(prev => prev.map(x => x.id === m.id ? m : x))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, payload => {
        const old = payload.old as { id?: string }
        if (old?.id) setMessages(prev => prev.filter(x => x.id !== old.id))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => {
        reloadReactions()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads' }, () => {
        loadReads(activeRef.current)
      })
      .subscribe()
    return () => { on = false; supabase.removeChannel(ch) }
  }, [active, me, belongs, rooms, reloadReactions, markMyRead, loadReads])

  useEffect(() => { msgsRef.current = messages; reloadReactions() }, [messages, reloadReactions])
  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  // 파일 드래그를 채팅 화면 어디에 놓아도 전송되게 (벗어나 놓으면 브라우저가 파일을 열어버리는 문제 방지)
  const handleFilesRef = useRef<(fs: File[]) => void>(() => {})
  useEffect(() => {
    if (readOnly) return
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files')
    const over = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); if (activeRef.current) setDragOver(true) }
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDragOver(false) }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setDragOver(false)
      if (!activeRef.current) return
      handleFilesRef.current(Array.from(e.dataTransfer?.files || []))
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop) }
  }, [readOnly])

  // 알림/푸시는 서버(/api/push/send)가 대상 계산·검증. 나와의 채팅은 알림 없음.
  function pushNotif(body: string) {
    if (!active) return
    if (active.kind === 'dm') {
      if (active.id === me) return // 나와의 채팅
      notifyDM(active.id, `${profile?.name || '직원'} 님의 메시지`, body, '/chat')
    } else if (active.kind === 'room') {
      notifyRoom(active.id, `${active.name} · ${profile?.name || '직원'}`, body, '/chat')
    }
  }

  function notifyMentions(content: string) {
    if (!active) return
    if (active.kind === 'dm' && active.id === me) return // 나와의 채팅
    const ids = people.filter(p => p.name && content.includes('@' + p.name)).map(p => p.id)
    if (!ids.length) return
    const ctx = active.kind === 'room' ? { roomId: active.id }
      : active.kind === 'dm' ? { recipientId: active.id }
      : {}
    notifyMention(ids, ctx, `${profile?.name || '직원'} 님이 회원님을 언급했어요`, content.slice(0, 60), '/chat')
  }

  function replyFields() {
    if (!replyTo) return {}
    const summary = replyTo.content || (replyTo.image_url ? '사진' : replyTo.file_name || '파일')
    return { reply_to_id: replyTo.id, reply_preview: `${replyTo.sender_name || '직원'}|${summary.slice(0, 40)}` }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    await doSend()
  }

  async function doSend() {
    const content = text.trim()
    if (!content || !active || sending) return
    setSending(true)
    if (editing) {
      const { error } = await supabase.from('messages').update({ content, edited_at: new Date().toISOString() }).eq('id', editing.id)
      setSending(false)
      if (error) { alert('수정 실패: ' + error.message); return }
      setEditing(null); setText(''); return
    }
    const recipient_id = active.kind === 'dm' ? active.id : null
    const room_id = active.kind === 'room' ? active.id : null
    const { error } = await supabase.from('messages').insert([{ sender_id: me ?? null, sender_name: profile?.name ?? '직원', recipient_id, room_id, content, ...replyFields() }])
    if (!error) { await pushNotif(content.slice(0, 40)); await notifyMentions(content) }
    setSending(false)
    if (error) { alert('전송 실패: ' + error.message); return }
    setText(''); setReplyTo(null)
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
    const { error } = await supabase.from('messages').insert([{ sender_id: me ?? null, sender_name: profile?.name ?? '직원', recipient_id, room_id, content: '', image_url: urlData.publicUrl, ...replyFields() }])
    if (!error) await pushNotif('📷 사진')
    setSending(false); setReplyTo(null)
    if (error) alert('전송 실패: ' + error.message)
  }

  // 여러 장 이미지를 한 메시지(묶음)로 전송 — 카톡식
  async function sendImages(files: File[]) {
    if (!files.length || !active) return
    if (files.length === 1) { sendImage(files[0]); return }
    setSending(true)
    const slots: (string | null)[] = new Array(files.length).fill(null)
    const CONC = 3
    for (let i = 0; i < files.length; i += CONC) {
      const chunk = files.slice(i, i + CONC)
      await Promise.all(chunk.map(async (file, j) => {
        const ext = file.name.split('.').pop() || 'jpg'
        const path = `chat/${Date.now()}_${i + j}.${ext}`
        const { error: upErr } = await supabase.storage.from('uploads').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true })
        if (!upErr) slots[i + j] = supabase.storage.from('uploads').getPublicUrl(path).data.publicUrl
      }))
    }
    const urls = slots.filter(Boolean) as string[]
    if (!urls.length) { setSending(false); alert('이미지 업로드에 실패했어요'); return }
    const recipient_id = active.kind === 'dm' ? active.id : null
    const room_id = active.kind === 'room' ? active.id : null
    const { error } = await supabase.from('messages').insert([{
      sender_id: me ?? null, sender_name: profile?.name ?? '직원', recipient_id, room_id,
      content: '', image_url: urls[0], images: urls, ...replyFields(),
    }])
    if (!error) pushNotif(`📷 사진 ${urls.length}장`)
    setSending(false); setReplyTo(null)
    if (error) alert('전송 실패: ' + error.message + (error.message.includes('images') ? '\n(관리자에게: db/chat_images.sql 실행 필요)' : ''))
  }

  // 받은 파일들 분배: 이미지 여러 장 → 한 묶음, 나머지는 개별 파일 전송
  function handleIncomingFiles(files: File[]) {
    const imgs = files.filter(f => (f.type || '').startsWith('image/'))
    const rest = files.filter(f => !(f.type || '').startsWith('image/'))
    if (imgs.length) sendImages(imgs)
    rest.forEach(f => sendFile(f))
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
    const { error } = await supabase.from('messages').insert([{ sender_id: me ?? null, sender_name: profile?.name ?? '직원', recipient_id, room_id, content: '', file_url: urlData.publicUrl, file_name: file.name, ...replyFields() }])
    if (!error) await pushNotif('📎 ' + file.name)
    setSending(false); setReplyTo(null)
    if (error) alert('전송 실패: ' + error.message)
  }

  // ── 메시지 동작: 반응 / 답장 / 수정 / 삭제 / 고정 ──
  async function toggleReaction(mId: string, emoji: string) {
    if (!me) return
    const mine = (reactions[mId] || []).some(r => r.emoji === emoji && r.user_id === me)
    if (mine) await supabase.from('message_reactions').delete().eq('message_id', mId).eq('user_id', me).eq('emoji', emoji)
    else await supabase.from('message_reactions').insert([{ message_id: mId, user_id: me, user_name: profile?.name || '', emoji }])
    setMenuFor(null); reloadReactions()
  }
  function startReply(m: Message) { setReplyTo(m); setEditing(null); setMenuFor(null) }
  function startEdit(m: Message) { setEditing({ id: m.id, text: m.content }); setText(m.content); setReplyTo(null); setMenuFor(null) }
  // 완전 삭제 — 잘못 쓴 메시지는 흔적 없이 제거 (첨부 파일·반응도 정리)
  async function deleteMsg(m: Message) {
    if (!confirm('이 메시지를 삭제할까요?')) return
    setMenuFor(null)
    for (const url of [m.image_url, m.file_url, ...(m.images || [])]) {
      const path = url?.split('/uploads/')[1]
      if (path) await supabase.storage.from('uploads').remove([path])
    }
    await supabase.from('message_reactions').delete().eq('message_id', m.id)
    const { error } = await supabase.from('messages').delete().eq('id', m.id)
    if (error) { alert('삭제 실패: ' + error.message); return }
    setMessages(prev => prev.filter(x => x.id !== m.id))
  }
  async function togglePin(m: Message) {
    setMenuFor(null)
    await supabase.from('messages').update({ pinned: !m.pinned }).eq('id', m.id)
  }
  function jumpTo(id: string) {
    const el = document.getElementById('msg-' + id)
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('ring-2', 'ring-green-400'); setTimeout(() => el.classList.remove('ring-2', 'ring-green-400'), 1500) }
  }

  // 렌더 후 ref에 최신 핸들러 유지 (렌더 중 직접 갱신은 lint 위반)
  useEffect(() => { handleFilesRef.current = handleIncomingFiles })

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

  // ── 방 관리 ──
  async function openRoomSettings() {
    if (!active || active.kind !== 'room') return
    const { data } = await supabase.from('chat_room_members').select('user_id').eq('room_id', active.id)
    setRoomMemberIds(new Set((data || []).map(x => x.user_id)))
    setRenameVal(active.name)
    setShowRoomSettings(true)
  }
  async function saveRoomName() {
    if (!active || active.kind !== 'room' || !renameVal.trim()) return
    await supabase.from('chat_rooms').update({ name: renameVal.trim() }).eq('id', active.id)
    setActive({ kind: 'room', id: active.id, name: renameVal.trim() })
    await loadRooms()
  }
  async function addRoomMember(uid: string) {
    if (!active || active.kind !== 'room') return
    await supabase.from('chat_room_members').insert([{ room_id: active.id, user_id: uid }])
    setRoomMemberIds(prev => new Set(prev).add(uid))
  }
  async function removeRoomMember(uid: string) {
    if (!active || active.kind !== 'room') return
    await supabase.from('chat_room_members').delete().eq('room_id', active.id).eq('user_id', uid)
    setRoomMemberIds(prev => { const n = new Set(prev); n.delete(uid); return n })
  }
  async function leaveRoom() {
    if (!active || active.kind !== 'room' || !me) return
    if (!confirm('이 채팅방에서 나갈까요?')) return
    await supabase.from('chat_room_members').delete().eq('room_id', active.id).eq('user_id', me)
    setShowRoomSettings(false); setActive(null)
    await loadRooms()
  }

  function insertMention(name: string) {
    setText(t => (t.endsWith(' ') || t === '' ? t : t + ' ') + '@' + name + ' ')
    setMentionOpen(false)
  }

  const badge = (n: number) => n > 0
    ? <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center flex-shrink-0">{n > 99 ? '99+' : n}</span>
    : null
  const activeName = !active ? '' : active.kind === 'all' ? '전체 채팅방' : active.name
  const showSenderName = active?.kind === 'all' || active?.kind === 'room'
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

  function renderContent(t: string, mine: boolean) {
    const names = [...new Set(people.map(p => p.name).filter(Boolean))].sort((a, b) => b.length - a.length)
    const mentionSrc = names.length ? '@(?:' + names.map(escRe).join('|') + ')' : null
    return t.split(/(https?:\/\/[^\s]+)/g).map((p, i) => {
      if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noreferrer" className={`underline break-all ${mine ? 'text-white' : 'text-green-700'}`}>{p}</a>
      if (!mentionSrc) return <span key={i}>{p}</span>
      return p.split(new RegExp('(' + mentionSrc + ')', 'g')).map((s, j) =>
        /^@/.test(s) && names.includes(s.slice(1))
          ? <span key={`${i}-${j}`} className={`font-semibold ${mine ? 'text-white underline' : 'text-green-700'}`}>{s}</span>
          : <span key={`${i}-${j}`}>{s}</span>)
    })
  }

  // 내가 보낸 메시지의 읽음 표시 (1:1='읽음' / 단체방=안 읽은 사람 수)
  function readLabel(m: Message): string | null {
    if (m.sender_id !== me || m.is_deleted || !active || active.kind === 'all') return null
    const readers = reads.filter(t => t && t >= m.created_at).length
    if (active.kind === 'dm') return readers >= 1 ? '읽음' : null
    if (participants <= 0) return null
    const unread = participants - readers
    return unread > 0 ? String(unread) : '읽음'
  }

  function renderReactions(mId: string) {
    const rs = reactions[mId] || []
    if (!rs.length) return null
    const groups: Record<string, { count: number; mine: boolean }> = {}
    for (const r of rs) { (groups[r.emoji] ||= { count: 0, mine: false }); groups[r.emoji].count++; if (r.user_id === me) groups[r.emoji].mine = true }
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {Object.entries(groups).map(([e, g]) => (
          <button key={e} onClick={() => !readOnly && toggleReaction(mId, e)}
            className={`text-xs px-1.5 py-0.5 rounded-full border ${g.mine ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-gray-200 text-gray-600'}`}>{e} {g.count}</button>
        ))}
      </div>
    )
  }

  if (profile?.role === 'partner') return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">접근 권한이 없습니다.</div>
    </div>
  )

  const pinned = messages.filter(m => m.pinned && !m.is_deleted)
  const shown = searchQ.trim()
    ? messages.filter(m => !m.is_deleted && (m.content || '').toLowerCase().includes(searchQ.trim().toLowerCase()))
    : messages

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col h-[calc(100dvh-3.5rem)] md:h-screen">
        <div className="flex-1 flex min-h-0">

          {/* 대화 목록 */}
          <div className={`${active ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-64 border-r border-gray-200 bg-white`}>
            <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
              <h1 className="text-lg font-bold text-gray-900">채팅</h1>
              {!readOnly && <button onClick={() => setShowNew(true)} className="text-xs bg-green-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-green-700">+ 새 채팅방</button>}
            </div>
            <div className="flex-1 overflow-auto">
              <button onClick={() => setActive({ kind: 'all' })}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 flex items-center ${active?.kind === 'all' ? 'bg-green-50' : ''}`}>
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-800">📢 전체 채팅방</span>
                  <p className="text-xs text-gray-400 mt-0.5">모든 직원</p>
                </div>
                {badge(unread['all'] || 0)}
              </button>

              {/* 나와의 채팅 — 메모·자료 보관함 */}
              {me && (
                <button onClick={() => setActive({ kind: 'dm', id: me, name: '나와의 채팅' })}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 flex items-center gap-2.5 ${active?.kind === 'dm' && active.id === me ? 'bg-green-50' : ''}`}>
                  <span className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-sm flex-shrink-0">📝</span>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-gray-800">나와의 채팅</span>
                    <p className="text-xs text-gray-400 mt-0.5">메모·사진·파일 보관함</p>
                  </div>
                </button>
              )}

              {rooms.length > 0 && <div className="px-4 pt-3 pb-1 text-xs text-gray-400 font-semibold">채팅방</div>}
              {rooms.map(r => (
                <button key={r.id} onClick={() => setActive({ kind: 'room', id: r.id, name: r.name })}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 flex items-center gap-2.5 ${active?.kind === 'room' && active.id === r.id ? 'bg-green-50' : ''}`}>
                  <span className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-sm flex-shrink-0">#</span>
                  <span className="text-sm text-gray-800 truncate">{r.name}</span>
                  {badge(unread['room:' + r.id] || 0)}
                </button>
              ))}

              <div className="px-4 pt-3 pb-1 text-xs text-gray-400 font-semibold">직원 (1:1)</div>
              {people.map(p => (
                <button key={p.id} onClick={() => setActive({ kind: 'dm', id: p.id, name: p.name })}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 flex items-center gap-2.5 ${active?.kind === 'dm' && active.id === p.id ? 'bg-green-50' : ''}`}>
                  <span className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-sm flex-shrink-0">{p.name?.slice(0, 1) || '?'}</span>
                  <span className="text-sm text-gray-800 truncate">{p.name}</span>
                  {badge(unread['dm:' + p.id] || 0)}
                </button>
              ))}
              {people.length === 0 && <p className="text-center text-xs text-gray-400 py-6">다른 직원이 없어요</p>}
            </div>
          </div>

          {/* 대화 화면 */}
          <div className={`${active ? 'flex' : 'hidden md:flex'} flex-col flex-1 min-w-0 min-h-0`}>
            {!active ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">왼쪽에서 대화를 선택하세요</div>
            ) : (
              <>
                <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => setActive(null)} className="md:hidden text-gray-400 text-sm">←</button>
                  <span className="font-bold text-gray-900 truncate">{active.kind === 'room' ? '# ' : ''}{activeName}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <button onClick={() => { setSearchOpen(o => !o); setSearchQ('') }} title="대화 검색"
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-base hover:bg-gray-100 ${searchOpen ? 'bg-green-50' : ''}`}>🔍</button>
                    {active.kind === 'room' && !readOnly && (
                      <button onClick={openRoomSettings} title="방 관리" className="w-9 h-9 rounded-full flex items-center justify-center text-base hover:bg-gray-100">⚙️</button>
                    )}
                  </div>
                </header>

                {searchOpen && (
                  <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 flex-shrink-0">
                    <input autoFocus value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="대화 내용 검색"
                      className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    {searchQ.trim() && <span className="text-xs text-gray-400 flex-shrink-0">{shown.length}건</span>}
                  </div>
                )}

                {pinned.length > 0 && !searchQ.trim() && (
                  <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 flex-shrink-0">
                    <span className="flex-shrink-0">📌</span>
                    <button onClick={() => jumpTo(pinned[pinned.length - 1].id)} className="text-xs text-amber-800 truncate flex-1 text-left">
                      {pinned[pinned.length - 1].content || (pinned[pinned.length - 1].image_url ? '사진' : pinned[pinned.length - 1].file_name || '파일')}
                    </button>
                    {pinned.length > 1 && <span className="text-[10px] text-amber-600 flex-shrink-0">+{pinned.length - 1}</span>}
                    {!readOnly && (isAdmin || pinned[pinned.length - 1].sender_id === me) && <button onClick={() => togglePin(pinned[pinned.length - 1])} className="text-xs text-amber-600 hover:text-amber-800 flex-shrink-0">해제</button>}
                  </div>
                )}

                <div className="relative flex-1 min-h-0 overflow-auto px-4 py-4 bg-gray-50">
                  {dragOver && !readOnly && (
                    <div className="absolute inset-2 z-10 border-2 border-dashed border-green-500 bg-green-50/80 rounded-xl flex items-center justify-center pointer-events-none">
                      <p className="text-green-700 font-medium text-sm">여기에 놓으면 파일이 전송돼요 📎</p>
                    </div>
                  )}
                  {shown.length === 0 ? (
                    <div className="text-center text-gray-400 py-10 text-sm">
                      {searchQ.trim() ? '검색 결과가 없어요' : <>아직 대화가 없어요. 첫 메시지를 남겨보세요!<br/><span className="text-xs">파일을 끌어다 놓아도 전송됩니다</span></>}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 max-w-2xl mx-auto">
                      {shown.map(m => {
                        const mine = m.sender_id === me
                        const canEditMsg = mine && !m.is_deleted && !!m.content
                        const canDelMsg = (mine || isAdmin) && !m.is_deleted
                        const [rpName, ...rpRest] = (m.reply_preview || '').split('|')
                        return (
                          <div key={m.id} id={'msg-' + m.id} className={`group flex flex-col rounded-lg transition-shadow ${mine ? 'items-end' : 'items-start'}`}>
                            {!mine && showSenderName && <span className="text-xs text-gray-500 mb-0.5 ml-1">{m.sender_name || '직원'}</span>}
                            <div className={`flex items-end gap-1 ${mine ? 'flex-row' : 'flex-row-reverse'}`}>
                              <span className="text-[10px] text-gray-400 flex-shrink-0 flex flex-col items-center leading-tight">
                                {(() => { const rl = readLabel(m); return rl && <span className={/^\d+$/.test(rl) ? 'text-amber-500 font-semibold' : 'text-green-600'}>{rl}</span> })()}
                                <span>{fmtTime(m.created_at)}{m.edited_at ? ' (수정됨)' : ''}</span>
                              </span>
                              {!m.is_deleted && !readOnly && (
                                <button onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}
                                  className="text-gray-300 hover:text-gray-500 text-sm px-0.5 flex-shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100">⋯</button>
                              )}
                              <div className={`max-w-[75vw] md:max-w-md flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
                                {m.is_deleted ? (
                                  <div className="px-3 py-2 rounded-2xl text-sm italic text-gray-400 bg-gray-100 border border-gray-200">삭제된 메시지입니다</div>
                                ) : (
                                  <>
                                    {m.reply_preview && (
                                      <button onClick={() => m.reply_to_id && jumpTo(m.reply_to_id)}
                                        className={`text-left text-xs px-2.5 py-1.5 rounded-lg border-l-2 max-w-[260px] truncate ${mine ? 'bg-green-700/20 border-green-300 text-green-900' : 'bg-gray-100 border-gray-300 text-gray-500'}`}>
                                        <span className="font-semibold">{rpName}</span> {rpRest.join('|')}
                                      </button>
                                    )}
                                    {(() => {
                                      const imgs = m.images && m.images.length ? m.images : (m.image_url ? [m.image_url] : [])
                                      if (!imgs.length) return null
                                      if (imgs.length === 1) return (
                                        <img src={imgs[0]} alt="" onClick={() => setChatLightbox(imgs[0])}
                                          className="rounded-2xl max-w-[220px] max-h-[260px] object-cover cursor-pointer border border-gray-200" />
                                      )
                                      // 여러 장 = 한 묶음 격자 (카톡식) — 4장까지 보여주고 나머지는 +N
                                      return (
                                        <div className={`grid gap-1 w-[240px] max-w-[70vw] ${imgs.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                                          {imgs.slice(0, 4).map((u, i) => (
                                            <div key={i} className="relative aspect-square">
                                              <img src={u} alt="" onClick={() => setChatLightbox(u)}
                                                className="w-full h-full object-cover rounded-lg cursor-pointer border border-gray-200" />
                                              {i === 3 && imgs.length > 4 && (
                                                <button onClick={() => setChatLightbox(u)}
                                                  className="absolute inset-0 bg-black/55 rounded-lg flex items-center justify-center text-white text-lg font-bold">
                                                  +{imgs.length - 4}
                                                </button>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )
                                    })()}
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
                                    {(() => { const u = (m.content || '').match(/https?:\/\/[^\s]+/)?.[0]; return u ? <LinkPreview url={u} /> : null })()}
                                    {renderReactions(m.id)}
                                  </>
                                )}
                              </div>
                            </div>

                            {/* 동작 메뉴 */}
                            {menuFor === m.id && !m.is_deleted && !readOnly && (
                              <div className={`mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-2 flex flex-col gap-1.5 z-20 ${mine ? 'items-end' : 'items-start'}`}>
                                <div className="flex gap-1">
                                  {EMOJIS.map(e => (
                                    <button key={e} onClick={() => toggleReaction(m.id, e)} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-base">{e}</button>
                                  ))}
                                </div>
                                <div className="flex gap-1 flex-wrap justify-end">
                                  <button onClick={() => startReply(m)} className="text-xs px-2.5 py-1.5 rounded-lg hover:bg-gray-100 text-gray-700">↩ 답장</button>
                                  {(mine || isAdmin) && <button onClick={() => togglePin(m)} className="text-xs px-2.5 py-1.5 rounded-lg hover:bg-gray-100 text-gray-700">{m.pinned ? '📌 고정해제' : '📌 고정'}</button>}
                                  {canEditMsg && <button onClick={() => startEdit(m)} className="text-xs px-2.5 py-1.5 rounded-lg hover:bg-gray-100 text-gray-700">✏ 수정</button>}
                                  {canDelMsg && <button onClick={() => deleteMsg(m)} className="text-xs px-2.5 py-1.5 rounded-lg hover:bg-red-50 text-red-600">🗑 삭제</button>}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                      <div ref={bottomRef} />
                    </div>
                  )}
                </div>

                {readOnly ? (
                  <div className="flex-shrink-0 bg-gray-50 border-t border-gray-200 px-4 py-3 text-center text-xs text-gray-400">
                    외부협력업체 계정은 채팅 보기만 가능합니다.
                  </div>
                ) : (
                  <div className="flex-shrink-0 bg-white border-t border-gray-200">
                    {(replyTo || editing) && (
                      <div className="px-4 pt-2 flex items-center gap-2 text-xs">
                        <span className="text-gray-400 flex-shrink-0">{editing ? '✏ 수정 중' : '↩ 답장'}</span>
                        <span className="text-gray-600 truncate flex-1">
                          {editing ? editing.text : `${replyTo!.sender_name || '직원'}: ${replyTo!.content || (replyTo!.image_url ? '사진' : replyTo!.file_name || '파일')}`}
                        </span>
                        <button onClick={() => { setReplyTo(null); setEditing(null); setText('') }} className="text-gray-400 hover:text-gray-600 flex-shrink-0">✕</button>
                      </div>
                    )}
                    {mentionOpen && showSenderName && (
                      <div className="px-4 pt-2 flex flex-wrap gap-1.5">
                        {people.map(p => (
                          <button key={p.id} onClick={() => insertMention(p.name)} className="text-xs bg-gray-100 hover:bg-green-100 text-gray-700 px-2.5 py-1 rounded-full">@{p.name}</button>
                        ))}
                      </div>
                    )}
                    <form onSubmit={send} className="px-4 py-3 flex gap-2 items-end">
                      <label className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full border border-gray-300 text-lg cursor-pointer hover:bg-gray-50" title="사진 보내기 (여러 장 = 한 묶음)">
                        🖼️
                        <input type="file" accept="image/*" multiple className="hidden"
                          onChange={e => { const fs = Array.from(e.target.files || []); if (fs.length) sendImages(fs); e.currentTarget.value = '' }} />
                      </label>
                      <label className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full border border-gray-300 text-lg cursor-pointer hover:bg-gray-50" title="파일 보내기">
                        📎
                        <input type="file" multiple className="hidden"
                          onChange={e => { const fs = Array.from(e.target.files || []); if (fs.length) handleIncomingFiles(fs); e.currentTarget.value = '' }} />
                      </label>
                      {showSenderName && (
                        <button type="button" onClick={() => setMentionOpen(o => !o)} title="멘션"
                          className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full border text-base ${mentionOpen ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>@</button>
                      )}
                      <textarea value={text} onChange={e => setText(e.target.value)}
                        rows={Math.min(5, Math.max(1, text.split('\n').length))}
                        onKeyDown={e => {
                          // PC: Enter=전송, Shift+Enter=줄바꿈. 모바일: Enter=줄바꿈(전송 버튼으로 보냄)
                          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing
                              && window.matchMedia('(hover: hover)').matches) {
                            e.preventDefault()
                            doSend()
                          }
                        }}
                        onPaste={e => {
                          const imgs = Array.from(e.clipboardData?.items || []).filter(it => it.type.startsWith('image/'))
                          if (imgs.length === 0) return
                          e.preventDefault()
                          const fs = imgs.map(it => it.getAsFile()).filter(Boolean) as File[]
                          if (fs.length) sendImages(fs)
                        }}
                        placeholder={editing ? '메시지 수정...' : '메시지 입력 · Shift+Enter 줄바꿈 · 캡처 Ctrl+V'}
                        className="flex-1 border border-gray-300 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none leading-relaxed" />
                      <button type="submit" disabled={sending || !text.trim()}
                        className="bg-green-600 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex-shrink-0">{editing ? '수정' : '전송'}</button>
                    </form>
                  </div>
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

      {/* 방 관리 모달 */}
      {showRoomSettings && active?.kind === 'room' && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold">방 관리</h2>
              <button onClick={() => setShowRoomSettings(false)} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-5">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">방 이름</label>
                <div className="flex gap-2">
                  <input value={renameVal} onChange={e => setRenameVal(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  <button onClick={saveRoomName} disabled={!renameVal.trim()} className="bg-green-600 text-white px-4 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">저장</button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">멤버 ({roomMemberIds.size}명)</label>
                <div className="border border-gray-200 rounded-lg max-h-60 overflow-auto">
                  {people.map(p => {
                    const inRoom = roomMemberIds.has(p.id)
                    return (
                      <div key={p.id} className="flex items-center gap-2.5 px-3 py-2.5 border-b border-gray-100 last:border-0">
                        <span className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs flex-shrink-0">{p.name?.slice(0, 1) || '?'}</span>
                        <span className="text-sm text-gray-800 flex-1 truncate">{p.name}</span>
                        {inRoom
                          ? <button onClick={() => removeRoomMember(p.id)} className="text-xs text-red-500 hover:text-red-700 flex-shrink-0">내보내기</button>
                          : <button onClick={() => addRoomMember(p.id)} className="text-xs text-green-600 hover:text-green-800 flex-shrink-0">+ 추가</button>}
                      </div>
                    )
                  })}
                </div>
              </div>
              <button onClick={leaveRoom} className="text-sm text-red-600 hover:text-red-800 py-2">채팅방 나가기</button>
            </div>
          </div>
        </div>
      )}

      {/* 채팅 사진 크게 보기 (좌우 넘김 + 내보내기/저장) */}
      {chatLightbox && (() => {
        const gallery = messages.filter(m => !m.is_deleted)
          .flatMap(m => (m.images && m.images.length ? m.images : (m.image_url ? [m.image_url] : [])))
        const idx = gallery.indexOf(chatLightbox)
        const go = (d: number) => { const n = idx + d; if (n >= 0 && n < gallery.length) setChatLightbox(gallery[n]) }
        return (
          <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4" onClick={() => setChatLightbox(null)}>
            <img src={chatLightbox} alt="" onClick={e => e.stopPropagation()} className="max-w-full max-h-[85vh] object-contain rounded-lg" />
            {idx > 0 && <button onClick={e => { e.stopPropagation(); go(-1) }} className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/20 hover:bg-white/30 text-white text-2xl flex items-center justify-center">‹</button>}
            {idx < gallery.length - 1 && <button onClick={e => { e.stopPropagation(); go(1) }} className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/20 hover:bg-white/30 text-white text-2xl flex items-center justify-center">›</button>}
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2" onClick={e => e.stopPropagation()}>
              {gallery.length > 1 && <span className="bg-black/50 text-white text-xs px-3 py-1.5 rounded-full">{idx + 1} / {gallery.length}</span>}
              <button onClick={() => shareUrl(chatLightbox!, '사진.jpg')} className="bg-white/20 hover:bg-white/30 text-white text-xs px-3 py-1.5 rounded-full">내보내기</button>
              <button onClick={() => downloadUrl(chatLightbox!, '사진.jpg')} className="bg-white/20 hover:bg-white/30 text-white text-xs px-3 py-1.5 rounded-full">저장</button>
            </div>
            <button onClick={() => setChatLightbox(null)} className="absolute top-4 right-4 text-white text-3xl leading-none">&times;</button>
          </div>
        )
      })()}
    </div>
  )
}
