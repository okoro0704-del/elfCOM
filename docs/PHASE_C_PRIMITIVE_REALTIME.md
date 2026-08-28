# Phase C — RouterService, Primitive API & WebSocket Engine

**Status:** Implemented  
**Depends on:** Phase A/B sealed ingress (SessionBinder, IChannelConnector, envelopes unchanged)

## Delivered

| Piece | Location |
|-------|----------|
| RouterService | `apps/elfcom-node/src/services/router.service.ts` |
| WebSocket hub | `apps/elfcom-node/src/services/websocket.service.ts` + `GET /v1/events` |
| Primitive HTTP | `POST /v1/messages/send`, `POST /v1/messages/batch`, `GET /v1/threads/:userId` |
| Postgres schema | `apps/elfcom-node/prisma/schema.prisma` (optional via `DATABASE_URL`) |
| LifeOS adapter | Uses primitive send + `GET /v1/threads/:userId` |
| Console | `useElfComEvents` WS refresh (polling retained as fallback) |

## Router behavior

1. Prefer `envelope.channel`
2. Fall back: whatsapp → telegram → email → instagram → x → dm → bus
3. Per-channel exponential backoff (`baseBackoffMs * 2^(attempt-1)`)
4. `dm`/`bus` treated as local delivery success after persist

## Persistence

- Hot path remains in-memory for dev/tests.
- When `DATABASE_URL` is set, dual-write threads/messages/links/audit/outbox to Postgres.
- Apply schema: `npm run db:push -w @elfcom/node`

## Tests

- `router.service.test.ts` — fallback + exhaustion
- `websocket.service.test.ts` — userId fanout
- `primitive.test.ts` — send + batch + threads/:userId via Fastify inject
