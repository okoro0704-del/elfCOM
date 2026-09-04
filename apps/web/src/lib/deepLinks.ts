/**
 * Capacitor deep-link + Browser OAuth return handling.
 */
import { Capacitor } from "@capacitor/core";
import { App as CapApp, type URLOpenListenerEvent } from "@capacitor/app";
import { Browser } from "@capacitor/browser";

function toAppPath(url: string): string | null {
  try {
    const u = new URL(url);
    // com.elfcom.app://auth/callback?code=...
    if (u.protocol.startsWith("com.elfcom.app")) {
      const path = u.host ? `/${u.host}${u.pathname}` : u.pathname;
      const normalized = path.startsWith("/") ? path : `/${path}`;
      return `${normalized}${u.search}${u.hash}`;
    }
    // https://elfcom.netlify.app/auth/callback?... or /chat?...
    if (u.hostname === "elfcom.netlify.app" || u.hostname.endsWith(".elfcom.netlify.app")) {
      return `${u.pathname}${u.search}${u.hash}`;
    }
    // Custom scheme alternate: elfcom://auth/callback
    if (u.protocol === "elfcom:") {
      const path = u.host ? `/${u.host}${u.pathname}` : u.pathname;
      return `${path.startsWith("/") ? path : `/${path}`}${u.search}${u.hash}`;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function navigateInApp(pathWithQuery: string) {
  if (pathWithQuery.startsWith("/auth/callback")) {
    window.location.replace(pathWithQuery);
    return;
  }
  window.history.pushState({}, "", pathWithQuery);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Listen for App Links / custom-scheme returns from TrustID Browser. */
export function initDeepLinks() {
  if (!Capacitor.isNativePlatform()) return;

  void CapApp.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
    const path = toAppPath(event.url);
    if (!path) return;
    void Browser.close().catch(() => undefined);
    navigateInApp(path);
  });
}
