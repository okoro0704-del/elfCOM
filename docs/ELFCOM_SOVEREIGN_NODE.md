# ElfCom Sovereign Communication Platform — Architecture Spec

**Status:** Phase A engine online · product scope expanded to four pillars  
**Repo:** `ELFCOMS` — independent platform (not a LifeOS microservice)  
**LifeOS port:** `IElfComMessagingProvider` (Pillar 2 integration only)  
**DataZone:** Separate repository — optional cold-archive later; never a hot-path dependency

ElfCom is a **multi-faceted sovereign communication platform**. LifeOS is one consumer among several. The same encrypted core powers a standalone messenger, ecosystem backbone, omnichannel inbox, and external BaaS.

---

## 0. Product vision — four pillars

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                     ElfCom Sovereign Platform Core                       │
│   crypto · session bind · sealed store · normalize · realtime · tenancy  │
└────────────┬─────────────┬──────────────┬──────────────┬─────────────────┘
             │             │              │              │
     ┌───────▼──────┐ ┌────▼─────┐ ┌──────▼──────┐ ┌─────▼──────┐
     │ Pillar 1     │ │ Pillar 2 │ │ Pillar 3    │ │ Pillar 4   │
     │ Consumer App │ │ Ecosystem│ │ Omnichannel │ │ BaaS API / │
     │ (native UX)  │ │ Backbone │ │ Dashboard   │ │ SDK        │
     └──────────────┘ └──────────┘ └─────────────┘ └────────────┘
