import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default auth(function middleware(
  req: NextRequest & { auth: { user?: { id?: string } } | null }
) {
  const { pathname } = req.nextUrl;

  // Always allow auth API routes and static assets through
  if (
    pathname.startsWith("/api/auth") ||
    pathname === "/login" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/favicon.svg" ||
    pathname === "/icon" ||
    pathname === "/icon.png" ||
    pathname === "/apple-icon" ||
    pathname === "/apple-icon.png"
  ) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Inject user ID into proxied API requests so FastAPI knows who is calling.
  // If the session exists but user.id is somehow undefined, redirect to login
  // rather than falling through with a placeholder that bypasses user isolation.
  const userId = req.auth?.user?.id;
  if (!userId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const headers = new Headers(req.headers);
  headers.set("x-user-id", userId);
  return NextResponse.next({ request: { headers } });
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
