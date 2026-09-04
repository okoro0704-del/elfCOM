/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_ELFCOM_BASE_URL?: string;
  /** @deprecated Never ship in client bundles — server only. */
  readonly VITE_ELFCOM_NODE_SECRET?: string;
  readonly VITE_ELFCOM_JWT_ISS?: string;
  readonly VITE_ELFCOM_JWT_AUD?: string;
  readonly VITE_TRUSTID_BASE_URL?: string;
  readonly VITE_TRUSTID_WEB_ORIGIN?: string;
  readonly VITE_TRUSTID_NATIVE_REDIRECT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
