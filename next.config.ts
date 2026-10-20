import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Coach voice STT may send a compressed audio clip through a Server Action.
  // Images are uploaded directly to Supabase Storage and must NOT go through
  // this path — keep the limit modest.
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
