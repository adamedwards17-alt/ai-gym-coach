export const LOCAL_PREVIEW_COOKIE = "ai-gym-coach-preview";
export const LOCAL_PREVIEW_USER_ID = "00000000-0000-4000-8000-000000000001";

export function localPreviewRuntimeAllowed(env: {
  nodeEnv: string | undefined;
  vercel: string | undefined;
}): boolean {
  return env.nodeEnv === "development" && !env.vercel;
}

export function localPreviewHostAllowed(
  host: string | null | undefined,
): boolean {
  if (!host) {
    return false;
  }
  const value = host.split(",")[0]?.trim() ?? "";
  const hostname = (
    value.startsWith("[")
      ? value.slice(1, value.indexOf("]"))
      : value.split(":")[0]
  )?.toLowerCase();
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
}

/** Cookie alone is never enough. Development, not Vercel, and a local host. */
export function localPreviewRequestAllowed(input: {
  nodeEnv: string | undefined;
  vercel: string | undefined;
  host: string | null | undefined;
  cookieValue: string | undefined;
}): boolean {
  return (
    localPreviewRuntimeAllowed(input) &&
    localPreviewHostAllowed(input.host) &&
    input.cookieValue === "1"
  );
}

export function isLocalPreviewUser(user: { id: string } | null | undefined): boolean {
  return user?.id === LOCAL_PREVIEW_USER_ID;
}
