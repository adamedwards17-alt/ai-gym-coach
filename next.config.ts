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
};

export default nextConfig;
