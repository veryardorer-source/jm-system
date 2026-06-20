import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export const STATUS_LIST = [
  '상담중', '현장실측', '디자인중', '디자인확정',
  '견적작성중', '견적확정', '계약완료',
  '시공준비', '철거', '목공', '전기/설비', '타일',
  '도배/마루', '가구/조명', '입주청소', '완료'
] as const

export type ProjectStatus = typeof STATUS_LIST[number]

// 단계 그룹
export const STATUS_GROUPS = [
  { label: '디자인', color: 'purple', statuses: ['상담중', '현장실측', '디자인중', '디자인확정'] },
  { label: '견적/계약', color: 'yellow', statuses: ['견적작성중', '견적확정', '계약완료'] },
  { label: '시공', color: 'blue', statuses: ['시공준비', '철거', '목공', '전기/설비', '타일', '도배/마루', '가구/조명', '입주청소'] },
  { label: '완료', color: 'green', statuses: ['완료'] },
]

export const STATUS_COLOR: Record<string, string> = {
  '상담중':    'bg-purple-50 text-purple-600 border-purple-200',
  '현장실측':  'bg-purple-100 text-purple-700 border-purple-200',
  '디자인중':  'bg-purple-200 text-purple-800 border-purple-300',
  '디자인확정':'bg-purple-300 text-purple-900 border-purple-400',
  '견적작성중':'bg-yellow-100 text-yellow-700 border-yellow-200',
  '견적확정':  'bg-yellow-200 text-yellow-800 border-yellow-300',
  '계약완료':  'bg-yellow-300 text-yellow-900 border-yellow-400',
  '시공준비':  'bg-green-50 text-green-600 border-blue-200',
  '철거':      'bg-green-100 text-green-700 border-blue-200',
  '목공':      'bg-blue-200 text-green-800 border-green-300',
  '전기/설비': 'bg-green-300 text-blue-900 border-green-300',
  '타일':      'bg-cyan-200 text-cyan-800 border-cyan-300',
  '도배/마루': 'bg-cyan-300 text-cyan-900 border-cyan-300',
  '가구/조명': 'bg-teal-200 text-teal-800 border-teal-300',
  '입주청소':  'bg-teal-300 text-teal-900 border-teal-300',
  '완료':      'bg-green-100 text-green-700 border-green-200',
}

export const GROUP_BG: Record<string, string> = {
  'purple': 'bg-purple-50 border-purple-200',
  'yellow': 'bg-yellow-50 border-yellow-200',
  'blue':   'bg-green-50 border-blue-200',
  'green':  'bg-green-50 border-green-200',
}

export type Project = {
  id: string
  name: string
  client_name: string
  address: string
  status: ProjectStatus
  manager: string
  contract_date: string
  start_date: string
  end_date: string
  memo: string
  created_at: string
}

export type ProjectAssignment = {
  id: string
  project_id: string
  employee_name: string
  role: string
  task: string
  created_at: string
}

export type ProjectFile = {
  id: string
  project_id: string
  file_name: string
  file_url: string
  file_type: string
  category: string
  memo: string
  uploaded_by: string
  created_at: string
}

export type Receipt = {
  id: string
  project_id: string
  image_url: string
  memo: string
  amount: number
  uploaded_by: string
  is_processed: boolean
  created_at: string
}

export type WithdrawalRequest = {
  id: string
  project_id: string
  recipient: string
  amount: number
  bank_account: string
  reason: string
  image_url: string
  status: '요청' | '확인중' | '처리완료'
  requested_by: string
  created_at: string
}

export type ProjectCost = {
  id: string
  project_id: string
  title: string
  amount: number
  category: string
  cost_date: string
  memo: string
  created_at: string
}

export const COST_CATEGORY_LIST = ['자재비', '인건비', '장비비', '기타'] as const

export type PhaseStatus = '예정' | '진행중' | '완료'

export type Schedule = {
  id: string
  project_id: string
  task_name: string
  scheduled_date: string
  end_date: string
  manager: string
  is_done: boolean
  phase_status: PhaseStatus
  created_at: string
}

