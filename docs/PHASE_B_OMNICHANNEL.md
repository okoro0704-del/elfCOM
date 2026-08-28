# Phase B — Omnichannel Social Aggregator & Ingress Connectors (Pillar 3)

**Status:** In implementation  
**Depends on:** Phase A engine (`elfcom-node`, `@elfcom/crypto` SessionBinder, LifeOS adapter)  
**Pillar:** 3 — Central Omnichannel Communication Dashboard  
**Non-goals this phase:** BaaS tenancy (Pillar 4), native mobile apps (Pillar 1). Console UI is Wave B5.

---

## 1. Objectives

1. Modular **webhook ingestion adapters** for WhatsApp, Telegram, Instagram, X, and email.
2. A shared **normalization engine** → `NormalizedIngressPacket` → seal via `@elfcom/crypto`.
3. **Unified inbox routing** in `elfcom-node`: cross-platform threads, filterable inbox, reply path that targets the thread’s origin channel.

---

## 2. Architecture

```text
Provider webhooks / IMAP bridge
        │
        ▼
┌───────────────────┐  verify + parse   ┌────────────────────┐
│ Connector adapter │ ────────────────► │ ConnectorRegistry  │
│ (per channel)     │                   └─────────┬──────────┘
└───────────────────┘                             │
                                                  ▼
                                       ┌────────────────────┐
                                       │ Resolve owner via  │
                                       │ blind channel_links│
                                       └─────────┬──────────┘
                                                 │ NormalizedIngressPacket
                                                 │ (plaintext RAM only)
                                                 ▼
                                       ┌────────────────────┐
                                       │ Seal (user wrap    │
                                       │ key — no session)  │
                                       └─────────┬──────────┘
                                                 ▼
                                       ┌────────────────────┐
                                       │ Unified thread     │
                                       │ store (ciphertext) │
                                       └─────────┬──────────┘
                 ┌───────────────────────────────┼──────────────┐
                 ▼                               ▼              ▼
          GET /v1/inbox                   LifeOS port     Outbound connector
          (filter by channel)             /messaging/*    send() on reply
```

**Why user-key seal on ingress:** webhooks arrive without a ZK session bind. Durable ciphertext uses `deriveUserKey(master, ownerTrustId)`. Session bind is still required to *open* plaintext for the dashboard / LifeOS.

---

## 3. Connector interface

```ts
interface IChannelConnector {
  readonly channel: ElfComChannel;
  verifyWebhook(req: ConnectorHttpRequest): Promise<boolean>;
  handleVerification?(req: ConnectorHttpRequest): Promise<ConnectorVerifyResult | null>;
  parseIngress(req: ConnectorHttpRequest): Promise<ParsedIngress[]>;
  send?(packet: OutboundPacket): Promise<{ providerMessageId: string }>;
}
```

| Module | Channel | Ingress | Outbound (B) |
|--------|---------|---------|--------------|
| `@elfcom/connectors-core` | — | registry, normalize | — |
| `@elfcom/connectors` whatsapp | whatsapp | Cloud API webhook | stub |
| telegram | telegram | Bot update JSON | stub |
| email | email | ESP/IMAP bridge JSON | stub |
| instagram | instagram | Meta messaging webhook | stub |
| x | x | CRC + activity stub | stub |

---

## 4. Normalization rules

| Provider field | Packet field |
|----------------|--------------|
| Provider message id | `providerMessageId` |
| Channel enum | `channel` |
| SHA-256(raw body) | `rawProviderMetaHash` |
| Peer handle | `fromRef` = opaque `ref:{channel}:{blind}` |
| Inbox / bot id | `toRef` similarly |
| Text / caption | `plaintextBody` (RAM) then sealed |
| Media id | `mediaRef` + `contentType: media_ref` |
| Conversation key | `threadKey` = `omni:{channel}:{ownerBlind}:{peerBlind}` |

**Blind index:** `HMAC-SHA256(K_node, "handle|" + channel + "|" + normalizedHandle)`.

---

## 5. Unified inbox API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/v1/inbox?channel=` | Unified threads (+ channel filter) |
| `GET` | `/v1/threads` | Compat alias |
| `GET` | `/v1/threads/:id` | Includes `channel`, `peerRef` |
| `POST` | `/v1/threads/:id/messages` | Reply → seal + origin connector |
| `POST` | `/v1/channels/link` | Bind handle → owner under session |
| `GET/POST` | `/v1/webhooks/:channel` | Provider ingress |

---

## 6. Implementation roadmap

| Wave | Deliverable |
|------|-------------|
| **B0** | Spec + `@elfcom/connectors-core` |
| **B1** | WhatsApp + Telegram + Email adapters + webhook routes |
| **B2** | Channel link + user-key ingress seal + inbox filter |
| **B3** | Instagram + X adapters |
| **B4** | Outbound send stubs on reply |
| **B5** | `elfcom-console` — see PHASE_B5_CONSOLE.md |

---

## 7. Config

```bash
CONNECTORS_ENABLED=whatsapp,telegram,email,instagram,x
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
TELEGRAM_WEBHOOK_SECRET=
META_APP_SECRET=
X_CONSUMER_SECRET=
EMAIL_INBOUND_SECRET=
ELFCOM_DEV_INGRESS_OWNER=          # dev fallback owner for unlinked handles
```

---

## 8. Security

- Webhooks: provider signature only — not LifeOS JWT.
- Never log raw handles or bodies.
- Ingress seal = user wrap key; open still requires session bind.
- Channel link requires capability JWT `sub` match.
