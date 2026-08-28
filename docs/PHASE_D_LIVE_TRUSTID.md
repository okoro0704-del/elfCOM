# Phase D — Live channel connectors & TrustID security

## Live connectors

When credentials are set, channel `send()` issues real HTTP calls; otherwise stubs remain (Phase C compatible).

| Channel | Env | Endpoint |
|---------|-----|----------|
| WhatsApp | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | `POST https://graph.facebook.com/v18.0/{phone_number_id}/messages` |
| Telegram | `TELEGRAM_BOT_TOKEN` | `POST https://api.telegram.org/bot{token}/sendMessage` |
| Email | `SENDGRID_API_KEY` + `EMAIL_FROM` **or** `SMTP_URL` + `EMAIL_FROM` | SendGrid HTTP / Nodemailer SMTP |

Webhook ingress/challenge parsing is unchanged (`hub.challenge`, Telegram updates, email ESP HMAC).

## TrustID auth

`apps/elfcom-node/src/middleware/trustid-auth.ts` guards:

- `POST /v1/messages/send`, `POST /v1/messages/batch`, `GET /v1/threads/:userId`
- WebSocket `GET /v1/events`

Verification order:

1. LifeOS capability JWT (HS256 / `LIFEOS_JWT_SECRET`) — Phase C path
2. TrustID access token via remote JWKS (`TRUSTID_JWKS_URL`) when configured

## P2P encryption hooks

`SessionBinder` hosts a RAM `P2pKeyExchange` registry:

- `POST /v1/p2p/keys` — register device SPKI public key for the JWT subject
- Optional `p2p` field on `/v1/messages/send` — Ed25519 signature verified **before** `RouterService` dispatch

## E2E

`apps/elfcom-node/tests/e2e/hospitalityos-elfcom.test.ts` (mirrored path `tests/e2e/`) covers:

1. HospitalityOS-style `HttpElfComProvider` HTTP surface → `POST /v1/messages/send`
2. Router → mocked WhatsApp adapter
3. WebSocket `message.created` + `message.delivered`

## Verification

```bash
npm test -w @elfcom/connectors
npm test -w @elfcom/crypto
npm test -w @elfcom/node
```
