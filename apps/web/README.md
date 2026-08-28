# ElfCom Web — PWA + native (Capacitor)

One React codebase → **PWA**, **Android**, and **iOS**.

| Surface | Path / command |
|---------|----------------|
| Browser / PWA | `npm run dev:web` → http://localhost:5180 |
| Android app | `npm run mobile:android` (needs Android Studio) |
| iOS app | `npm run mobile:ios` (needs macOS + Xcode) |

Native details: [NATIVE.md](./NATIVE.md)

## Tabs

| Route | Module |
|-------|--------|
| `/chat` | ElfChat |
| `/mail` | ElfMail |
| `/omnichat` | OmniChat |
| `/omnimail` | OmniMail |

## Quick start

```bash
npm install
npm run dev:web

# Native sync (build web → copy into android/ + ios/)
npm run mobile:sync
```
