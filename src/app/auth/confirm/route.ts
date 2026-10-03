import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/supabase/client";

export async function GET(request: NextRequest) {
  if (!isConfigured()) return NextResponse.redirect(new URL("/auth/error", request.url));
  const params = request.nextUrl.searchParams;
  const token_hash = params.get("token_hash");
  if (token_hash && params.get("type") === "signup") {
    const client = await serverClient();
    const { error } = await client.auth.verifyOtp({ token_hash, type: "signup" as EmailOtpType });
    if (!error) return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  const code = params.get("code");
  if (code) {
    const client = await serverClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.redirect(new URL("/auth/error", request.url));
}
