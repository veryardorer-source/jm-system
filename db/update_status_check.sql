-- 진행단계를 7단계(상담중/디자인중/견적중/계약완료/시공중/완료/중단)로 변경
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('상담중', '디자인중', '견적중', '계약완료', '시공중', '완료', '중단'));
