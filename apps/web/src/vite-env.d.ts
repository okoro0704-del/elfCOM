/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_ELFCOM_BASE_URL?: string;
  readonly VITE_ELFCOM_NODE_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
