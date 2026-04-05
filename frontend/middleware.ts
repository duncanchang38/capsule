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
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Inject user ID into proxied API requests so FastAPI knows who is calling
  const userId = req.auth?.user?.id ?? "default";
  const headers = new Headers(req.headers);
  headers.set("x-user-id", userId);
  return NextResponse.next({ request: { headers } });
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
