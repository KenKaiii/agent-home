import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import { QrCodeIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react-native';

import { colors, fontSize, spacing } from '@/lib/constants';
import { useConnectionStore } from '@/stores/connection';

const STORAGE_KEY_PUSH = 'push-enabled';

export default function SettingsScreen() {
  const { status } = useConnectionStore();
  const [pushEnabled, setPushEnabled] = useState(true);

  // Load persisted settings on mount
  useEffect(() => {
    (async () => {
      const savedPush = await SecureStore.getItemAsync(STORAGE_KEY_PUSH);
      if (savedPush !== null) {
        setPushEnabled(savedPush !== 'false');
      }
    })();
  }, []);

  const handlePushToggle = async (value: boolean) => {
    setPushEnabled(value);
    await SecureStore.setItemAsync(STORAGE_KEY_PUSH, value.toString());
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
