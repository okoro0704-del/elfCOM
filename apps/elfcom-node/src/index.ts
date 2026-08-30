import Fastify from "fastify";
import cors from "@fastify/cors";
import { createConnectorRegistry } from "@elfcom/connectors";
import { config } from "./config.js";
import { primitiveRoutes, websocketRoutes } from "./routes/primitive.js";
import { v1Routes } from "./routes/v1.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { directoryRoutes } from "./routes/directory.js";
import { messagingService } from "./services/messaging.js";
import { persistenceEnabled } from "./persistence/postgres.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  // Dev: allow any origin. Prod: set CORS_ORIGINS (comma list) or "*" for any.
  origin:
    config.corsOrigins.length === 0
      ? config.isDev
      : config.corsOrigins.includes("*")
        ? true
        : config.corsOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
});

const registry = createConnectorRegistry({
  CONNECTORS_ENABLED: config.connectorsEnabled,
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
  WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_GRAPH_VERSION: process.env.WHATSAPP_GRAPH_VERSION,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  META_APP_SECRET: process.env.META_APP_SECRET,
  META_VERIFY_TOKEN: process.env.META_VERIFY_TOKEN,
  X_CONSUMER_SECRET: process.env.X_CONSUMER_SECRET,
  EMAIL_INBOUND_SECRET: process.env.EMAIL_INBOUND_SECRET,
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  SMTP_URL: process.env.SMTP_URL,
});
messagingService.setConnectorRegistry(registry);

app.get("/health", async () => ({
  ok: true,
  service: "elfcom-node",
  nodeId: "elfcom",
  bound: true,
  phase: "D",
  pillars: ["engine", "omnichannel", "primitive", "realtime", "trustid"],
  connectors: registry.enabledChannels(),
  trustIdJwks: Boolean(config.trustIdJwksUrl),
  persistence: persistenceEnabled() ? "postgres" : "memory",
  websocket: true,
}));

await v1Routes(app);
await primitiveRoutes(app);
await directoryRoutes(app);
await webhookRoutes(app, registry);
await websocketRoutes(app);

await app.listen({ port: config.port, host: config.host });
console.log(`ElfCom node listening on http://${config.host}:${config.port}`);
console.log(`Omnichannel connectors: ${registry.enabledChannels().join(", ")}`);
console.log(`Persistence: ${persistenceEnabled() ? "postgres" : "memory"}`);
