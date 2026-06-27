import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// 쿠키 기반 브라우저 클라이언트 — 로그인 세션(쿠키)을 공유하므로
// 데이터 요청이 "로그인한 사용자"로 전송된다. (RLS 적용을 위해 필수)
export const supabase = createBrowserClient(supabaseUrl, supabaseKey)

export const STATUS_LIST = [
  '상담중', '디자인중', '견적중', '계약완료', '시공중', '완료', '중단'
] as const

export type ProjectStatus = typeof STATUS_LIST[number]

// 목록에서 기본적으로 숨기는 단계 (완료/중단된 현장) — 별도로 선택해야 보임
export const HIDDEN_STATUSES = ['완료', '중단'] as const

export const STATUS_COLOR: Record<string, string> = {
  '상담중':   'bg-purple-50 text-purple-600 border-purple-200',
  '디자인중': 'bg-purple-200 text-purple-800 border-purple-300',
  '견적중':   'bg-yellow-100 text-yellow-700 border-yellow-200',
  '계약완료': 'bg-yellow-300 text-yellow-900 border-yellow-400',
  '시공중':   'bg-green-200 text-green-800 border-green-300',
  '완료':     'bg-green-100 text-green-700 border-green-200',
  '중단':     'bg-red-50 text-red-500 border-red-200',
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

export type EmploymentType = '상용직' | '일용직'

export type Employee = {
  id: string
  name: string
  resident_number: string
  department: string
  phone: string
  hire_date: string
  resign_date: string
  bank_name: string
  account_number: string
  email: string
  employment_type: EmploymentType
  is_active: boolean
  memo: string
  created_at: string
}

export type DocVisibility = '전체공개' | '관리자만'

export type CompanyDocument = {
  id: string
  title: string
  category: string
  file_url: string
  file_name: string
  visibility: DocVisibility
  memo: string
  uploaded_by: string
  created_at: string
}

export const DOC_CATEGORY_LIST = ['사업자등록', '보험/안전', '계약서 양식', '인사/총무', '기타'] as const

export type FixedCost = {
  id: string
  month: string
  title: string
  amount: number
  memo: string
  created_at: string
}

export type Payroll = {
  id: string
  month: string
  employee_name: string
  amount: number
  memo: string
  created_at: string
}

export type ProjectProfit = {
  id: string
  project_id: string
  month: string
  revenue: number
  cost: number
  memo: string
  created_at: string
}

export type SalesRecord = {
  id: string
  month: string
  type: '매출' | '매입'
  amount: number
  file_url: string
  file_name: string
  memo: string
  created_at: string
}

export type ProjectCost = {
  id: string
  project_id: string
  month: string
  amount: number
  file_url: string
  file_name: string
  memo: string
  created_at: string
}

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

