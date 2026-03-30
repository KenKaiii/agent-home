# QR Code Pairing

## Overview

Replace the manual token-paste flow with QR code pairing. The bridge generates a QR code in the terminal; the phone scans it and is instantly connected.

## Current State

- Relay has `POST /auth/token` (requires `JWT_SECRET` in Authorization header) → returns JWT + clientId
- Bridge reads config from `~/.agent-home/config.json` with `relayUrl` + `token` (bridge-type JWT)
- App settings screen has manual text fields for relay URL and auth token
- App stores credentials in `expo-secure-store` under keys `relay-url` and `relay-token`
- `useInitialize` hook loads them into Zustand store on launch
- App scheme is `agent-home` (defined in app.json)
- No `expo-camera` dependency exists yet

## Design

### Flow

- Bridge starts up, connects to relay, then calls `POST /auth/token` with `clientType: "app"` to generate a fresh app token
- Bridge prints a QR code to the terminal containing JSON: `{"url":"wss://...","token":"eyJ..."}`
- The relay URL in the QR is the HTTP base URL of the relay (the bridge already knows its relay URL, which is the WS path — we derive the HTTP URL from it, or make the config accept the base URL)
- User opens app → taps "Scan QR Code" on the settings screen (or on a first-run setup screen)
- App scans QR → parses JSON → saves `url` and `token` to SecureStore → updates Zustand store → auto-connects
- The manual URL/token fields remain as an advanced fallback

### QR Payload

```json
{
  "url": "wss://relay.example.com/ws",
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

Simple JSON. The `url` is the WebSocket URL (same as what the app currently uses). The token is a full 365-day JWT for clientType "app".

### Bridge Token Generation

The bridge needs the relay's HTTP base URL to call `/auth/token`. Currently, config has `relayUrl` which is the WS endpoint (e.g., `ws://localhost:8080/ws`). We can derive the HTTP URL from this:

- `ws://` → `http://`
- `wss://` → `https://`
- Strip the `/ws` path suffix for the base

But the bridge also needs the `JWT_SECRET` to call `/auth/token`. It already has its own JWT token, but the `/auth/token` endpoint requires the raw secret in the Authorization header. Two options:

**Option A**: Add `jwtSecret` to bridge config — bridge already runs on the user's own machine, so this is fine for a personal tool. The bridge config already has `token` (the bridge's own JWT), we just add the secret too.

**Option B**: New relay endpoint `POST /auth/pair` that accepts a valid bridge JWT as auth (instead of the raw secret) and returns an app token. This is cleaner — bridge doesn't need the raw secret.

→ **Going with Option B** — cleaner, the bridge already has a valid token. New endpoint: `POST /auth/pair` authenticated via bridge JWT in Authorization header (Bearer token). Returns `{ token, clientId }` for a new app client.

### App Side

Need `expo-camera` for QR scanning. The CameraView component has built-in barcode scanning (`onBarcodeScanned`). We'll create a dedicated scanner screen at `src/app/scan.tsx` (modal).

The settings screen gets a "Scan QR Code" button that navigates to the scanner. On successful scan, we parse the JSON, validate it has `url` and `token`, save to SecureStore, update the Zustand store, disconnect/reconnect, and navigate back.

## Key Files

**Relay:**

- `relay/src/index.ts` — add `POST /auth/pair` endpoint
- `relay/src/lib/auth.ts` — helper to verify bearer token from header (not just query param)

**Bridge:**

- `bridge/package.json` — add `qrcode-terminal` dependency
- `bridge/src/index.ts` — after connecting, generate app token via relay and print QR
- `bridge/src/config.ts` — no changes needed (we derive HTTP URL from relayUrl)

**App:**

- Root `package.json` — add `expo-camera` dependency
- `app.json` — add `expo-camera` plugin config
- `src/app/scan.tsx` — new QR scanner screen (modal)
- `src/app/_layout.tsx` — register scan screen in Stack
- `src/app/(tabs)/settings.tsx` — add "Scan QR Code" button

## Steps

1. Add `POST /auth/pair` endpoint to `relay/src/index.ts`: verify the caller's JWT from the `Authorization: Bearer <token>` header using `verifyToken` from `relay/src/lib/token.ts`, check that `clientType` is `bridge`, then generate a new app token with `createToken({ clientId: crypto.randomUUID(), clientType: ClientType.APP }, c.env.JWT_SECRET)` and return `{ token, clientId }`.
2. Add `qrcode-terminal` dependency to bridge: run `npm install qrcode-terminal -w bridge` and `npm install @types/qrcode-terminal -D -w bridge`.
3. Add QR code generation to bridge startup in `bridge/src/index.ts`: after `connection.connect()` succeeds (inside `connection.onConnect`), derive the HTTP base URL from `config.relayUrl` (replace `ws://` with `http://`, `wss://` with `https://`, strip trailing `/ws` path), call `POST <httpUrl>/auth/pair` with the bridge token in the Authorization header, receive the app token, then use `qrcode-terminal` to print a QR code containing `JSON.stringify({ url: config.relayUrl, token: appToken })` to the terminal. Wrap in try/catch and log errors — don't block bridge operation if pairing QR fails.
4. Install `expo-camera` in the root app: run `npx expo install expo-camera`. Add the `expo-camera` plugin to `app.json` plugins array with `{ "cameraPermission": "Allow Agent Home to scan QR codes for pairing", "barcodeScannerEnabled": true }`.
5. Create the QR scanner screen at `src/app/scan.tsx`: a full-screen `CameraView` component from `expo-camera` with `barcodeScannerSettings={{ barcodeTypes: ['qr'] }}` and an `onBarcodeScanned` handler. On scan: parse the JSON data, validate it contains `url` (string) and `token` (string), save both to SecureStore (`relay-url` and `relay-token`), update the connection Zustand store via `useConnectionStore` (`setRelayUrl`, `setToken`), call `relayClient.disconnect()` then `relayClient.connect(url, token)`, show a success alert, and navigate back with `router.back()`. Use a `scanned` state ref to prevent double-scans. Include a camera permission request flow using `useCameraPermissions()` — if not granted, show a message with a "Grant Permission" button. Add a close/back button overlay in the top corner.
6. Register the scan screen in `src/app/_layout.tsx`: add a `<Stack.Screen name="scan" options={{ presentation: 'modal', headerShown: true, headerTitle: 'Scan QR Code' }} />` entry in the Stack navigator.
7. Add a "Scan QR Code" button to `src/app/(tabs)/settings.tsx`: place it in the "Relay Server" section above the manual URL/token inputs. Use `router.push('/scan')` on press. Style it prominently (full-width, accent color, with a 📷 icon). Add a small "or enter manually" label between the button and the existing input fields.
