# ElfCom — Sovereign Communication Platform

Four pillars: consumer chat · ecosystem backbone · **omnichannel inbox** · BaaS.

| Doc | Purpose |
|-----|---------|
| [docs/ELFCOM_SOVEREIGN_NODE.md](./docs/ELFCOM_SOVEREIGN_NODE.md) | Platform architecture |
| [docs/PHASE_B_OMNICHANNEL.md](./docs/PHASE_B_OMNICHANNEL.md) | **Phase B** Pillar 3 connectors + inbox |

## Layout

```text
apps/elfcom-node                 # Core API + webhooks (:8791)
apps/elfcom-console              # Pillar 3 unified inbox UI (:5191)
packages/elfcom-contract
packages/elfcom-crypto
packages/elfcom-connectors-core  # IChannelConnector + normalize
packages/elfcom-connectors       # WA / Telegram / email / IG / X
adapters/lifeos-http             # Pillar 2 LifeOS bridge
```

## Quick start

```bash
npm install
npm run build
npm test
npm run dev                      # API → http://localhost:8791/health
npm run dev:console              # UI  → http://localhost:5191
```

Console docs: [docs/PHASE_B5_CONSOLE.md](./docs/PHASE_B5_CONSOLE.md)

### Omnichannel smoke

```bash
# 1) Link is optional if ELFCOM_DEV_INGRESS_OWNER is set in .env
# 2) POST a WhatsApp-shaped webhook:
curl -s http://localhost:8791/v1/webhooks/whatsapp -H "Content-Type: application/json" -d "{\"entry\":[{\"changes\":[{\"value\":{\"metadata\":{\"display_phone_number\":\"15550001111\"},\"messages\":[{\"from\":\"15551234567\",\"id\":\"wamid.1\",\"timestamp\":\"1710000000\",\"text\":{\"body\":\"Omni hello\"}}]}}]}]}"
```

### LifeOS (Pillar 2)

```bash
ELFCOM_MODE=http
ELFCOM_BASE_URL=http://localhost:8791
ELFCOM_NODE_SECRET=elfcom-dev-node-secret-change-me
```

## Phase status

- **A** ✅ Engine + LifeOS adapter  
- **B** 🚧 Omnichannel connectors + unified inbox  
- **C** Consumer app + hardening  
- **D** BaaS  
