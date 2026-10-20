"use server";

import webpush from "web-push";
import { getCurrentUser } from "@/lib/auth/session";
import {
  isExpiredPushStatus,
  parsePushSubscription,
  pushEndpointHost,
  type PushSubscriptionInput,
} from "@/lib/push-subscription";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type PushActionResult =
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

let vapidReady = false;

function configureVapid(): { ok: true } | { ok: false; message: string } {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:coach@localhost";

  if (!publicKey || !privateKey) {
    return {
      ok: false,
      message:
        "Push isn’t configured yet. Add the VAPID keys on the server and try again.",
    };
  }

  if (!vapidReady) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidReady = true;
  }

  return { ok: true };
}

export async function savePushSubscription(
  subscription: PushSubscriptionInput,
): Promise<PushActionResult> {
  const parsed = parsePushSubscription(subscription);
  if (!parsed.ok) {
    return { status: "error", message: parsed.message };
  }

  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: parsed.subscription.endpoint,
      p256dh: parsed.subscription.keys.p256dh,
      auth: parsed.subscription.keys.auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,endpoint" },
  );

  if (error) {
    console.error("[push] Save subscription failed:", error.message);
    return {
      status: "error",
      message: "Notifications couldn’t be saved. Try again.",
    };
  }

  return { status: "ok", message: "Notifications are on for this device." };
}

export async function removePushSubscription(
  endpoint: string,
): Promise<PushActionResult> {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    return { status: "error", message: "That subscription couldn’t be found." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", trimmed);

  if (error) {
    console.error("[push] Remove subscription failed:", error.message);
    return {
      status: "error",
      message: "Notifications couldn’t be turned off. Try again.",
    };
  }

  return { status: "ok", message: "Notifications are off for this device." };
}

/**
 * Sends a real Web Push to the signed-in user's own subscriptions.
 * Not a public send API.
 */
export async function sendTestPushNotification(): Promise<PushActionResult> {
  const vapid = configureVapid();
  if (!vapid.ok) {
    return { status: "error", message: vapid.message };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", user.id);

  if (error) {
    console.error("[push] List subscriptions failed:", error.message);
    return {
      status: "error",
      message: "Notifications couldn’t be loaded. Try again.",
    };
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return {
      status: "error",
      message: "Turn on notifications on this device before sending a test.",
    };
  }

  let delivered = 0;
  for (const row of rows) {
    if (
      typeof row.endpoint !== "string" ||
      typeof row.p256dh !== "string" ||
      typeof row.auth !== "string" ||
      typeof row.id !== "string"
    ) {
      continue;
    }

    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        JSON.stringify({
          title: "AI Gym Coach",
          body: "Test notification. Push is working on this device.",
          url: "/profile",
        }),
      );
      delivered += 1;
    } catch (sendError) {
      const statusCode =
        sendError &&
        typeof sendError === "object" &&
        "statusCode" in sendError &&
        typeof sendError.statusCode === "number"
          ? sendError.statusCode
          : undefined;

      console.error(
        "[push] Test send failed:",
        statusCode ?? "unknown",
        pushEndpointHost(row.endpoint),
      );

      if (isExpiredPushStatus(statusCode)) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("id", row.id)
          .eq("user_id", user.id);
      }
    }
  }

  if (delivered === 0) {
    return {
      status: "error",
      message:
        "The test couldn’t be delivered. Turn notifications on again and retry.",
    };
  }

  return {
    status: "ok",
    message:
      delivered === 1
        ? "Test notification sent."
        : `Test notification sent to ${delivered} devices.`,
  };
}
