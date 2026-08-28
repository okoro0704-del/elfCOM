# Live setup checklist — Railway Postgres + Netlify Console

Use these **exact** values (same on Railway and Netlify):

```text
LIFEOS_JWT_SECRET=elfcom-dev-node-secret-change-me
ELFCOM_NODE_MASTER_KEY=0123456789abcdef0123456789abcdef
HOST=0.0.0.0
NODE_ENV=production
```

You’ll fill these with **your** URLs:

```text
CORS_ORIGINS=https://YOUR-SITE.netlify.app
VITE_ELFCOM_BASE_URL=https://YOUR-API.up.railway.app
VITE_ELFCOM_NODE_SECRET=elfcom-dev-node-secret-change-me
VITE_ELFCOM_JWT_ISS=lifeos
VITE_ELFCOM_JWT_AUD=elfcom
```

---

## A. Railway — API service Variables

1. Open [railway.app](https://railway.app) → your project.
2. Click the **API / ElfCom node** service (not Postgres).
3. Open **Variables**.
4. Add (or Add Suggested → set value):

| Name | Value |
|------|--------|
| `LIFEOS_JWT_SECRET` | `elfcom-dev-node-secret-change-me` |
| `ELFCOM_NODE_MASTER_KEY` | `0123456789abcdef0123456789abcdef` |
| `HOST` | `0.0.0.0` |
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | your Netlify URL, no trailing slash |

5. Add `DATABASE_URL`:
   - New Variable → name `DATABASE_URL`
   - Value = **Variable Reference** → Postgres service → `DATABASE_URL`
   - Looks like `${{Postgres.DATABASE_URL}}`

6. **Redeploy** the API (Deployments → Redeploy, or push triggers it).

7. Open `https://YOUR-API-URL/health`  
   Success looks like: `"persistence":"postgres"`  
   If `"memory"`, `DATABASE_URL` is missing on the API.

---

## B. Netlify — Console env + rebuild

1. Netlify → your site → **Site configuration** → **Environment variables**.
2. Add:

| Name | Value |
|------|--------|
| `VITE_ELFCOM_BASE_URL` | Railway API URL (no trailing slash), e.g. `https://xxx.up.railway.app` |
| `VITE_ELFCOM_NODE_SECRET` | `elfcom-dev-node-secret-change-me` |
| `VITE_ELFCOM_JWT_ISS` | `lifeos` |
| `VITE_ELFCOM_JWT_AUD` | `elfcom` |

3. **Trigger deploy** (Deploys → Trigger deploy).  
   `VITE_*` only apply after a new build.

4. Open the Netlify site → TrustID `TD-SMOKE01` → Open inbox.  
   Session bind should succeed (not 404).

---

## C. Quick checks

| Check | Expected |
|-------|----------|
| `GET /health` on API | `ok: true`, `persistence: "postgres"` |
| Netlify Open inbox | No “session bind failed: 404” |
| Railway Postgres | Connected via `DATABASE_URL` on **API**, not needed on Netlify |
