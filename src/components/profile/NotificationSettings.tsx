"use client";

import { useEffect, useState } from "react";
import {
  getCoachingPreferences,
  updateCoachingPreferences,
} from "@/app/actions/coaching-preferences";
import {
  removePushSubscription,
  savePushSubscription,
  sendTestPushNotification,
} from "@/app/actions/push";
import { DEFAULT_TIME_ZONE } from "@/lib/coaching-notifications";

type SupportState = "checking" | "ready" | "ios-install" | "unsupported" | "denied";

const TIME_ZONES = [
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Kolkata",
];

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
  const [coachingEnabled, setCoachingEnabled] = useState(true);
  const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      const prefs = await getCoachingPreferences();
      if (!cancelled && prefs.status === "ok") {
        setCoachingEnabled(prefs.preferences.enabled);
        setTimeZone(prefs.preferences.timeZone);
        setPrefsReady(true);
      } else if (!cancelled) {
        setPrefsReady(true);
      }

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
            Turn on notifications for this device, then coaching reminders can
            arrive when they are useful.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void enableNotifications();
            }}
            className="mt-3 inline-flex h-11 items-center rounded-full bg-primary px-4 text-[14px] font-medium text-white disabled:opacity-50"
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
            className="inline-flex h-11 items-center rounded-full bg-primary px-4 text-[14px] font-medium text-white disabled:opacity-50"
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
      {prefsReady ? (
        <div className="mt-4 border-t border-border pt-4">
          <label className="flex items-start gap-3 text-[14px] leading-6">
            <input
              type="checkbox"
              className="mt-1"
              checked={coachingEnabled}
              disabled={busy}
              onChange={(event) => {
                const enabled = event.target.checked;
                setCoachingEnabled(enabled);
                setBusy(true);
                setError(null);
                void updateCoachingPreferences({ enabled, timeZone }).then((result) => {
                  setBusy(false);
                  if (result.status !== "ok") {
                    setCoachingEnabled(!enabled);
                    setError(result.message);
                    return;
                  }
                  setMessage(
                    enabled
                      ? "Coaching reminders are on."
                      : "Coaching reminders are off. Test notifications still work.",
                  );
                });
              }}
            />
            <span>
              Coaching reminders
              <span className="mt-1 block text-[13px] leading-6 text-muted">
                At most two a day, never overnight (9:30pm–7:00am), and never for
                something you have already done. The test button is separate.
              </span>
            </span>
          </label>
          <label className="mt-4 block text-[13px] leading-6 text-muted">
            Timezone
            <select
              value={timeZone}
              disabled={busy}
              onChange={(event) => {
                const nextZone = event.target.value;
                setTimeZone(nextZone);
                setBusy(true);
                setError(null);
                void updateCoachingPreferences({
                  enabled: coachingEnabled,
                  timeZone: nextZone,
                }).then((result) => {
                  setBusy(false);
                  if (result.status !== "ok") {
                    setError(result.message);
                    return;
                  }
                  setMessage("Timezone saved.");
                });
              }}
              className="mt-2 h-11 w-full rounded-xl border border-border bg-transparent px-3 text-[14px] text-foreground"
            >
              {TIME_ZONES.includes(timeZone) ? null : (
                <option value={timeZone}>{timeZone}</option>
              )}
              {TIME_ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
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
