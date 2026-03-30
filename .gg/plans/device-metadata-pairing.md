# Device Metadata in QR Pairing

## Problem

When an app pairs via QR code, no identifying information is stored — just a bare `clientId`. There's no way to tell which device/app connected (e.g. "Ken's iPhone" vs "iPad Mini").

## Current State

- `devices` table: `id`, `push_token`, `client_type`, `created_at` — no name/platform/model columns
- `POST /auth/pair` returns `{ token, clientId }` — no metadata accepted or stored
- `POST /devices/register` only sends `clientId` + `pushToken` — no device info
- The app already has `expo-device` installed (used in `useNotifications.ts` for `Device.modelName`)

## Design

After scanning the QR code, the app will register its device metadata with the relay via an enhanced `POST /devices/register` call. The relay stores this in the `devices` table with new columns: `device_name`, `platform`, `app_version`. The relay also gets a new `GET /devices` endpoint so you can see what's connected.

QR payload stays unchanged (`{ url, token }`). Device metadata is sent separately after connecting, which is cleaner and allows updates (e.g. name change, push token refresh).

## Steps

1. Add D1 migration `relay/migrations/0002_device_metadata.sql` adding columns `device_name TEXT`, `platform TEXT`, `app_version TEXT`, and `updated_at INTEGER` to the `devices` table via `ALTER TABLE` statements
2. Update `relay/src/db/index.ts`: modify `upsertDevice` to accept and store `deviceName`, `platform`, `appVersion` params; add `listDevices` function returning all devices with metadata
3. Update `relay/src/index.ts`: extend `POST /devices/register` to accept optional `deviceName`, `platform`, `appVersion` fields; add `GET /devices` endpoint that returns all registered devices with metadata
4. Update `src/app/scan.tsx`: after successful QR scan and connect, call `POST /devices/register` with device metadata from `expo-device` (Device.deviceName, Platform.OS, app version from Constants)
5. Update `src/hooks/useNotifications.ts`: enhance the existing `registerForPushNotifications` to also send `deviceName`, `platform`, `appVersion` when registering the push token
