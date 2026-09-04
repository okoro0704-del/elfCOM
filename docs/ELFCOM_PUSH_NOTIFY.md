# ElfCom Universal Push — TrustID adapter & BaaS auth

## TrustID → ElfCom Master Device alert

```ts
/** trustid-api/src/adapters/elfcom-notify.ts */
const ELFCOM_BASE = process.env.ELFCOM_API_URL ?? "https://elfcomnode-production.up.railway.app";
const ELFCOM_BAAS_KEY = process.env.ELFCOM_BAAS_API_KEY!; // maps to trust_id_app in ELFCOM_BAAS_API_KEYS

export async function sendMasterDeviceApprovalPush(input: {
  targetTrustId: string;
  challengeId: string;
  deviceLabel: string;
  locationHint?: string;
}) {
  const res = await fetch(`${ELFCOM_BASE}/v1/baas/notify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ElfCom-Api-Key": ELFCOM_BAAS_KEY,
    },
    body: JSON.stringify({
      targetTrustId: input.targetTrustId,
      title: "Master Device approval required",
      body: `Approve sign-in on ${input.deviceLabel}${input.locationHint ? ` · ${input.locationHint}` : ""}`,
      priority: "MAX",
      channelId: "trust_id_security_alerts",
      dataPayload: {
        type: "master_device_approval",
        challengeId: input.challengeId,
        deepLink: `trustid://approvals/${input.challengeId}`,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`elfcom_notify_failed:${res.status}:${err}`);
  }
  return res.json() as Promise<{ jobId: string; dispatchedToCount: number }>;
}
```

Call this from the Master Device challenge creation path (after persisting the challenge).

## Service-to-service auth

| Surface | Auth |
|---------|------|
| `POST /v1/devices/register` | User TrustID / capability JWT — `trustId` forced to `sub` |
| `POST /v1/notify` | BaaS API key **or** JWT with scope `notify:send` |
| `POST /v1/baas/notify` | BaaS API key only (`X-ElfCom-Api-Key` or `Bearer elfcom_baas_<secret>`) |

Configure keys on ElfCom:

```bash
ELFCOM_BAAS_API_KEYS=trust_id_app:sk_trustid_live,life_os:sk_lifeos_live,finance_os:sk_finance_live
```

Optional tenant binding: `tenantA/trust_id_app:sk_...`

Recommendations for production:
1. Store secrets hashed at rest (migrate from plaintext env map to `baas_api_keys` table with SHA-256 of secret).
2. Rotate via dual-key window; never embed keys in mobile clients.
3. Rate-limit `/v1/baas/notify` per `appId` (e.g. 600/min).
4. Prefer mTLS or short-lived service JWTs (iss=trustid, aud=elfcom, scp=notify:send) for high-security paths; keep static API keys for simpler primitives.
