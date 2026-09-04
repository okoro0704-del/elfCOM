/**
 * Register FCM / APNs tokens with ElfCom notify engine.
 */
import { Capacitor } from "@capacitor/core";
import { Device } from "@capacitor/device";
import { PushNotifications } from "@capacitor/push-notifications";
import { useAuthStore } from "../store/authStore";

const APP_ID_ANDROID = "elfcom_android";
const APP_ID_IOS = "elfcom_ios";

function elfcomBase(): string {
  return (import.meta.env.VITE_ELFCOM_BASE_URL?.trim() || "").replace(/\/+$/, "");
}

function platformForApi(): "ANDROID" | "IOS" | "WEB" {
  const p = Capacitor.getPlatform();
  if (p === "ios") return "IOS";
  if (p === "android") return "ANDROID";
  return "WEB";
}

function appIdForPlatform(): string {
  const p = Capacitor.getPlatform();
  if (p === "ios") return APP_ID_IOS;
  if (p === "android") return APP_ID_ANDROID;
  return "elfcom_web";
}

async function registerTokenWithElfCom(pushToken: string) {
  const base = elfcomBase();
  const accessToken = useAuthStore.getState().session?.accessToken;
  const trustId = useAuthStore.getState().session?.trustId;
  if (!base || !accessToken || !trustId) return;

  let deviceId = "unknown";
  try {
    const id = await Device.getId();
    deviceId = id.identifier || deviceId;
  } catch {
    deviceId = `web-${trustId.slice(0, 8)}`;
  }

  const res = await fetch(`${base}/v1/devices/register`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      appId: appIdForPlatform(),
      platform: platformForApi(),
      pushToken,
      deviceId,
    }),
  });
  if (!res.ok) {
    console.warn("[elfcom:push] register failed", res.status, await res.text());
  }
}

function navigateFromPushData(data: Record<string, string>) {
  const deepLink = data.deepLink || data.path || "";
  if (deepLink.startsWith("trustid://")) {
    window.open(deepLink, "_blank");
    return;
  }
  if (deepLink.startsWith("/")) {
    window.location.hash = "";
    window.history.pushState({}, "", deepLink);
    window.dispatchEvent(new PopStateEvent("popstate"));
    return;
  }
  if (data.type === "master_device_approval" && data.challengeId) {
    window.history.pushState({}, "", `/chat?approval=${encodeURIComponent(data.challengeId)}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    return;
  }
  if (data.threadId) {
    window.history.pushState({}, "", `/chat?thread=${encodeURIComponent(data.threadId)}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  } else if (data.folder) {
    window.history.pushState({}, "", `/mail?folder=${encodeURIComponent(data.folder)}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}

/** Start push permission + token registration (native only). */
export async function initPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") {
    console.info("[elfcom:push] permission not granted");
    return;
  }

  await PushNotifications.register();

  PushNotifications.addListener("registration", (token) => {
    void registerTokenWithElfCom(token.value);
  });

  PushNotifications.addListener("registrationError", (err) => {
    console.warn("[elfcom:push] registration error", err);
  });

  PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
    const data = (event.notification.data ?? {}) as Record<string, string>;
    navigateFromPushData(data);
  });

  PushNotifications.addListener("pushNotificationReceived", () => {
    /* foreground — UI can toast later */
  });
}

/** Re-register after login (token may already be cached). */
export async function refreshPushRegistration(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await PushNotifications.register();
  } catch (err) {
    console.warn("[elfcom:push] refresh failed", err);
  }
}
