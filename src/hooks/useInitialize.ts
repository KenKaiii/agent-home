import { useEffect, useState } from 'react';

import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

import { seedMockData } from '@/lib/mock-data';
import { useConnectionStore } from '@/stores/connection';

const STORAGE_KEY_URL = 'relay-url';
const STORAGE_KEY_TOKEN = 'relay-token';

const USE_MOCK_DATA = false;

const DEFAULT_RELAY_URL =
  (Constants.expoConfig?.extra?.relayUrl as string) ??
  'wss://agent-home-relay.buzzbeamaustralia.workers.dev/ws';
const PROVISIONING_SECRET = Constants.expoConfig?.extra?.provisioningSecret as string | undefined;

/** Derive an HTTP URL from a WebSocket relay URL */
function deriveHttpUrl(wsUrl: string): string {
  return wsUrl.replace('wss://', 'https://').replace('ws://', 'http://').replace(/\/ws$/, '');
}

/** Decode a JWT payload without verification (just base64) */
function decodeTokenPayload(token: string): { clientType?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(payload) as { clientType?: string };
  } catch {
    return null;
  }
}

/** Auto-provision an app token from the relay using the provisioning secret */
async function provisionAppToken(relayUrl: string): Promise<{ token: string } | null> {
  if (!PROVISIONING_SECRET) return null;

  try {
    const httpUrl = deriveHttpUrl(relayUrl);
    const response = await fetch(`${httpUrl}/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PROVISIONING_SECRET}`,
      },
      body: JSON.stringify({ clientType: 'app' }),
    });

    if (!response.ok) return null;
    const data = (await response.json()) as { token: string; clientId: string };
    return { token: data.token };
  } catch (err) {
    console.error('[init] Failed to auto-provision token:', err);
    return null;
  }
}

export function useInitialize() {
  const [ready, setReady] = useState(false);
  const { setRelayUrl, setToken } = useConnectionStore();

  useEffect(() => {
    (async () => {
      try {
        if (USE_MOCK_DATA) {
          seedMockData();
        } else {
          const savedUrl = await SecureStore.getItemAsync(STORAGE_KEY_URL);
          const savedToken = await SecureStore.getItemAsync(STORAGE_KEY_TOKEN);

          console.log('[init] savedUrl:', savedUrl ? '(set)' : '(null)');
          console.log('[init] savedToken:', savedToken ? '(set)' : '(null)');
          console.log('[init] DEFAULT_RELAY_URL:', DEFAULT_RELAY_URL);
          console.log('[init] PROVISIONING_SECRET:', PROVISIONING_SECRET ? '(set)' : '(null)');

          const relayUrl = savedUrl ?? DEFAULT_RELAY_URL;
          setRelayUrl(relayUrl);
          console.log('[init] Using relay URL:', relayUrl);

          if (savedToken) {
            // Check the token is an app-type token (not a bridge token from a stale QR scan)
            const payload = decodeTokenPayload(savedToken);
            console.log('[init] Saved token clientType:', payload?.clientType);
            if (payload?.clientType === 'app') {
              setToken(savedToken);
              console.log('[init] Using saved app token');
            } else {
              // Token is wrong type — re-provision a proper app token
              console.log('[init] Saved token is not app type, re-provisioning...');
              const result = await provisionAppToken(relayUrl);
              if (result) {
                await SecureStore.setItemAsync(STORAGE_KEY_TOKEN, result.token);
                setToken(result.token);
                console.log('[init] Re-provisioned app token');
              } else {
                console.error('[init] Failed to re-provision app token');
              }
            }
          } else {
            // No token saved — auto-provision from the relay
            console.log('[init] No saved token, auto-provisioning...');
            const result = await provisionAppToken(relayUrl);
            if (result) {
              await SecureStore.setItemAsync(STORAGE_KEY_URL, relayUrl);
              await SecureStore.setItemAsync(STORAGE_KEY_TOKEN, result.token);
              setToken(result.token);
              console.log('[init] Auto-provisioned app token');
            } else {
              console.error('[init] Failed to auto-provision — no token available');
            }
          }
        }
      } catch (err) {
        console.error('[init] Failed to load credentials from SecureStore:', err);
      } finally {
        setReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run once on mount
  }, []);

  return ready;
}
