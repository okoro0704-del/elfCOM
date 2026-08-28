# Deploy ElfCom Console on Netlify

## Why you see `session bind failed: 404`

Netlify hosts **only the static console**. Session bind calls `POST /v1/session/bind` on **elfcom-node**.

With `VITE_ELFCOM_BASE_URL` empty, the browser posts to your Netlify domain → **404** (no API there).

Locally this worked because Vite proxies `/v1` → `localhost:8791`.

## Fix

1. **Run elfcom-node somewhere** (Railway, Render, Fly.io, a VPS, or your machine with a tunnel).
   - Health check: `GET https://YOUR-API/health` should return JSON with `"ok": true`.

2. **Allow the Netlify origin on the API** (production):
   ```bash
   CORS_ORIGINS=https://YOUR-SITE.netlify.app
   LIFEOS_JWT_SECRET=elfcom-dev-node-secret-change-me
   NODE_ENV=production
   ```

3. **Set Netlify env vars** (Site → Environment variables) and **redeploy**:
   | Variable | Value |
   |----------|--------|
   | `VITE_ELFCOM_BASE_URL` | `https://YOUR-API` (no trailing slash) |
   | `VITE_ELFCOM_NODE_SECRET` | same as node `LIFEOS_JWT_SECRET` |
   | `VITE_ELFCOM_JWT_ISS` | `lifeos` |
   | `VITE_ELFCOM_JWT_AUD` | `elfcom` |

4. Netlify build settings (or use `apps/elfcom-console/netlify.toml`):
   - Base: `apps/elfcom-console`
   - Build: `npm run build`
   - Publish: `dist`

Vite bakes `VITE_*` in at **build** time — changing env without a new deploy does nothing.

## Note on secrets

Browser-minted capability JWTs (`VITE_ELFCOM_NODE_SECRET`) are **dev-grade**. Production should use TrustID / server-side minting later.