```

| Pillar | Name | Who it serves | Independence |
|--------|------|---------------|--------------|
| **1** | Standalone Consumer Chat App | End users as daily private messenger | Runs **without** LifeOS |
| **2** | Ecosystem Messaging Infrastructure | LifeOS, TrustID, DataZone notifications, experiences | Port/adapter bound; ElfCom remains source of truth |
| **3** | Central Omnichannel Dashboard | Users / operators aggregating social + messaging | Unified inbox over sealed streams |
| **4** | External BaaS Provider | Third-party developers & apps | Multi-tenant API keys, SDKs, webhooks |

### Shared hard rules (all pillars)

1. **Client-side / session-bound open:** plaintext exists only in memory under an active cryptographic session — never as durable rows in LifeOS or tenant DBs outside sealed envelopes.
2. **Zero-metadata leakage (Pillar 1 target):** minimize server-visible social graph, contact lists, and preview text; prefer sealed indexes and opaque ids.
3. **Local key management (Pillar 1):** device vault / TrustID Tier-1 holds identity keys; server holds only wrapped DEKs or opaque envelopes it cannot open without session bind.
4. **Normalize once:** every channel (native DM, bus, WhatsApp, IG, X, Telegram, email) → `NormalizedIngressPacket` → seal → stream.
5. **Tenancy:** ecosystem identities use `ownerTrustId`; BaaS tenants use `tenantId` + app-scoped subjects — same engine, different auth front-doors.
6. **DataZone deferred:** hot path never blocks on DataZone.

---

## 1. Pillar blueprints

### Pillar 1 — Standalone Consumer Chat App

**Intent:** ElfCom as a daily private messenger with its own clients (web / future native), fully encrypted, usable with only TrustID (or ElfCom-local identity) — **no LifeOS required**.

| Surface | Responsibility |
|---------|----------------|
| `apps/elfcom-web` (and later mobile) | Chat UI, local key store bridge, sealed sync |
| `apps/elfcom-node` `/v1/app/*` | Consumer auth session, device register, sync |
| `@elfcom/crypto` + client SDK | Seal before leave device when possible; open only in client RAM |
| TrustID | Optional IdP; ZK / device trust |

**Privacy targets**

- No plaintext previews in server responses without session bind.
- Contact discovery via sealed / blind indexes — not searchable email/phone columns.
- Delivery receipts and typing indicators are optional and sealed or ephemeral.
- Server logs: `{ sub, op, threadId }` only — never body, never raw handles.

**Data flow (Pillar 1)**

```text
┌──────────────┐   TrustID OAuth/ZK    ┌─────────────┐
│ elfcom-web   │ ────────────────────► │ TrustID     │
│ (local keys) │ ◄── session material ─┤             │
└──────┬───────┘                       └─────────────┘
       │ mTLS / TLS + device JWT
       │ client seals outbound (preferred) OR session-bind open path
       ▼
┌──────────────────────────────────────────────────────┐
│ elfcom-node  · sealed store · WS envelopes           │
│  plaintext NEVER durable; open only if policy allows │
│  in-memory session bind for legacy open-at-edge path │
└──────────────────────────────────────────────────────┘
```

### Pillar 2 — Ecosystem Messaging Infrastructure

**Intent:** Primary E2E messaging backbone for sovereign apps (LifeOS shell, TrustID notices, DataZone events, experience DMs).

| Surface | Responsibility |
|---------|----------------|
| `adapters/lifeos-http` | `IElfComMessagingProvider` → node |
| LifeOS `/messaging/*` | Session façade only — no body persistence |
| `channel: bus` | Internal signed event bus for ecosystem services |
| Capability JWT | `iss=lifeos|trustid|datazone`, `aud=elfcom` |

**Data flow (Pillar 2)**

```text
TrustID ──ZK session──► LifeOS gateway
                          │ container.bindElfCom(HttpElfComProvider)
                          │ capability JWT (aud=elfcom, sid, zk_bind)
                          ▼
                       ElfCom node
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
     LifeOS UX      TrustID notify   DataZone events
     (port)         (bus publisher)  (bus / webhook)
```

LifeOS never embeds channel SDKs. Notification indexes may store deep links + redacted titles only.

### Pillar 3 — Central Omnichannel Communication Dashboard

**Intent:** One encrypted inbox aggregating official APIs and secure bridges: WhatsApp, Instagram, X, Telegram, email — plus native ElfCom DMs.

| Surface | Responsibility |
|---------|----------------|
| `apps/elfcom-console` (web) | Unified inbox, channel linking, routing rules |
| `packages/elfcom-connectors-*` | Per-network ingress/egress |
| Normalize pipeline | Provider payload → `NormalizedIngressPacket` → seal |
| Blind channel links | Handle ↔ owner without plaintext columns |

**Data flow (Pillar 3)**

```text
WhatsApp ──┐
Instagram ─┤  webhooks / bridges (verify sig)
X ─────────┤
Telegram ──┤
Email ─────┘
       │
       ▼
┌──────────────────┐     seal      ┌─────────────────┐
│ Connector layer  │ ───────────►  │ Sealed streams  │
│ normalize+map    │               │ (per owner)     │
└──────────────────┘               └────────┬────────┘
                                            │
                    ┌───────────────────────┼──────────────────┐
                    ▼                       ▼                  ▼
             elfcom-console           elfcom-web          LifeOS Messages
             (omni dashboard)         (Pillar 1)          (Pillar 2 port)
```

### Pillar 4 — External BaaS Messaging Infrastructure

**Intent:** Package the core as developer Backend-as-a-Service: API + SDKs so third parties get secure chat, notifications, and customer comms without building crypto/channel plumbing.

| Surface | Responsibility |
|---------|----------------|
| `apps/elfcom-node` `/v1/baas/*` | Tenant API keys, scoped JWTs, rate limits |
| `packages/elfcom-sdk-js` (+ later mobile) | Drop-in chat / notify client |
| `packages/elfcom-webhook-dispatch` | Signed webhooks to tenant backends |
| Tenant console (subset of console) | Apps, keys, channel packs, usage |

**Data flow (Pillar 4)**

```text
Third-party app                    ElfCom BaaS
┌─────────────────┐               ┌────────────────────────────┐
│ App backend     │  API key /    │ Tenant isolation           │
│ + elfcom-sdk    │  mTLS JWT ──► │ /v1/baas/threads|messages  │
└────────┬────────┘               │ /v1/baas/notify            │
         │                        │ sealed store (tenant ns)   │
         │ ◄── signed webhooks ── │ channel pack (optional)    │
         ▼                        └────────────────────────────┘
   End users of
   third-party app
```

**BaaS tenancy model**

```text
tenant_id
  └── app_id
        └── subject (external user id or TrustID link)
              └── threads / messages (sealed under tenant DEK hierarchy)
```

---

## 2. Platform placement (ecosystem + external)

```text
                         ┌─────────────────────┐
                         │ TrustID (IdP / ZK)  │
                         └──────────┬──────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           ▼                           │
        │              ┌────────────────────────┐               │
        │              │  ElfCom Platform Core  │               │
        │              │  node · crypto · bus   │               │
        │              └─┬─────┬─────┬─────┬────┘               │
        │                │     │     │     │                    │
   ┌────▼────┐     ┌─────▼┐ ┌──▼──┐ ┌▼────▼──┐          ┌──────▼──────┐
   │Pillar 1 │     │ P2   │ │ P3  │ │ P4 BaaS│          │ Omnichannel │
   │Consumer │     │LifeOS│ │Dash │ │ tenants│          │ providers   │
   │ clients │     │Trust │ │board│ │ SDKs   │          │ WA/IG/X/…   │
   └─────────┘     │DataZ │ └─────┘ └────────┘          └─────────────┘
                   └──────┘
```

---

## 3. Core engine (shared by all pillars)

Phase A already ships the seed of this engine: `@elfcom/contract`, `@elfcom/crypto` (`SessionBinder`, AES-256-GCM), `apps/elfcom-node` REST + JWT, `adapters/lifeos-http`.

### 3.1 Port contract (Pillar 2 — LifeOS)

Canonical LifeOS interface (mirrored in `@elfcom/contract`):

```ts
export interface IElfComMessagingProvider {
  readonly nodeId: "elfcom";
  readonly bound: boolean;
  listThreads(ownerTrustId: string): Promise<ElfComThread[]>;
  getThread(ownerTrustId: string, threadId: string): Promise<ElfComThread | null>;
  listMessages(ownerTrustId: string, threadId: string): Promise<ElfComMessage[]>;
  sendMessage(input: {
    ownerTrustId: string;
    threadId: string;
    body: string;
  }): Promise<ElfComMessage>;
}
```

Richer APIs live on the **node** (`/v1/app/*`, `/v1/baas/*`, webhooks) and do not have to widen this port immediately.

### 3.2 Capability JWT (ecosystem + BaaS variants)

**Ecosystem (Pillar 2)**

```json
{
  "iss": "lifeos",
  "aud": "elfcom",
  "sub": "<ownerTrustId>",
  "scp": ["thread:read", "thread:write", "message:send", "events:subscribe"],
  "sid": "<sessionId>",
  "zk_bind": "<session_binding_hash>",
  "exp": 1710000000
}
```

**BaaS (Pillar 4)**

```json
{
  "iss": "elfcom-baas",
  "aud": "elfcom",
  "sub": "<tenantSubject>",
  "tenant": "<tenantId>",
  "app": "<appId>",
  "scp": ["baas:chat", "baas:notify"],
  "exp": 1710000000
}
```

### 3.3 Normalized ingress (all channels)

```ts
type ElfComChannel =
  | "dm" | "bus"                 // native / ecosystem
  | "whatsapp" | "instagram" | "x" | "telegram" | "email"; // omnichannel

type NormalizedIngressPacket = {
  packetId: string;
  channel: ElfComChannel;
  providerMessageId: string;
  ownerTrustId: string;          // or tenant-mapped subject
  tenantId?: string;             // Pillar 4
  threadKey: string;
  sentAt: string;
  fromRef: string;               // opaque / sealed ref
  toRef: string;
  contentType: "text" | "media_ref" | "system";
  plaintextBody?: string;        // RAM only during normalize→seal
  mediaRef?: string;
  rawProviderMetaHash: string;   // hash only — not full raw dump
};
```

Pipeline: verify → resolve owner/tenant → normalize → **seal** → durable ciphertext → signed WS/webhook → open only under session / client keys.

### 3.4 Encryption & session bind

```text
Client / TrustID
  └─ identity + session key material (local vault)

ElfCom node
  └─ K_node_master (KMS)
        └─ K_user_wrap / K_tenant_wrap
              └─ per-message AES-256-GCM (AAD: owner, thread, message, channel, ts)
  └─ SessionBinder (RAM): sid → { sessionKey, zk_bind, owner }  // Phase A path
```

Pillar 1 goal: prefer **client-sealed** payloads so the node never sees plaintext. Phase A open-at-edge (gateway bind) remains for LifeOS compatibility until clients seal locally.

---

## 4. API surface by pillar

| Area | Prefix | Auth |
|------|--------|------|
| Health | `GET /health` | none |
| Session bind | `/v1/session/bind` | capability JWT |
| Threads/messages (shared) | `/v1/threads…` | capability JWT |
| Consumer app | `/v1/app/*` | device/session JWT |
| Omnichannel webhooks | `/v1/webhooks/{channel}` | provider signatures |
| Omnichannel link | `/v1/channels/link` | session + ZK proof |
| BaaS | `/v1/baas/*` | API key → tenant JWT |
| Realtime | `WS /v1/events` | capability / device / baas JWT |

LifeOS façade (other repo): `/messaging/*` → `HttpElfComProvider` only.

---

## 5. Updated repository / package structure

```text
ELFCOMS/
  docs/
    ELFCOM_SOVEREIGN_NODE.md      # this spec
  apps/
    elfcom-node/                  # Platform core API (all pillars)
    elfcom-web/                   # Pillar 1 — consumer chat (scaffold next)
    elfcom-console/               # Pillar 3 — omnichannel dashboard (+ BaaS admin)
  packages/
    elfcom-contract/              # ✅ shared types + port mirror
    elfcom-crypto/                # ✅ seal/open, SessionBinder, blind indexes
    elfcom-sdk-js/                # Pillar 4 (+ usable by Pillar 1 web)
    elfcom-sdk-react/             # optional UI hooks for chat surfaces
    elfcom-connectors-core/       # IChannelConnector + registry
    elfcom-connectors-bus/        # Pillar 2 internal bus
    elfcom-connectors-dm/         # native DM
    elfcom-connectors-email/
    elfcom-connectors-whatsapp/
    elfcom-connectors-instagram/
    elfcom-connectors-x/
    elfcom-connectors-telegram/
    elfcom-baas-auth/             # tenant API keys, scopes, quotas
    elfcom-webhook-dispatch/      # signed outbound webhooks (BaaS)
  adapters/
    lifeos-http/                  # ✅ Pillar 2 LifeOS adapter
    trustid-bus/                  # Pillar 2 TrustID notify publisher
    datazone-notify/              # Pillar 2 optional event sink (later)
  deploy/
    Dockerfile
    compose.dev.yaml
  .env.example
```

**Already present (Phase A):** `elfcom-node`, `elfcom-contract`, `elfcom-crypto`, `adapters/lifeos-http`.

---

## 6. Scaffolding & delivery plan (revised)

### Phase A — Core engine ✅ (landed)

- Monorepo + `@elfcom/contract` + `@elfcom/crypto` + `SessionBinder`
- `elfcom-node` JWT (`aud=elfcom`) + threads/messages + session bind
- In-memory sealed store; LifeOS `HttpElfComProvider` + `ELFCOM_MODE=http`
- Smoke: bind → send → listMessages

### Phase B — Pillar 3 omnichannel aggregator ← **active**

See **[PHASE_B_OMNICHANNEL.md](./PHASE_B_OMNICHANNEL.md)**.

1. `@elfcom/connectors-core` + `@elfcom/connectors` (WA, Telegram, email, IG, X).
2. Webhooks `/v1/webhooks/:channel` → normalize → user-key seal → unified threads.
3. `GET /v1/inbox?channel=` + `POST /v1/channels/link` + reply via origin connector.
4. Thin console UI follows once ingress is green.

### Phase C — Pillar 1 consumer app + Pillar 2 hardening

1. Scaffold `apps/elfcom-web` — TrustID login, local key bridge.
2. Client SDK seed; Postgres + WS events.
3. Prefer client-seal path; bus/dm ecosystem notify; mTLS staging.

### Phase D — Pillar 4 BaaS

1. `elfcom-baas-auth` — tenants, apps, API keys, scopes, quotas.
2. `/v1/baas/*` routes + tenant DEK hierarchy.
3. Publish `@elfcom/sdk` (npm); webhook dispatch.
4. Console: developer portal (keys, logs without plaintext, usage).

### Phase E — Production hardening

- KMS for `K_node_master`, SPIFFE/mTLS, Redis session bind, DLQ, abuse limits.
- Optional cold archive exporter → DataZone (non-blocking).
- Zero-metadata audit program for Pillar 1 (graph minimization, sealed receipts).

---

## 7. Security model by pillar

| Concern | P1 Consumer | P2 Ecosystem | P3 Omni | P4 BaaS |
|---------|-------------|--------------|---------|---------|
| Identity | TrustID / local device | TrustID via LifeOS | TrustID + channel OAuth | Tenant API keys + subjects |
| Plaintext at rest | Forbidden | Forbidden | Forbidden | Forbidden |
| Open location | Client RAM preferred | Session bind / client | Session bind / console RAM | Tenant client or ephemeral edge |
| Metadata | Minimize aggressively | Opaque ids in LifeOS | Blind handle indexes | Tenant-isolated indexes |
| Secrets | Device vault | Node + LifeOS JWT secret | Connector tokens in node vault | Per-tenant secrets |

Audit everywhere: `{ actor, op, threadId, channel, tenant? }` — **never body bytes**.

---

## 8. Node-local data model (platform)

| Store | Notes | PII plaintext? |
|-------|--------|----------------|
| `threads` / `messages` | Ciphertext + AAD hashes | No |
| `channel_links` | Blind index + handle ciphertext | No |
| `devices` (P1) | Device pubkey, opaque id | No |
| `tenants` / `apps` (P4) | Billing refs, hashed API keys | No secrets in logs |
| `delivery_outbox` | Sealed payloads | No |
| `audit_log` | Ops only | No |

LifeOS DB: presentation stubs only (`source=elfcom`, deep link) — **no bodies**.

---

## 9. Configuration surface

```bash
# Core node
ELFCOM_PORT=8791
ELFCOM_NODE_MASTER_KEY=                 # 32 bytes
LIFEOS_JWT_SECRET=                      # Pillar 2 shared HMAC (or JWKS)
LIFEOS_JWT_AUD=elfcom
SESSION_BIND_TTL_SECONDS=86400
CONNECTORS_ENABLED=bus,dm               # expand: email,whatsapp,telegram,instagram,x
PILLARS_ENABLED=engine,lifeos           # later: app,console,baas

# Pillar 4 (later)
# BAAS_ENABLED=true
# BAAS_JWT_ISS=elfcom-baas
```

```bash
# LifeOS (Pillar 2 only)
ELFCOM_MODE=http
ELFCOM_BASE_URL=http://localhost:8791
ELFCOM_NODE_SECRET=...                  # = LIFEOS_JWT_SECRET
```

---

## 10. Definition of done (platform V1)

**Engine**

- [x] Sealed store + session bind + JWT `aud=elfcom`
- [x] LifeOS adapter bind path
- [ ] Postgres + WS events
- [ ] Client-seal path documented and implemented in SDK

**Pillar 1**

- [ ] `elfcom-web` send/receive without LifeOS
- [ ] Local key management bridge
- [ ] No plaintext previews when unbound

**Pillar 2**

- [x] `IElfComMessagingProvider` HTTP adapter
- [ ] Bus notifies for TrustID / experience events
- [ ] LifeOS wipe → ElfCom purge

**Pillar 3**

- [ ] Console unified inbox
- [ ] ≥1 external channel (email or WhatsApp) end-to-end sealed
- [ ] Blind channel link

**Pillar 4**

- [ ] Tenant API key auth
- [ ] Published JS SDK hello-chat
- [ ] Signed tenant webhooks

---

## 11. Explicit non-goals (near term)

- Replacing TrustID as IdP
- Plaintext search / ad-graph analytics
- Storing omnichannel plaintext in LifeOS
- Blocking on DataZone for message hot path
- Building every social connector before consumer app + BaaS auth land

---

## 12. Start here (next increments)

1. Keep Phase A engine green (`npm run dev` → `:8791/health`).
2. Scaffold **`apps/elfcom-web`** (Pillar 1) on `@elfcom/sdk-js` + existing `/v1/*`.
3. Extract **`elfcom-connectors-core`** + `bus`/`dm` packages from node internals.
4. Design **`/v1/baas`** tenancy sketch (no need to implement all connectors first).
5. Sequence omnichannel connectors behind the normalize/seal pipeline (Pillar 3).
