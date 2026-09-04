import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.elfcom.app",
  appName: "ElfCom",
  webDir: "dist",
  server: {
    androidScheme: "https",
    iosScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#071f1e",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#071f1e",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#071f1e",
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    backgroundColor: "#071f1e",
    scheme: "com.elfcom.app",
  },
};

export default config;
