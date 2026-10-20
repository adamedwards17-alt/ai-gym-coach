import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  localPreviewHostAllowed,
  localPreviewRequestAllowed,
  localPreviewRuntimeAllowed,
} from "@/lib/auth/local-preview";

describe("local preview gate", () => {
  it("allows only a development process that is not on Vercel", () => {
    assert.equal(
      localPreviewRuntimeAllowed({ nodeEnv: "development", vercel: undefined }),
      true,
    );
    assert.equal(
      localPreviewRuntimeAllowed({ nodeEnv: "production", vercel: undefined }),
      false,
    );
    assert.equal(
      localPreviewRuntimeAllowed({ nodeEnv: "development", vercel: "1" }),
      false,
    );
  });

  it("allows localhost hosts only", () => {
    assert.equal(localPreviewHostAllowed("localhost:3000"), true);
    assert.equal(localPreviewHostAllowed("127.0.0.1:3000"), true);
    assert.equal(localPreviewHostAllowed("[::1]:3000"), true);
    assert.equal(localPreviewHostAllowed("ai-gym-coach.vercel.app"), false);
    assert.equal(localPreviewHostAllowed(null), false);
  });

  it("requires the preview cookie as well as the local runtime", () => {
    const local = {
      nodeEnv: "development",
      vercel: undefined,
      host: "localhost:3000",
    };
    assert.equal(
      localPreviewRequestAllowed({ ...local, cookieValue: "1" }),
      true,
    );
    assert.equal(
      localPreviewRequestAllowed({ ...local, cookieValue: undefined }),
      false,
    );
    assert.equal(
      localPreviewRequestAllowed({
        nodeEnv: "production",
        vercel: "1",
        host: "localhost:3000",
        cookieValue: "1",
      }),
      false,
    );
  });
});
