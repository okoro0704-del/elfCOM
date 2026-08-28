# ElfCom Repository Audit — Messaging Primitive Gap Analysis

**Date:** 2026-08-26  
**Repo:** `ELFCOMS`  
**Scope:** Dual identity — standalone unified inbox + LifeOS messaging primitive  
**Maturity verdict:** Solid Phase A–D **engine + live connectors (credential-gated) + TrustID JWKS auth + P2P hooks + RouterService / primitive API / WebSocket**. Not full production consumer app. Rough readiness: **~70%** of the target architecture.

---

## 1. Implemented features (what is built)

### 1.1 Monorepo surface

| Unit | Path | Status |
|------|------|--------|
| Core API | `apps/elfcom-node` | Built — Fastify, in-memory store |
| Console UI | `apps/elfcom-console` | Built — Vite/React unified inbox |
| Contract | `packages/elfcom-contract` | Built — port types, channels, envelopes |
| Crypto | `packages/elfcom-crypto` | Built — AES-256-GCM, SessionBinder, blind indexes |
| Connectors core | `packages/elfcom-connectors-core` | Built — `IChannelConnector`, normalize, registry |
| Connectors | `packages/elfcom-connectors` | Built — WA/TG/email/IG/X ingress parsers |
| LifeOS adapter | `adapters/lifeos-http` | Built — `HttpElfComProvider` |
| Docs | `docs/ELFCOM_SOVEREIGN_NODE.md`, `PHASE_B_*`, `PHASE_B5_*` | Present |

**Not present:** `elfcom-web` (Pillar 1 consumer app), `elfcom-sdk-js`, `elfcom-baas-*`, Prisma/Postgres, WebSocket server, SMS, Facebook Messenger, encrypted P2P stack, `RouterService` / `InboxService` named services.

