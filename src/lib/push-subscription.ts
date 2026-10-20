/**
 * Pure helpers for Web Push subscription payloads.
 * Secrets (VAPID private key, auth secrets) must never be logged.
 */

export type PushSubscriptionKeys = {
  p256dh: string;
  auth: string;
};

export type PushSubscriptionInput = {
  endpoint: string;
  keys: PushSubscriptionKeys;
};

const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 256;

export function isExpiredPushStatus(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

export function parsePushSubscription(
  value: unknown,
): { ok: true; subscription: PushSubscriptionInput } | { ok: false; message: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, message: "That notification subscription isn’t valid." };
  }

  const record = value as Record<string, unknown>;
  const endpoint = typeof record.endpoint === "string" ? record.endpoint.trim() : "";
  const keys =
    record.keys && typeof record.keys === "object"
      ? (record.keys as Record<string, unknown>)
      : null;
  const p256dh = keys && typeof keys.p256dh === "string" ? keys.p256dh.trim() : "";
  const auth = keys && typeof keys.auth === "string" ? keys.auth.trim() : "";

  if (!endpoint || endpoint.length > MAX_ENDPOINT_LENGTH) {
    return { ok: false, message: "That notification subscription isn’t valid." };
  }

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return { ok: false, message: "That notification subscription isn’t valid." };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, message: "That notification subscription isn’t valid." };
  }

  if (!p256dh || !auth || p256dh.length > MAX_KEY_LENGTH || auth.length > MAX_KEY_LENGTH) {
    return { ok: false, message: "That notification subscription isn’t valid." };
  }

  return {
    ok: true,
    subscription: { endpoint, keys: { p256dh, auth } },
  };
}

/** Host only — never log the full endpoint or encryption keys. */
export function pushEndpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "unknown";
  }
}
