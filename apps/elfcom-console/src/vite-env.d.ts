/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ELFCOM_BASE_URL?: string;
  readonly VITE_ELFCOM_NODE_SECRET?: string;
  readonly VITE_ELFCOM_JWT_ISS?: string;
  readonly VITE_ELFCOM_JWT_AUD?: string;
  readonly VITE_POLL_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
