import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";

  const params = new URLSearchParams();
  if (searchParams.get("email")) params.set("email", searchParams.get("email")!);
  if (searchParams.get("handle")) params.set("handle", searchParams.get("handle")!);

  const res = await fetch(`${backendUrl}/auth/check?${params}`, {
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
