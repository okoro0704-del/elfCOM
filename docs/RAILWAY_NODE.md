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
```

Railway sets `PORT` automatically — `elfcom-node` already reads `PORT`.

After deploy, open `https://YOUR-RAILWAY-URL/health`.

Then set Netlify `VITE_ELFCOM_BASE_URL` to that URL and redeploy the console.
