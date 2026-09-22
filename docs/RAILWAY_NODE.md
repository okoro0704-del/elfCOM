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
2. Runtime WORKDIR = `apps/elfcom-node` with schema + `dist` present
3. Start: `prisma db push --schema=./prisma/schema.prisma --skip-generate && node dist/index.js`

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

Railway sets `PORT` automatically.
