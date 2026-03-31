import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { router } from 'expo-router';

import { Cancel01Icon, ComputerDesk01Icon, ServerStack01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react-native';

import { BlurHeader } from '@/components/BlurHeader';
import { colors, fontSize, spacing } from '@/lib/constants';
import { useConnectionStore } from '@/stores/connection';

interface ConnectedDevice {
  id: string;
  device_name: string | null;
  app_name: string | null;
  platform: string | null;
  app_version: string | null;
  client_type: string;
  created_at: number;
  updated_at: number | null;
}

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function DeviceIcon({ platform }: { platform: string | null }) {
  const icon = platform === 'linux' ? ServerStack01Icon : ComputerDesk01Icon;
  return <HugeiconsIcon icon={icon} size={20} color={colors.text} />;
}

export default function SettingsScreen() {
  const { relayUrl, token, status, lastError } = useConnectionStore();
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);

  useEffect(() => {
    // TODO: In production, fetch from GET /devices with auth
  }, []);

  const handleDisconnect = (device: ConnectedDevice) => {
    Alert.alert('Disconnect Device', `Remove ${device.device_name ?? 'this device'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          if (!__DEV__ && token) {
            try {
              const httpUrl = relayUrl
                .replace('wss://', 'https://')
                .replace('ws://', 'http://')
                .replace(/\/ws$/, '');
              const response = await fetch(`${httpUrl}/devices/${device.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!response.ok) {
                console.error('[settings] Failed to delete device:', response.status);
              }
            } catch (error) {
              console.error('[settings] Failed to disconnect device:', error);
            }
          }
          setDevices((prev) => prev.filter((d) => d.id !== device.id));
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <BlurHeader title="Settings" />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connection</Text>
          <View style={styles.debugRow}>
            <Text style={styles.debugLabel}>Status</Text>
            <Text
              style={[
                styles.debugValue,
                {
                  color:
                    status === 'connected'
                      ? colors.green
                      : status === 'connecting'
                        ? colors.yellow
                        : colors.red,
                },
              ]}
            >
              {status}
            </Text>
          </View>
          <View style={styles.debugRow}>
            <Text style={styles.debugLabel}>Relay</Text>
            <Text style={styles.debugValue} numberOfLines={1}>
              {relayUrl || '(not set)'}
            </Text>
          </View>
          <View style={styles.debugRow}>
            <Text style={styles.debugLabel}>Token</Text>
            <Text style={styles.debugValue}>{token ? `...${token.slice(-12)}` : '(none)'}</Text>
          </View>
          {lastError && (
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Error</Text>
              <Text style={[styles.debugValue, { color: colors.red }]}>{lastError}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Pressable
            style={({ pressed }) => [styles.generateButton, pressed && styles.buttonPressed]}
            onPress={() => router.push('/generate-token')}
          >
            <Text style={styles.generateButtonText}>Generate SDK Token</Text>
          </Pressable>
        </View>

        {devices.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Linked Apps</Text>
            {devices.map((device) => (
              <View key={device.id} style={styles.deviceRow}>
                <View style={styles.deviceIconContainer}>
                  <DeviceIcon platform={device.platform} />
                </View>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName} numberOfLines={1}>
                    {device.device_name ?? device.id}
                  </Text>
                  <Text style={styles.deviceAppName} numberOfLines={1}>
                    {device.app_name ?? 'Unknown App'}
                  </Text>
                  <Text style={styles.deviceMeta}>
                    {device.platform ?? 'Unknown'} · v{device.app_version ?? '?'} · Last seen{' '}
                    {getTimeAgo(device.updated_at ?? device.created_at)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleDisconnect(device)}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.disconnectButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={16} color={colors.red} />
                </Pressable>
              </View>
            ))}
          </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 100,
  },
  section: {
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
  generateButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    padding: spacing.lg,
    alignItems: 'center',
  },
  generateButtonText: {
    color: '#ffffff',
    fontSize: fontSize.lg,
    fontWeight: '400',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  deviceIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  deviceAppName: {
    color: colors.accent,
    fontSize: fontSize.sm,
    marginTop: 1,
  },
  deviceMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  disconnectButton: {
    padding: spacing.sm,
  },
  debugRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  debugLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  debugValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: spacing.md,
  },
});
