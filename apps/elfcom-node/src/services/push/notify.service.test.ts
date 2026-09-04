import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { dispatchNotification } from "./notify.service.js";
import {
  __memSnapshot,
  __resetPushStore,
  upsertDeviceToken,
} from "./push-store.js";

describe("notify.service", () => {
  beforeEach(() => {
    __resetPushStore();
    process.env.ELFCOM_PUSH_DRY_RUN = "true";
  });

  it("dispatches high-priority job to all active tokens for a trustId", async () => {
    await upsertDeviceToken({
      trustId: "TD-TEST-1",
      appId: "trust_id_app",
      platform: "ANDROID",
      pushToken: "fcm-token-android-001",
      deviceId: "dev-1",
    });
    await upsertDeviceToken({
      trustId: "TD-TEST-1",
      appId: "elfcom_web",
      platform: "WEB",
      pushToken: "fcm-token-web-001",
      deviceId: "dev-2",
    });

    const result = await dispatchNotification({
      appId: "trust_id_app",
      targetTrustId: "TD-TEST-1",
      title: "Master Device approval",
      body: "Approve sign-in on Chrome · Lagos",
      priority: "MAX",
      channelId: "trust_id_security_alerts",
      dataPayload: {
        type: "master_device_approval",
        challengeId: "chal_123",
      },
    });

    assert.equal(result.dispatchedToCount, 2);
    assert.equal(result.successCount, 2);
    assert.equal(result.failureCount, 0);

    const snap = __memSnapshot();
    assert.equal(snap.jobs.length, 1);
    assert.equal(snap.jobs[0]?.status, "COMPLETED");
    assert.equal(snap.jobs[0]?.channelId, "trust_id_security_alerts");
    assert.equal(snap.deliveries.length, 2);
    assert.ok(snap.deliveries.every((d) => d.status === "SUCCESS"));
  });

  it("returns no_tokens when registry empty", async () => {
    await assert.rejects(
      () =>
        dispatchNotification({
          appId: "trust_id_app",
          targetTrustId: "TD-MISSING",
          title: "Hello",
          body: "World",
        }),
      (err: unknown) =>
        err instanceof Error && (err as Error & { code?: string }).code === "no_tokens",
    );
  });
});
