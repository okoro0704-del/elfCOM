function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.ELFCOM_PORT ?? process.env.PORT ?? 8791),
  host: process.env.HOST ?? "0.0.0.0",
  nodeEnv: process.env.NODE_ENV ?? "development",
  isDev: (process.env.NODE_ENV ?? "development") !== "production",
  nodeMasterKey: required(
    "ELFCOM_NODE_MASTER_KEY",
    "0123456789abcdef0123456789abcdef",
  ),
  jwtSecret: required("LIFEOS_JWT_SECRET", "elfcom-dev-node-secret-change-me"),
  jwtIss: process.env.LIFEOS_JWT_ISS ?? "lifeos",
  jwtAud: process.env.LIFEOS_JWT_AUD ?? "elfcom",
  sessionBindTtlSeconds: Number(process.env.SESSION_BIND_TTL_SECONDS ?? 86400),
  devAutoBind: (process.env.ELFCOM_DEV_AUTO_BIND ?? "true").toLowerCase() !== "false",
  /** Dev fallback when channel handle is not linked. */
  devIngressOwner: process.env.ELFCOM_DEV_INGRESS_OWNER ?? "",
  connectorsEnabled: process.env.CONNECTORS_ENABLED ?? "whatsapp,telegram,email,instagram,x",
  /** Comma-separated RouterService fallback order after preferred channel. */
  routerFallback: (process.env.ELFCOM_ROUTER_FALLBACK ?? "whatsapp,telegram,email,instagram,x,dm")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /** Phase D — TrustID JWKS (optional; capability JWT remains primary). */
  trustIdJwksUrl: process.env.TRUSTID_JWKS_URL ?? "",
  trustIdIssuer: process.env.TRUSTID_ISSUER ?? "",
  trustIdAudience: process.env.TRUSTID_AUDIENCE ?? "elfcom",
  /** Comma-separated browser origins allowed to call the API (Netlify console, etc.). */
  corsOrigins: (process.env.CORS_ORIGINS ?? process.env.ELFCOM_CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  /** Push notification engine */
  pushDryRun:
    (process.env.ELFCOM_PUSH_DRY_RUN ??
      ((process.env.NODE_ENV ?? "development") !== "production" ? "true" : "false"))
      .toLowerCase() !== "false",
  /** appId:secret or tenantId/appId:secret, comma-separated */
  baasApiKeys: (process.env.ELFCOM_BAAS_API_KEYS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "",
  apnsKeyId: process.env.APNS_KEY_ID ?? "",
  apnsTeamId: process.env.APNS_TEAM_ID ?? "",
  apnsBundleId: process.env.APNS_BUNDLE_ID ?? "",
  apnsPrivateKey: process.env.APNS_PRIVATE_KEY ?? "",
  apnsProduction: (process.env.APNS_PRODUCTION ?? "false").toLowerCase() === "true",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:ops@elfcom.me",
};
