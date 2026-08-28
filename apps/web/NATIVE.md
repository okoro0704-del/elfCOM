# Native apps (Capacitor) + PWA

`apps/web` ships three surfaces from one React codebase:

| Surface | How |
|---------|-----|
| **PWA** | Vite + `vite-plugin-pwa` (browser “Add to Home Screen”) |
| **Android** | Capacitor → `android/` (Android Studio / Play Store) |
| **iOS** | Capacitor → `ios/` (Xcode on macOS / App Store) |

App ID: `com.elfcom.app`

## Prerequisites

- **Android:** Android Studio (SDK 35+), JDK 21 recommended  
- **iOS:** macOS + Xcode 16+ (cannot compile iOS on Windows)  
- CocoaPods (iOS): `sudo gem install cocoapods`

## Commands

```bash
# Install + build web bundle + sync into native projects
npm install
npm run cap:sync -w @elfcom/web

# Open native IDEs
npm run android -w @elfcom/web   # Android Studio
npm run ios -w @elfcom/web       # Xcode (macOS only)
```

After UI changes:

```bash
npm run cap:sync -w @elfcom/web
```

Then run the app from Android Studio / Xcode (Run ▶).

## First-time platform folders

If `android/` or `ios/` are missing:

```bash
cd apps/web
npx cap add android
npx cap add ios    # prefer on a Mac
npm run cap:sync
```

## API URL on device

Emulator/device cannot use `localhost` for your Railway API. Set at build time:

```bash
# apps/web/.env.production (example)
VITE_ELFCOM_BASE_URL=https://elfcomnode-production.up.railway.app
VITE_ELFCOM_NODE_SECRET=elfcom-dev-node-secret-change-me
```

Then `npm run cap:sync -w @elfcom/web`.

## Store releases

- **Play Store:** Android Studio → Build → Generate Signed App Bundle  
- **App Store:** Xcode → Product → Archive → Distribute App  

Bump version in `android/app/build.gradle` and `ios/App/App.xcodeproj` as needed.
