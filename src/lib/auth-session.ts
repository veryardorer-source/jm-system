// 기본 signOut()은 모든 기기의 refresh token을 무효화한다.
// 공용 회사 계정을 태블릿과 회의실에서 함께 쓸 때는 현재 기기만 로그아웃한다.
export async function signOutCurrentDevice(client: {
  auth: { signOut: (options: { scope: 'local' }) => Promise<{ error: Error | null }> }
}) {
  const { error } = await client.auth.signOut({ scope: 'local' })
  return error
}
