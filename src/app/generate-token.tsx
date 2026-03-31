import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react-native';

import { colors, fontSize, spacing } from '@/lib/constants';
import { lightTap, successHaptic } from '@/lib/haptics';
import { useConnectionStore } from '@/stores/connection';

const STORAGE_KEY_URL = 'relay-url';
const STORAGE_KEY_TOKEN = 'relay-token';

const DEFAULT_RELAY_URL =
  (Constants.expoConfig?.extra?.relayUrl as string) ??
  'wss://agent-home-relay.buzzbeamaustralia.workers.dev/ws';
const PROVISIONING_SECRET = Constants.expoConfig?.extra?.provisioningSecret as string | undefined;

function deriveHttpUrl(wsUrl: string): string {
  return wsUrl.replace('wss://', 'https://').replace('ws://', 'http://').replace(/\/ws$/, '');
}

interface BridgeTokenResponse {
  token: string;
  clientId: string;
  relayUrl: string;
}

export default function GenerateTokenScreen() {
  const { relayUrl, token, setRelayUrl, setToken } = useConnectionStore();
  const [bridgeToken, setBridgeToken] = useState<BridgeTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBridgeToken() {
      let activeToken = token;
      const activeRelayUrl = relayUrl || DEFAULT_RELAY_URL;

      // If no token, try to auto-provision one first
      if (!activeToken && PROVISIONING_SECRET) {
        try {
          const httpUrl = deriveHttpUrl(activeRelayUrl);
          const provisionRes = await fetch(`${httpUrl}/auth/token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${PROVISIONING_SECRET}`,
            },
            body: JSON.stringify({ clientType: 'app' }),
          });

          if (provisionRes.ok) {
            const provisionData = (await provisionRes.json()) as {
              token: string;
              clientId: string;
            };
            activeToken = provisionData.token;
            setRelayUrl(activeRelayUrl);
            setToken(activeToken);
            await SecureStore.setItemAsync(STORAGE_KEY_URL, activeRelayUrl);
            await SecureStore.setItemAsync(STORAGE_KEY_TOKEN, activeToken);
          }
        } catch {
          // Fall through to the no-token error below
        }
      }

      if (!activeToken) {
        setError('No active connection. Please connect to a relay first.');
        setLoading(false);
        return;
      }

      try {
        const httpUrl = deriveHttpUrl(activeRelayUrl);

        const response = await fetch(`${httpUrl}/auth/bridge-token`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${activeToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          // Token might be stale — try re-provisioning
          if (response.status === 401 && PROVISIONING_SECRET) {
            const provisionRes = await fetch(`${httpUrl}/auth/token`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${PROVISIONING_SECRET}`,
              },
              body: JSON.stringify({ clientType: 'app' }),
            });

            if (provisionRes.ok) {
              const provisionData = (await provisionRes.json()) as {
                token: string;
                clientId: string;
              };
              activeToken = provisionData.token;
              setToken(activeToken);
              await SecureStore.setItemAsync(STORAGE_KEY_TOKEN, activeToken);

              // Retry with the fresh token
              const retryRes = await fetch(`${httpUrl}/auth/bridge-token`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${activeToken}`,
                  'Content-Type': 'application/json',
                },
              });

              if (retryRes.ok) {
                const data = (await retryRes.json()) as BridgeTokenResponse;
                setBridgeToken(data);
                setLoading(false);
                return;
              }
            }
          }

          const data = await response.json().catch(() => ({}));
          throw new Error(
            (data as { error?: string }).error ?? `Request failed (${response.status})`,
          );
        }

        const data = (await response.json()) as BridgeTokenResponse;
        setBridgeToken(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate token');
      } finally {
        setLoading(false);
      }
    }

    fetchBridgeToken();
  }, [relayUrl, token, setRelayUrl, setToken]);

  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (value: string, field: string) => {
    successHaptic();
    await Clipboard.setStringAsync(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SDK Token</Text>
        <Pressable
          style={({ pressed }) => [styles.closeButton, pressed && styles.buttonPressed]}
          onPress={() => {
            lightTap();
            router.back();
          }}
          hitSlop={8}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={20} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Generating token...</Text>
          </View>
        )}

        {error && (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {bridgeToken && (
          <>
            <View style={styles.tokenContainer}>
              <Text style={styles.tokenValue} selectable>
                {bridgeToken.token}
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [styles.copyButton, pressed && styles.buttonPressed]}
              onPress={() => handleCopy(bridgeToken.token, 'token')}
            >
              <Text style={styles.copyButtonText}>
                {copiedField === 'token' ? 'Copied!' : 'Copy Token'}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.xl,
  },
  centered: {
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginTop: spacing.lg,
  },
  errorText: {
    color: colors.red,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  tokenContainer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  tokenValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
  },
  copyButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    padding: spacing.lg,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#ffffff',
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.8,
  },
});
