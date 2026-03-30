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

const MOCK_DEVICES: ConnectedDevice[] = [
  {
    id: 'bridge-macbook',
    device_name: "Ken's MacBook Pro",
    app_name: 'Agent Home',
    platform: 'macos',
    app_version: '1.0.0',
    client_type: 'bridge',
    created_at: Date.now() - 2 * 24 * 60 * 60 * 1000,
    updated_at: Date.now() - 5 * 60 * 1000,
  },
  {
    id: 'bridge-vps',
    device_name: 'buzzbeam-prod-01',
    app_name: 'BuzzBeam Dashboard',
    platform: 'linux',
    app_version: '2.3.1',
    client_type: 'bridge',
    created_at: Date.now() - 30 * 24 * 60 * 60 * 1000,
    updated_at: Date.now() - 10 * 60 * 1000,
  },
];

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
  const { relayUrl, token } = useConnectionStore();
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);

  useEffect(() => {
    // Use mock data in dev, fetch from relay in production
    if (__DEV__) {
      setDevices(MOCK_DEVICES);
    }
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
      <BlurHeader title="Settings" showBack={false} />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Pressable
            style={({ pressed }) => [styles.qrButton, pressed && styles.buttonPressed]}
            onPress={() => router.push('/scan')}
          >
            <Text style={styles.qrButtonText}>+ Link an app</Text>
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
  qrButton: {
    backgroundColor: colors.green,
    borderRadius: 14,
    padding: spacing.lg,
    alignItems: 'center',
  },
  qrButtonText: {
    color: '#000000',
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
});
