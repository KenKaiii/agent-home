# Project State - Agent Home

## Deployment
- Relay deployed at: `https://agent-home-relay.buzzbeamaustralia.workers.dev`
- JWT Secret: `FNYDtp9sK/dpRlII9lQYDzDuggXUqa2Pq0p8zQbjpOg=` (saved in `relay/.dev.vars`, gitignored)
- D1 database ID: `2d54a759-60ec-451a-b016-f1c75d0e35c1`

## Tokens
- App token: `eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRJZCI6IjViZGZmNWIzLTc2Y2MtNDNjOS1iOWI2LTYyMDhmYjVkMjE3ZSIsImNsaWVudFR5cGUiOiJhcHAiLCJleHAiOjE4MDYzMjMwMjksImlhdCI6MTc3NDc4NzAyOX0._aBYs9jbP6GBj-st4H2900Kn0csGjG2mtFuGHb2Tsdo`
- Bridge token: `eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRJZCI6IjgzMTNjYmZkLTNjNTItNDUzNi04ZTcwLTU3YzBhN2FmYjA2NiIsImNsaWVudFR5cGUiOiJicmlkZ2UiLCJleHAiOjE4MDYzMjMwMjksImlhdCI6MTc3NDc4NzAyOX0.5PNuaf1qacrnHdq4T84ByyHUmCKLAQojvMFZS5Oec7w`

## Bridge Config
- Located at `~/.agent-home/config.json`
- relayUrl: `wss://agent-home-relay.buzzbeamaustralia.workers.dev/ws`
- Bridge tested and connects successfully

## iOS Build
- Target device: UDID `00008140-000E30243488801C` (Indiana's iPhone)
- Build command: `npx expo run:ios --device 00008140-000E30243488801C`
- Prebuild done with: `npx expo prebuild --platform ios --clean`
- iOS dir exists at `./ios`

## Changes Made
- Relay migrated from Node.js to Cloudflare Workers + Durable Objects + D1
- Replaced `execa` with `child_process.spawn` in `bridge/src/agents/stdio.ts`
- Removed `execa` from `bridge/package.json`
- Added `overrides` for `unicorn-magic@0.4.0` in root `package.json`
- Added `react-dom` to root dependencies (needed by `@expo/log-box` in SDK 55)
- `.dev.vars` added to `.gitignore`

## App Settings (enter in Settings tab)
- URL: `wss://agent-home-relay.buzzbeamaustralia.workers.dev/ws`
- Token: (use the app token above)
