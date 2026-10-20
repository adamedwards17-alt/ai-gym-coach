import webpush from "web-push";
import { resolveVapidSubject } from "@/lib/push-subscription";

export type WebPushPayload = {
  title: string;
  body: string;
  url: string;
};

export function configureWebPush():
  | { ok: true; subjectLabel: string }
  | { ok: false; message: string } {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const resolved = resolveVapidSubject(
    process.env.VAPID_SUBJECT,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  );

  if (!publicKey || !privateKey) {
    return {
      ok: false,
      message:
        "Push isn’t configured yet. Add the VAPID keys on the server and try again.",
    };
  }

  try {
    webpush.setVapidDetails(resolved.subject, publicKey, privateKey);
  } catch (configError) {
    const detail =
      configError instanceof Error ? configError.name : "VapidConfigError";
    console.error("[push] VAPID configuration rejected:", detail);
    return {
      ok: false,
      message:
        "Push keys on the server are not valid. Check the VAPID variables and redeploy.",
    };
  }

  if (resolved.replacedLocalhost) {
    console.warn(
      "[push] VAPID subject is localhost, which Apple rejects. Using",
      resolved.subjectLabel,
    );
  }

  return { ok: true, subjectLabel: resolved.subjectLabel };
}

export async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: WebPushPayload,
): Promise<void> {
  await webpush.sendNotification(
    subscription,
    JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url,
    }),
  );
}
