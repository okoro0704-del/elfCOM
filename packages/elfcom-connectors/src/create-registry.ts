import { ConnectorRegistry, type IChannelConnector } from "@elfcom/connectors-core";
import { EmailConnector } from "./email.js";
import { InstagramConnector } from "./instagram.js";
import { TelegramConnector } from "./telegram.js";
import { WhatsAppConnector } from "./whatsapp.js";
import { XConnector } from "./x.js";

export type CreateConnectorsEnv = {
  CONNECTORS_ENABLED?: string;
  WHATSAPP_VERIFY_TOKEN?: string;
  WHATSAPP_APP_SECRET?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_GRAPH_VERSION?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_BOT_TOKEN?: string;
  META_APP_SECRET?: string;
  META_VERIFY_TOKEN?: string;
  X_CONSUMER_SECRET?: string;
  EMAIL_INBOUND_SECRET?: string;
  SENDGRID_API_KEY?: string;
  EMAIL_FROM?: string;
  SMTP_URL?: string;
};

export function createConnectorRegistry(env: CreateConnectorsEnv = process.env): ConnectorRegistry {
  const enabled = new Set(
    (env.CONNECTORS_ENABLED ?? "whatsapp,telegram,email,instagram,x")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

  const connectors: IChannelConnector[] = [];

  if (enabled.has("whatsapp")) {
    connectors.push(
      new WhatsAppConnector({
        verifyToken: env.WHATSAPP_VERIFY_TOKEN ?? "elfcom-dev-verify",
        appSecret: env.WHATSAPP_APP_SECRET,
        accessToken: env.WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
        graphVersion: env.WHATSAPP_GRAPH_VERSION,
      }),
    );
  }
  if (enabled.has("telegram")) {
    connectors.push(
      new TelegramConnector({
        webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
        botToken: env.TELEGRAM_BOT_TOKEN,
      }),
    );
  }
  if (enabled.has("email")) {
    connectors.push(
      new EmailConnector({
        inboundSecret: env.EMAIL_INBOUND_SECRET,
        sendgridApiKey: env.SENDGRID_API_KEY,
        fromAddress: env.EMAIL_FROM,
        smtpUrl: env.SMTP_URL,
      }),
    );
  }
  if (enabled.has("instagram")) {
    connectors.push(
      new InstagramConnector({
        verifyToken: env.META_VERIFY_TOKEN ?? env.WHATSAPP_VERIFY_TOKEN ?? "elfcom-dev-verify",
        appSecret: env.META_APP_SECRET ?? env.WHATSAPP_APP_SECRET,
      }),
    );
  }
  if (enabled.has("x")) {
    connectors.push(new XConnector({ consumerSecret: env.X_CONSUMER_SECRET }));
  }

  return new ConnectorRegistry({ connectors });
}
