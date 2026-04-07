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
    // /api/auth/[...nextauth] is handled internally by Next.js/NextAuth.
    // The backend auth routes (check, register, forgot-password, reset-password)
    // use the same /api/auth prefix but are NOT NextAuth routes — proxy them explicitly.
    return [
      { source: "/api/chat", destination: `${BACKEND_URL}/chat` },
      { source: "/api/captures", destination: `${BACKEND_URL}/captures` },
      { source: "/api/captures/:path*", destination: `${BACKEND_URL}/captures/:path*` },
      { source: "/api/organize", destination: `${BACKEND_URL}/organize` },
      { source: "/api/auth/check", destination: `${BACKEND_URL}/auth/check` },
      { source: "/api/auth/register", destination: `${BACKEND_URL}/auth/register` },
      { source: "/api/auth/forgot-password", destination: `${BACKEND_URL}/auth/forgot-password` },
      { source: "/api/auth/reset-password", destination: `${BACKEND_URL}/auth/reset-password` },
    ];
  },
};

export default nextConfig;
