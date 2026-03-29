import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import {
  Cancel01Icon,
  ComputerDesk01Icon,
  QrCodeIcon,
  ServerStack01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react-native';

import { colors, fontSize, spacing } from '@/lib/constants';
import { useConnectionStore } from '@/stores/connection';

const STORAGE_KEY_PUSH = 'push-enabled';

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
  const { status } = useConnectionStore();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);

  useEffect(() => {
    (async () => {
      const savedPush = await SecureStore.getItemAsync(STORAGE_KEY_PUSH);
      if (savedPush !== null) {
        setPushEnabled(savedPush !== 'false');
      }
    })();

    // Use mock data in dev, fetch from relay in production
    if (__DEV__) {
      setDevices(MOCK_DEVICES);
    }
    // TODO: In production, fetch from GET /devices with auth
  }, []);

  const handlePushToggle = async (value: boolean) => {
    setPushEnabled(value);
    await SecureStore.setItemAsync(STORAGE_KEY_PUSH, value.toString());
  };

  const handleDisconnect = (device: ConnectedDevice) => {
    Alert.alert('Disconnect Device', `Remove ${device.device_name ?? 'this device'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () => {
          setDevices((prev) => prev.filter((d) => d.id !== device.id));
          // TODO: In production, call DELETE /devices/:id
        },
      },
    ]);
  };

  const statusColor =
    status === 'connected' ? colors.green : status === 'connecting' ? colors.yellow : colors.red;
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Relay Server</Text>
          <View style={[styles.badge, { backgroundColor: statusColor + '22' }]}>
            <View style={[styles.badgeDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.badgeText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.qrButton, pressed && styles.buttonPressed]}
          onPress={() => router.push('/scan')}
        >
          <View style={styles.qrButtonContent}>
            <HugeiconsIcon icon={QrCodeIcon} size={20} color="#ffffff" />
            <Text style={styles.qrButtonText}>Scan QR Code</Text>
          </View>
        </Pressable>
      </View>

      {devices.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connected Hosts</Text>
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
                style={({ pressed }) => [styles.disconnectButton, pressed && styles.buttonPressed]}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={16} color={colors.red} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Push Notifications</Text>
          <Switch
            value={pushEnabled}
            onValueChange={handlePushToggle}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor={colors.text}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  section: {
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  badgeText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  qrButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: spacing.lg,
    alignItems: 'center',
  },
  qrButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qrButtonText: {
    color: '#ffffff',
    fontSize: fontSize.lg,
    fontWeight: '700',
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    color: colors.text,
    fontSize: fontSize.md,
  },
});
