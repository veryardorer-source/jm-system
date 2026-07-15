import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Supabase 스토리지 사진을 Vercel이 자동 축소(썸네일)해 제공 — 모바일 로딩 속도 개선
    remotePatterns: [
      { protocol: "https", hostname: "btpgmtuvtkhdifpaynes.supabase.co" },
    ],
  },
};

export default nextConfig;
