import type { NextConfig } from "next";

const SUPABASE_HOST = "btpgmtuvtkhdifpaynes.supabase.co";
// 파일 열기 프록시(/sf/…)가 가져올 저장소 — 로컬 미리보기에서만 바꿔 씀
const STORAGE_ORIGIN = process.env.STORAGE_PROXY_ORIGIN || `https://${SUPABASE_HOST}`;

// Content-Security-Policy — 아래 기능이 깨지지 않도록 예외를 명시한다:
//  · Supabase API/Realtime(https+wss), Storage 이미지·동영상
//  · next/image 최적화(/_next/image = self), HEIC 변환 미리보기(blob:), 캡처 붙여넣기(data:)
//  · 링크 미리보기 og:image(외부 https 이미지)
//  · PDF 제목 래퍼(about:blank 창은 여는 쪽 CSP를 상속 → embed의 Supabase PDF를 object-src로 허용)
//  · 웹 푸시 서비스워커(worker-src self)
//  · Next.js 런타임은 인라인 스크립트/스타일 필요('unsafe-inline'; nonce 도입 전까지)
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https:`,
  `media-src 'self' blob: https://${SUPABASE_HOST}`,
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST}`,
  "font-src 'self' data:",
  `object-src 'self' https://${SUPABASE_HOST}`,
  `frame-src 'self' https://${SUPABASE_HOST}`,
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" }, // frame-ancestors 미지원 구형 브라우저용 이중 방어
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  images: {
    // Supabase 스토리지 사진을 Vercel이 자동 축소(썸네일)해 제공 — 모바일 로딩 속도 개선
    remotePatterns: [
      { protocol: "https", hostname: SUPABASE_HOST },
    ],
  },
  async headers() {
    return [
      // 앱 화면 전체 — 파일 프록시(/sf/…)는 제외: PDF·사진 자체를 브라우저 뷰어·MS 뷰어에 띄워야 해서 프레임 금지·CSP를 걸면 안 열림
      { source: "/((?!sf/).*)", headers: securityHeaders },
      { source: "/sf/:path*", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }] },
    ];
  },
  // 파일 열기 주소 끝을 '올린 파일명'으로 — /sf/<저장소 경로>/<파일명> → Supabase 공개 파일
  // 저장소는 한글 경로를 못 써서 숫자 이름(1785…pdf)으로 보관 → 뷰어에서 다운로드·다른 이름으로 저장 시 숫자 이름이 되던 문제.
  // 우리 주소로 열면 브라우저가 주소 끝(올린 파일명)을 이름으로 쓴다. (lib/media.ts viewUrl)
  async rewrites() {
    return [{ source: "/sf/:path*/:name", destination: `${STORAGE_ORIGIN}/storage/v1/object/public/:path*` }];
  },
};

export default nextConfig;
