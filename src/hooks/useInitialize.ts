import { useEffect, useState } from 'react';

import * as SecureStore from 'expo-secure-store';

import { seedMockData } from '@/lib/mock-data';
import { useConnectionStore } from '@/stores/connection';

const STORAGE_KEY_URL = 'relay-url';
const STORAGE_KEY_TOKEN = 'relay-token';

const USE_MOCK_DATA = __DEV__;

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

          if (savedUrl) setRelayUrl(savedUrl);
          if (savedToken) setToken(savedToken);
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
