import { NextResponse } from "next/server";
import { isSupabase, supabaseServer } from "@/modules/auth/supabase";
import { currentUser } from "@/modules/auth/service";
import { createRecoveryGrant, setRecoveryCookie } from "@/modules/auth/recovery";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const origin = new URL(process.env.APP_ORIGIN || "http://127.0.0.1:3000").origin;
  const input = new URL(request.url),
    code = input.searchParams.get("code");
  try {
    if (!isSupabase() || !code || code.length > 4096) throw new Error("Invalid callback");
    const flowId = input.searchParams.get("sb_flow_id");
    const { data, error } = await (
      await supabaseServer()
    ).auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (error || !data.user || !data.session) throw new Error("Invalid exchange");
    const user = await currentUser();
    if (!user || user.id !== data.user.id) throw new Error("Invalid session");
    // Pinned SDK exposes redirectType at runtime from its PKCE verifier, not from query parameters.
    const recovery =
      (data as typeof data & { redirectType?: string | null }).redirectType === "recovery";
    if (recovery) {
      await setRecoveryCookie(await createRecoveryGrant(await getDb(), user.id));
      return NextResponse.redirect(`${origin}/reset-password`);
    }
    return NextResponse.redirect(`${origin}/app`);
  } catch {
    return NextResponse.redirect(`${origin}/forgot-password?error=callback`);
  }
}
