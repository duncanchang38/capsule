import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/todos", destination: "/today", permanent: true },
      { source: "/timeline", destination: "/today", permanent: true },
      { source: "/ideas", destination: "/library", permanent: true },
      { source: "/reading", destination: "/library", permanent: true },
      { source: "/organize", destination: "/library", permanent: true },
    ];
  },
  async rewrites() {
    // Explicitly list backend route prefixes so /api/auth/* is NOT proxied.
    // Next.js handles /api/auth/* internally via app/api/auth/[...nextauth]/route.ts.
    return [
      { source: "/api/chat", destination: `${BACKEND_URL}/chat` },
      { source: "/api/captures/:path*", destination: `${BACKEND_URL}/captures/:path*` },
      { source: "/api/organize", destination: `${BACKEND_URL}/organize` },
    ];
  },
};

export default nextConfig;
