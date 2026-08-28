# Phase B / Wave B5 — ElfCom Console (`apps/elfcom-console`)

**Status:** Scaffolded  
**Pillar:** 3 — Omnichannel dashboard UI  
**Depends on:** `elfcom-node` envelope APIs (`?envelope=1`)

---

## 1. Goals

1. Responsive multi-column **unified inbox** (channel rail · thread list · conversation).
2. **Client-side open** of session-rewrapped envelopes (AES-GCM in Web Crypto) — plaintext only in React state / RAM.
3. **Cross-platform reply** via `POST /v1/threads/:id/messages` (node dispatches to origin connector).

---

## 2. Data flow

```text
Console (browser)
  ├─ derive session key (HMAC Phase A) — RAM only
  ├─ POST /v1/session/bind
  ├─ GET /v1/inbox?envelope=1
  │     ← SealedThreadEnvelope[] (title/preview rewrapped to session key)
  ├─ openUtf8(sessionKey) in Web Crypto
  ├─ GET /v1/threads/:id/messages?envelope=1
  │     ← SealedMessageEnvelope[]
  ├─ openUtf8 → render bubbles
  └─ POST /v1/threads/:id/messages { body }
        → node seals + connector.send (origin channel)
```

Polling interval: `VITE_POLL_MS` (default 4000). WebSocket can replace polling later (`WS /v1/events`).

---

## 3. Layout

| Region | Component | Role |
|--------|-----------|------|
| Gate | `SessionGate` | TrustID + bind |
| Rail | `ChannelFilter` | Filter by channel |
| Mid | `ThreadList` | Opened thread previews |
| Main | `ThreadPane` + `Composer` | Messages + reply |
| Shell | `InboxView` | Wires hooks + columns |

---

## 4. Security notes

- `VITE_ELFCOM_NODE_SECRET` is **dev-only** (capability JWT mint in browser). Production must use TrustID/OAuth code exchange + httpOnly session.
- Message bodies are not written to `localStorage` / `sessionStorage`.
- `End session` zeros the session key buffer.

---

## 5. Run

```bash
# terminal 1 — API (port 8791)
npm run dev

# terminal 2 — console (port 5191)
npm run dev:console
```

Open `http://localhost:5191`, connect as `TD-SMOKE01` (or your `ELFCOM_DEV_INGRESS_OWNER`).
