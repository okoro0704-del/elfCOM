# Native apps (Capacitor) + PWA

`apps/web` ships three surfaces from one React codebase:

| Surface | How |
|---------|-----|
| **PWA** | Vite + `vite-plugin-pwa` (browser “Add to Home Screen”) |
| **Android** | Capacitor → `android/` (Android Studio / Play Store) |
| **iOS** | Capacitor → `ios/` (Xcode on macOS / App Store) |

App ID: `com.elfcom.app` · OAuth return: `com.elfcom.app://auth/callback`

## Prerequisites

- **Android:** Android Studio (SDK 35+), JDK 21 recommended  
- **iOS:** macOS + Xcode 16+  
- Firebase `google-services.json` for FCM (copy from `android/app/google-services.json.example`)
- TrustID OAuth client must allow redirect URI `com.elfcom.app://auth/callback`

## Commands

```bash
npm install
# Ensure production API URLs (no VITE_ELFCOM_NODE_SECRET)
cp apps/web/.env.production.example apps/web/.env.production

npm run cap:sync -w @elfcom/web
npm run android -w @elfcom/web   # Android Studio → Run or Generate Signed APK
```

## Release signing (Android)

```bash
cd apps/web/android
keytool -genkey -v -keystore elfcom-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias elfcom
cp keystore.properties.example keystore.properties
# edit passwords, then:
./gradlew :app:assembleRelease
# APK: app/build/outputs/apk/release/app-release.apk
```

## Push notifications

1. Create Firebase Android app `com.elfcom.app`
2. Drop `google-services.json` into `apps/web/android/app/`
3. Set Railway `FIREBASE_SERVICE_ACCOUNT_JSON` + `ELFCOM_PUSH_DRY_RUN=false`
4. After login the app calls `POST /v1/devices/register` with `appId=elfcom_android`

## App Links

`public/.well-known/assetlinks.json` must list your release keystore SHA-256 fingerprint, then redeploy Netlify.

## Permissions

Android/iOS request camera, mic, and notifications for calls and push.
