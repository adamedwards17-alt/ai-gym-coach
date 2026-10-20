"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  LOCAL_PREVIEW_COOKIE,
  localPreviewHostAllowed,
  localPreviewRuntimeAllowed,
} from "@/lib/auth/local-preview";
import { LOGIN_PATH, TODAY_PATH } from "@/lib/auth/paths";

async function requestHost(): Promise<string | null> {
  const headerList = await headers();
  return headerList.get("x-forwarded-host") ?? headerList.get("host");
}

export async function enterLocalPreview() {
  const host = await requestHost();
  const allowed =
    localPreviewRuntimeAllowed({
      nodeEnv: process.env.NODE_ENV,
      vercel: process.env.VERCEL,
    }) && localPreviewHostAllowed(host);

  if (!allowed) {
    redirect(LOGIN_PATH);
  }

  const cookieStore = await cookies();
  cookieStore.set(LOCAL_PREVIEW_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  redirect(TODAY_PATH);
}
