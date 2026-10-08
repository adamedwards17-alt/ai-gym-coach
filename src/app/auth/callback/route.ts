import { NextResponse } from "next/server";
import { getPostAuthPath } from "@/lib/auth/session";
import { LOGIN_PATH } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");

  if (oauthError || !code) {
    return NextResponse.redirect(`${origin}${LOGIN_PATH}?error=callback`);
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}${LOGIN_PATH}?error=config`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}${LOGIN_PATH}?error=callback`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}${LOGIN_PATH}?error=session`);
  }

  const path = await getPostAuthPath(user.id);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";

  if (isLocalEnv) {
    return NextResponse.redirect(`${origin}${path}`);
  }

  if (forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${path}`);
  }

  return NextResponse.redirect(`${origin}${path}`);
}
