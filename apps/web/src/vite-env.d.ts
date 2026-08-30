/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

interface ImportMetaEnv {
  readonly VITE_ELFCOM_BASE_URL?: string;
  readonly VITE_ELFCOM_NODE_SECRET?: string;
  readonly VITE_ELFCOM_JWT_ISS?: string;
  readonly VITE_ELFCOM_JWT_AUD?: string;
  readonly VITE_TRUSTID_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent;
}
