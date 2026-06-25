import { supabase } from './supabase'

// 본인을 제외한 모든 직원에게 알림을 보낸다.
export async function notifyOthers(
  currentUserId: string | undefined,
  n: { type: string; title: string; body?: string; link?: string }
) {
  const { data: profs } = await supabase.from('profiles').select('id')
  if (!profs) return
  const rows = profs
    .filter(p => p.id !== currentUserId)
    .map(p => ({
      user_id: p.id,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
    }))
  if (rows.length) await supabase.from('notifications').insert(rows)
}
