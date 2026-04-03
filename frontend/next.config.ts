import type { NextConfig } from "next";

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
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/:path*",
      },
    ];
  },
};

export default nextConfig;
