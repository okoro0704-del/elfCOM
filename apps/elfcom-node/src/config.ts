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
};
