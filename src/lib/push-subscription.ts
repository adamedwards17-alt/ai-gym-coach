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

const LOCAL_PUSH_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

/** Used only when VAPID_SUBJECT is localhost. Apple rejects localhost contacts. */
export const FALLBACK_VAPID_SUBJECT =
  "https://github.com/adamedwards17-alt/ai-gym-coach";

export function isLocalPushHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return LOCAL_PUSH_HOSTS.has(host) || host.endsWith(".localhost");
}

function subjectHost(subject: string): string | null {
  let url: URL;
  try {
    url = new URL(subject);
  } catch {
    return null;
  }
  if (url.protocol === "mailto:") {
    const address = decodeURIComponent(url.pathname);
    const at = address.lastIndexOf("@");
    if (at < 0) {
      return null;
    }
    return address.slice(at + 1);
  }
  if (url.protocol === "https:") {
    return url.hostname;
  }
  return null;
}

/** Apple returns 403 BadJwtToken for mailto:user@localhost and https://localhost. */
export function isAppleAcceptedVapidSubject(subject: string): boolean {
  const host = subjectHost(subject.trim());
  return Boolean(host) && !isLocalPushHost(host ?? "");
}

export function resolveVapidSubject(
  configured: string | undefined,
  productionHost: string | undefined,
): {
  ok: true;
  subject: string;
  replacedLocalhost: boolean;
  subjectLabel: string;
} {
  const trimmed = configured?.trim() ?? "";
  if (trimmed && isAppleAcceptedVapidSubject(trimmed)) {
    const mailto = trimmed.toLowerCase().startsWith("mailto:");
    return {
      ok: true,
      subject: trimmed,
      replacedLocalhost: false,
      subjectLabel: mailto ? "mailto" : "https",
    };
  }

  const host = productionHost?.trim() ?? "";
  if (
    host &&
    !host.includes("://") &&
    !host.includes("/") &&
    !isLocalPushHost(host)
  ) {
    return {
      ok: true,
      subject: `https://${host}`,
      replacedLocalhost: true,
      subjectLabel: "production-site",
    };
  }

  return {
    ok: true,
    subject: FALLBACK_VAPID_SUBJECT,
    replacedLocalhost: true,
    subjectLabel: "fallback-https",
  };
}

/** Apple's error body is {"reason":"BadJwtToken"}. Keep only that short token. */
export function pushProviderReason(body: unknown): string | undefined {
  if (typeof body !== "string" || body.length === 0 || body.length > 500) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || !("reason" in parsed)) {
      return undefined;
    }
    const reason = (parsed as { reason: unknown }).reason;
    if (typeof reason !== "string" || !/^[A-Za-z0-9_]{1,64}$/.test(reason)) {
      return undefined;
    }
    return reason;
  } catch {
    return undefined;
  }
}

export function testPushFailureMessage(
  statusCode: number | undefined,
  reason: string | undefined,
): string {
  if (reason === "VapidPkHashMismatch") {
    return "This device was registered with a different notification key. Turn notifications off, then on again, and retry.";
  }
  if (reason === "BadJwtToken" || statusCode === 401 || statusCode === 403) {
    return "The notification service rejected the sender setup. Try again after the latest update is deployed.";
  }
  if (isExpiredPushStatus(statusCode)) {
    return "This device’s notification registration expired. Turn notifications on again, then retry.";
  }
  if (typeof statusCode === "number") {
    return `The test couldn’t be delivered (error ${statusCode}). Try again.`;
  }
  return "The test couldn’t be delivered. Try again.";
}