### 1.2 HTTP API (`elfcom-node`)

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/health` | phase B, connector list |
| `POST/DELETE` | `/v1/session/bind` | RAM ZK session bind |
| `POST` | `/v1/channels/link` | Blind-index channel link |
| `GET` | `/v1/inbox`, `/v1/threads` | Unified inbox (+ `?channel=`, `?envelope=1`) |
| `GET` | `/v1/threads/:threadId` | Thread detail |
| `GET` | `/v1/threads/:threadId/messages` | Messages (+ envelope mode) |
| `POST` | `/v1/threads/:threadId/messages` | Reply → origin connector (stub send) |
| `GET/POST` | `/v1/webhooks/:channel` | Provider ingress |

**Missing vs primitive target:** `POST /v1/messages/send`, `POST /v1/messages/batch`, `GET /v1/threads/:userId`, `WS /v1/events`, notification fanout APIs.

### 1.3 Connectors

| Channel | Ingress parse | Webhook verify | Outbound `send()` |
|---------|---------------|----------------|-------------------|
| WhatsApp | Yes (Cloud API shape) | Challenge + optional HMAC | **Stub** (`wa-stub-…`) |
| Telegram | Yes (Bot update) | Optional secret header | **Stub** |
| Email | Yes (ESP JSON bridge) | Optional HMAC | **Stub** |
| Instagram | Yes (Meta messaging) | Challenge + optional HMAC | **Stub** |
| X | Partial (DM events + CRC) | CRC only; POST sig always true if secret unset | **Stub** |
| `dm` / `bus` | Enum only | **No connector packages** | N/A |
| Facebook Messenger | **Absent** | — | — |
| SMS | **Absent** | — | — |
| P2P | **Absent** | — | — |

### 1.4 Auth, encryption, session

- Capability JWT (`aud=elfcom`, `sub`, `sid`, `zk_bind`, scopes) — `apps/elfcom-node/src/auth/node-jwt.ts`
- AES-256-GCM seal/open + AAD — `@elfcom/crypto`
- RAM `SessionBinder` — bind/unbind, seal ingress under session (crypto pkg); node persists with **user wrap key**
- Envelope rewrap for console client open — `listMessageEnvelopes` / `listThreadEnvelopes`
- Console Web Crypto open — `apps/elfcom-console/src/lib/crypto.ts`
- LifeOS bridge auto-bind + JWT mint — `adapters/lifeos-http`

### 1.5 Console (`elfcom-console`)

- Session gate (TrustID string + Phase-A HMAC session)
- Channel filter, thread list, thread pane, composer
- Polling (`VITE_POLL_MS`, default 4s) — **no WebSocket**
- Client-side envelope decrypt in RAM
- Dev JWT secret via `VITE_ELFCOM_NODE_SECRET` (not production-safe)

### 1.6 Persistence

- `MemoryMessageStore` + `ChannelLinkStore` only — **no durable DB**
- Restart loses all threads/messages/links

### 1.7 Tests

| Suite | Coverage |
|-------|----------|
| `elfcom-crypto` session-bind.test | Bind/open, bad zk_bind, seal AAD |
| `elfcom-connectors` whatsapp/telegram/email tests | parseIngress (+ WA challenge) |
| `elfcom-node` | **No dedicated tests** |
| `elfcom-console` | **No tests** |
| Instagram / X / webhook E2E / LifeOS adapter | **Missing** |

---

## 2. Architectural & interface alignment

### 2.1 Unified connector interface — **aligned (partial)**

`IChannelConnector` exists in `@elfcom/connectors-core` with `verifyWebhook`, `handleVerification?`, `parseIngress`, `send?`. Registry wires enabled channels from env. This matches the omnichannel design.

Gaps: no retry/backoff contract, no rate-limit hooks, no media download pipeline, no Facebook Messenger / SMS channel types.

### 2.2 RouterService — **not present**

Outbound dispatch is inline in `MessagingService.sendMessage` (call `registry.get(channel).send`). No:

- Named `RouterService`
- Fallback channel policies
- Outbox / DLQ / retry
- Idempotency keys
- Provider error taxonomy

### 2.3 InboxService — **partial (as MessagingService)**

Unified thread aggregation exists (`listThreads` / `listThreadEnvelopes` with channel filter, omni thread IDs). Not a separate `InboxService`; no cross-channel merge of the same human identity, no search, no labels/folders, no read-receipt sync.

### 2.4 LifeOS primitive API — **partial**

| Expected primitive | Status |
|--------------------|--------|
| `IElfComMessagingProvider` | Implemented (LifeOS + contract) |
| `HttpElfComProvider` | Implemented |
| `POST /v1/messages/send` | **Missing** (use `POST .../threads/:id/messages`) |
| `POST /v1/messages/batch` | **Missing** |
| `GET /v1/threads/:userId` | **Missing** (owner from JWT `sub`, not path) |
| Realtime WebSocket / notification bus | **Missing** (docs describe; code does not) |
| Experience shell notify (HospitalityOS etc.) | **Missing** (`bus` connector not built) |

---

## 3. Gap analysis & deprecations

### 3.1 Critical gaps (block production / dual identity)

1. **No durable storage** — memory only  
2. **All outbound connectors stubbed** — cannot actually reply on WA/IG/TG/email/X  
3. **No WebSocket / push** — LifeOS shells cannot get realtime events  
4. **No Facebook Messenger** channel (called out in product dual-identity)  
5. **No SMS**  
6. **No encrypted P2P** path  
7. **No `dm`/`bus` connectors** despite contract enums  
8. **Primitive route shapes** differ from Messaging Primitive Architecture (`/v1/messages/send`, batch, userId threads)  
9. **Console auth** embeds node HMAC secret in Vite env — must not ship  
10. **Unsigned webhooks allowed** when secrets unset (dev convenience → prod footgun)

### 3.2 Incomplete / legacy patterns to refactor

| Item | Issue |
|------|--------|
| `ELFCOM_DEV_INGRESS_OWNER` | Routes unlinked ingress to a hard-coded owner |
| `ELFCOM_DEV_AUTO_BIND` / Phase-A HMAC session keys | Placeholder for real ZK material |
| X `verifyWebhook` | Returns `true` unconditionally when not tightened |
| WhatsApp/IG verify | Skips signature if `appSecret` unset |
| Dual seal modes | Session vs user keys — workable but needs clear DEK rewrap story for multi-device |
| LifeOS port `ElfComMessage.body: string` | Assumes plaintext after open — fine for gateway, conflicts with “ciphertext to client only” unless envelope mode used end-to-end |

### 3.3 Test / webhook gaps

- No integration tests for `/v1/webhooks/*` → seal → `/v1/inbox`
- No IG/X fixture tests
- No adapter contract tests against live `elfcom-node`
- No console crypto round-trip tests
- No load/abuse tests on webhook endpoints

---

## 4. Actionable next steps

### Phase 1 — Production foundation (durability + safety)

1. Replace memory stores with Postgres (threads, messages ciphertext, channel_links, outbox).  
2. Require webhook secrets in non-dev; reject unsigned ingress.  
3. Remove / gate `ELFCOM_DEV_INGRESS_OWNER` and Vite-exposed node secrets.  
4. Add node integration tests: webhook → bind → inbox → reply outbox.  
5. Align primitive routes: add `POST /v1/messages/send` (+ optional alias to thread reply) and `POST /v1/messages/batch`.

### Phase 2 — Real outbound + RouterService

1. Extract `RouterService` (channel resolve, send, retries, DLQ).  
2. Implement real WhatsApp Cloud API `send`.  
3. Implement Telegram Bot `sendMessage`.  
4. Implement email ESP send.  
5. Then IG Graph send + X DM send.  
6. Persist outbox with idempotency keys.

### Phase 3 — LifeOS realtime primitive

1. `WS /v1/events` signed envelopes (as already specified in architecture docs).  
2. `bus` connector for HospitalityOS / TransportationOS / TrustID notify.  
3. LifeOS adapter: subscribe WS → shell notifications (no body in LifeOS DB).  
4. Account wipe hook → purge owner namespace.  
5. mTLS between LifeOS ↔ ElfCom.

### Phase 4 — Standalone consumer completeness

1. Facebook Messenger connector (Meta) — channel type + webhook + send.  
2. Harden Instagram as first-class (shared Meta app patterns).  
3. TrustID OAuth for console (kill browser JWT mint).  
4. Multi-device client-seal / vault keys (true P1 privacy).  
5. Optional SMS connector if product requires it.  
6. P2P encrypted messaging design spike (likely separate ratchet module — do not bolt onto webhook connectors).

### Phase 5 — Product polish & BaaS (later)

1. Search, labels, assignment (ops inbox).  
2. Media store + download pipeline.  
3. Pillar 4 tenant API/SDK.  
4. Observability (metrics, audit without plaintext).

---

## 5. Alignment scorecard

| Capability | Score | Notes |
|------------|-------|-------|
| Connector interface | High | `IChannelConnector` exists |
| Ingress normalize + seal | High | Working for 5 channels |
| Unified inbox UI | Medium | Console + polling; no WS |
| LifeOS port bind | Medium | Adapter works; limited surface |
| Outbound / router | Low | All stubs; no RouterService |
| Durability | None | Memory only |
| Realtime primitive | None | No WS/bus |
| Messenger / SMS / P2P | None | Not in codebase |
| Auth production posture | Low | Dev secrets in client; unsigned webhooks |

**Bottom line:** Keep the current sealed-ingress + `IChannelConnector` + LifeOS adapter as the core. Priority is **Postgres + real outbound RouterService + WebSocket bus**, then Messenger/SMS/P2P product expansion—not another greenfield rewrite.
