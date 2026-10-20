import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isExpiredPushStatus,
  parsePushSubscription,
  pushEndpointHost,
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
});
