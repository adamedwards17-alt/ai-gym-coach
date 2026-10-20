import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FALLBACK_VAPID_SUBJECT,
  isAppleAcceptedVapidSubject,
  isExpiredPushStatus,
  parsePushSubscription,
  pushEndpointHost,
  pushProviderReason,
  resolveVapidSubject,
  testPushFailureMessage,
} from "@/lib/push-subscription";

describe("push subscription validation", () => {
  const valid = {
    endpoint: "https://web.push.apple.com/example",
    keys: { p256dh: "p256", auth: "authkey" },
  };

  it("accepts an https subscription", () => {
    const result = parsePushSubscription(valid);
    assert.equal(result.ok, true);
  });

  it("rejects http endpoints and missing keys", () => {
    assert.equal(
      parsePushSubscription({ ...valid, endpoint: "http://example.com/push" }).ok,
      false,
    );
    assert.equal(parsePushSubscription({ endpoint: valid.endpoint }).ok, false);
  });

  it("treats 404 and 410 as expired subscriptions", () => {
    assert.equal(isExpiredPushStatus(404), true);
    assert.equal(isExpiredPushStatus(410), true);
    assert.equal(isExpiredPushStatus(500), false);
  });

  it("logs only the push host", () => {
    assert.equal(
      pushEndpointHost("https://web.push.apple.com/secret-token"),
      "web.push.apple.com",
    );
  });

  it("rejects localhost VAPID subjects that Apple rejects", () => {
    assert.equal(isAppleAcceptedVapidSubject("mailto:coach@localhost"), false);
    assert.equal(isAppleAcceptedVapidSubject("https://localhost/push"), false);
    assert.equal(isAppleAcceptedVapidSubject("mailto:coach@example.com"), true);
    assert.equal(isAppleAcceptedVapidSubject("https://gym.example.com"), true);
  });

  it("replaces a localhost subject with the production site, then a public https fallback", () => {
    const production = resolveVapidSubject(
      "mailto:coach@localhost",
      "gym.example.com",
    );
    assert.equal(production.subject, "https://gym.example.com");
    assert.equal(production.replacedLocalhost, true);
    assert.equal(production.subjectLabel, "production-site");

    const fallback = resolveVapidSubject("mailto:coach@localhost", undefined);
    assert.equal(fallback.subject, FALLBACK_VAPID_SUBJECT);
    assert.equal(fallback.subject.includes("localhost"), false);
  });

  it("keeps a real mailto subject and only reads Apple's reason token", () => {
    const kept = resolveVapidSubject("mailto:coach@example.com", "gym.example.com");
    assert.equal(kept.subject, "mailto:coach@example.com");
    assert.equal(kept.replacedLocalhost, false);

    assert.equal(
      pushProviderReason('{"reason":"BadJwtToken","endpoint":"https://secret"}'),
      "BadJwtToken",
    );
    assert.equal(pushProviderReason("https://web.push.apple.com/secret"), undefined);
    assert.equal(testPushFailureMessage(403, "BadJwtToken").includes("403"), false);
    assert.equal(
      testPushFailureMessage(403, "VapidPkHashMismatch").includes("different notification key"),
      true,
    );
  });
});
