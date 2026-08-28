# Railway deploy — elfcom-node

## Build failure you hit

Railpack ran `npm run build --workspace=@elfcom/node` → only `tsc` in `apps/elfcom-node`.
Workspace packages (`@elfcom/contract`, `@elfcom/crypto`, …) were never built, so imports failed.

## Fix (in repo)

`@elfcom/node` `build` now builds those packages first, then `tsc`. Tests are excluded from the production compile. `start` no longer requires a local `.env` file (Railway injects env).

## Railway settings

| Setting | Value |
|---------|--------|
| Root directory | `/` (monorepo root) |
| **Build command** | `npm run build --workspace=@elfcom/node` |
| **Start command** | `npm run start --workspace=@elfcom/node` |
| Node | ≥ 20 |

Do **not** build `@elfcom/lifeos-adapter` on Railway — that package is a LifeOS client library, not the API server. `railway.toml` pins the build/start commands to `@elfcom/node`.

## Env vars

```text
LIFEOS_JWT_SECRET=elfcom-dev-node-secret-change-me
ELFCOM_NODE_MASTER_KEY=0123456789abcdef0123456789abcdef
CORS_ORIGINS=https://YOUR-SITE.netlify.app
NODE_ENV=production
HOST=0.0.0.0
DATABASE_URL=${{Postgres.DATABASE_URL}}
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
5. Redeploy the API. Start command runs `prisma db push` then boots the node (creates tables).
6. Check `GET /health` — `"persistence":"postgres"` means it’s connected. `"memory"` means `DATABASE_URL` is still missing on the API.

Netlify does **not** need `DATABASE_URL` — only the API talks to Postgres.
