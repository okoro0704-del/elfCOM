import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { App as CapApp } from "@capacitor/app";
import { initDeepLinks } from "./lib/deepLinks";
import { initPushNotifications } from "./lib/pushBootstrap";

/** Native shell bootstrap — no-ops on web/PWA. */
export async function initNativeShell() {
  if (!Capacitor.isNativePlatform()) return;

  initDeepLinks();

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#071f1e" });
    if (Capacitor.getPlatform() === "android") {
      await StatusBar.setOverlaysWebView({ overlay: false });
    }
  } catch {
    /* web / unsupported */
  }

  try {
    await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
  } catch {
    /* web / unsupported */
  }

  try {
    await SplashScreen.hide();
  } catch {
    /* already hidden */
  }

  CapApp.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      void CapApp.exitApp();
    }
  });

  // Push after shell is up; token register retries once session exists.
  void initPushNotifications();
}
