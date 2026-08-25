// 알림 소리 — 별도 음원 파일 없이 브라우저 오디오로 짧은 "띠링" 재생.
// 브라우저 정책상 사용자가 페이지를 한 번이라도 조작한 뒤부터 소리가 난다.
let ctx: AudioContext | null = null

const KEY = 'jm_sound_alert' // 'off'면 무음 (기기별 설정)

export function soundEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true
  return localStorage.getItem(KEY) !== 'off'
}

export function setSoundEnabled(on: boolean) {
  if (typeof localStorage === 'undefined') return
  if (on) localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, 'off')
}

export function playNotifySound() {
  if (!soundEnabled()) return
  try {
    ctx = ctx || new AudioContext()
    if (ctx.state === 'suspended') { ctx.resume().catch(() => {}) }
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, t)          // 라(A5)
    osc.frequency.setValueAtTime(1174.66, t + 0.09) // → 레(D6) 두 음 "띠링"
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.4)
  } catch { /* 오디오 미지원 환경은 조용히 무시 */ }
}
