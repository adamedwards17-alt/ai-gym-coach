"use client";

import { useEffect, useState } from "react";
import {
  removePushSubscription,
  savePushSubscription,
  sendTestPushNotification,
} from "@/app/actions/push";

type SupportState = "checking" | "ready" | "ios-install" | "unsupported" | "denied";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandaloneDisplay(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true
  );
}

export function NotificationSettings() {
  const [support, setSupport] = useState<SupportState>("checking");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      if (isIos() && !isStandaloneDisplay()) {
        if (!cancelled) {
          setSupport("ios-install");
        }
        return;
      }

      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) {
          setSupport("unsupported");
        }
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) {
          setSupport("denied");
        }
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) {
          setSubscribed(Boolean(existing));
          setSupport("ready");
        }
      } catch {
        if (!cancelled) {
          setSupport("unsupported");
          setError("Notifications couldn’t be set up in this browser.");
        }
      }
    }

    queueMicrotask(() => {
      void prepare();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function enableNotifications() {
    if (busy || support !== "ready") {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setSupport(permission === "denied" ? "denied" : "ready");
        setError(
          permission === "denied"
            ? "Notifications are blocked. Allow them in system settings, then try again."
            : "Notifications stayed off.",
        );
        return;
      }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
      if (!publicKey) {
        setError("Notifications aren’t configured on this site yet.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = subscription.toJSON();
      const saved = await savePushSubscription({
        endpoint: json.endpoint ?? subscription.endpoint,
        keys: {
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
        },
      });
      if (saved.status !== "ok") {
        await subscription.unsubscribe();
        setError(saved.message);
        return;
      }
      setSubscribed(true);
      setMessage(saved.message);
    } catch {
      setError("Notifications couldn’t be turned on. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disableNotifications() {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint ?? "";
      await subscription?.unsubscribe();
      if (endpoint) {
        const removed = await removePushSubscription(endpoint);
        if (removed.status !== "ok") {
          setError(removed.message);
          return;
        }
        setMessage(removed.message);
      }
      setSubscribed(false);
    } catch {
      setError("Notifications couldn’t be turned off. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (busy || !subscribed) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await sendTestPushNotification();
      if (result.status !== "ok") {
        setError(result.message);
        return;
      }
      setMessage(result.message);
    } catch {
      setError("The test notification couldn’t be sent. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-[1.25rem] border border-border px-4 py-4">
      <h2 className="text-[13px] font-medium uppercase tracking-[0.16em] text-muted">
        Notifications
      </h2>
      {support === "checking" ? (
        <p className="mt-3 text-[14px] leading-6 text-muted">Checking this device…</p>
      ) : null}
      {support === "ios-install" ? (
        <p className="mt-3 text-[14px] leading-6 text-muted">
          On iPhone, notifications only work after you add AI Gym Coach to your
          Home Screen and open it from that icon. In Safari, tap Share, then Add
          to Home Screen.
        </p>
      ) : null}
      {support === "unsupported" ? (
        <p className="mt-3 text-[14px] leading-6 text-muted">
          This browser can’t receive notifications. Use the Home Screen app on
          iPhone, or a current desktop browser.
        </p>
      ) : null}
      {support === "denied" ? (
        <p className="mt-3 text-[14px] leading-6 text-muted">
          Notifications are blocked for this app. On iPhone, open Settings,
          then Notifications, and allow AI Gym Coach.
        </p>
      ) : null}
      {support === "ready" && !subscribed ? (
        <div className="mt-3">
          <p className="text-[14px] leading-6 text-muted">
            Get a test notification on this device. Coaching reminders are not
            scheduled yet.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void enableNotifications();
            }}
            className="mt-3 inline-flex h-11 items-center rounded-full bg-foreground px-4 text-[14px] font-medium text-background disabled:opacity-50"
          >
            {busy ? "Turning on…" : "Enable notifications"}
          </button>
        </div>
      ) : null}
      {support === "ready" && subscribed ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void sendTest();
            }}
            className="inline-flex h-11 items-center rounded-full bg-foreground px-4 text-[14px] font-medium text-background disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send test notification"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void disableNotifications();
            }}
            className="inline-flex h-11 items-center rounded-full border border-border px-4 text-[14px] text-foreground disabled:opacity-50"
          >
            Turn off
          </button>
        </div>
      ) : null}
      {message ? (
        <p className="mt-3 text-[13px] leading-6 text-foreground">{message}</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-[13px] leading-6 text-muted">
          {error}
        </p>
      ) : null}
    </section>
  );
}
