# Railway deploy — elfcom-node

## T4.1 root cause (2026-09-22)

Railpack + `start:migrate` failed at runtime:

```text
Error: Could not load `--schema` from provided path `prisma/schema.prisma`: file or directory not found
```

`railway.toml` previously used `npm run start:migrate --workspace=@elfcom/node`, which expects
`apps/elfcom-node/prisma/schema.prisma` on disk. The Railpack runtime image did not keep that
schema path, so every new deploy crashed before boot — production kept serving the last SUCCESS
(2026-09-04).

## Fix

Use `Dockerfile.elfcom-node`:

1. Monorepo install + `npm run build --workspace=@elfcom/node` (builds deps + `prisma generate` + tsc)
2. Runtime WORKDIR = `apps/elfcom-node` with schema + migrations + `dist` present
3. Start: `prisma migrate deploy --schema=./prisma/schema.prisma && node dist/index.js`

(E2 uses additive `migrate deploy`, not `db push`, so shared tables such as DeliveryEvent are never dropped.)

## Railway settings

| Setting | Value |
|---------|--------|
| Root directory | `/` (monorepo root) |
| Builder | Dockerfile |
| Dockerfile path | `Dockerfile.elfcom-node` |
| Healthcheck | `/health` |

## Env vars

```text
LIFEOS_JWT_SECRET=...
ELFCOM_NODE_MASTER_KEY=...
CORS_ORIGINS=*
NODE_ENV=production
HOST=0.0.0.0
DATABASE_URL=${{Postgres.DATABASE_URL}}
DIGI_RP_URL=https://digi-rp-production.up.railway.app
DIGI_AUTHORITY_JWKS_URL=https://digi-rp-production.up.railway.app/.well-known/authority-jwks.json
DIGI_AUTHORITY_CONSUME_URL=https://digi-rp-production.up.railway.app
TRUSTID_JWKS_URL=...
TRUSTID_ISSUER=...
TRUSTID_AUDIENCE=elfcom
```

Railway sets `PORT` automatically — `elfcom-node` already reads `PORT`.

### Wire Postgres (Railway)

1. You should have **two** Railway services: **Postgres** + **elfcom-node** (API), same project.
2. Open the **API** service → **Variables**.
3. Add `DATABASE_URL` via **Add variable → Variable reference** (or “Shared variable”):
   - Reference: `Postgres` service → `DATABASE_URL`  
   - Result looks like: `${{Postgres.DATABASE_URL}}`  
   (If your DB service has another name, pick that name instead of `Postgres`.)
4. Do **not** put `DATABASE_URL` only on the Postgres service — the **API** must have it.
5. Redeploy the API. Start command runs `prisma migrate deploy` then boots the node.
6. Check `GET /health` — expect:
   ```json
   {
     "persistence": "postgres",
     "messaging": {
       "status": "READY",
       "sourceOfTruth": "postgres",
       "database": "READY"
     }
   }
   ```
   `"memory"` means `DATABASE_URL` is still missing on the API (or non-production fallback). Production refuses memory fallback.

## Persistence architecture (E2)

- **PostgreSQL** is the durable source of truth for threads and messages.
- **MemoryMessageStore** is for unit tests / local dev without `DATABASE_URL` only.
- **WebSocket** is realtime transport only — never the durability layer.
- Directory, session binder, and WS subscriptions remain process-local (out of E2 scope).

Netlify does **not** need `DATABASE_URL` — only the API talks to Postgres.
