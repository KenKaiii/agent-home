import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import { ConnectionStatus } from '@/components/ConnectionStatus';
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

  return (
    <ScrollView style={styles.container}>
      <ConnectionStatus />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connection</Text>

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.statusText}>{status.charAt(0).toUpperCase() + status.slice(1)}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Relay Server</Text>

        <Pressable
          style={({ pressed }) => [styles.qrButton, pressed && styles.buttonPressed]}
          onPress={() => router.push('/scan')}
        >
          <Text style={styles.qrButtonText}>📷 Scan QR Code</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Push Notifications</Text>
          <Switch
            value={pushEnabled}
            onValueChange={handlePushToggle}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor={colors.text}
          />
        </View>
        <Text style={styles.hint}>
          Receive notifications when agents respond while the app is in the background.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.aboutText}>Agent Home v1.0.0</Text>
        <Text style={styles.aboutText}>
          Chat with AI agents running on your laptop, from anywhere.
        </Text>
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
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    marginBottom: spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    color: colors.text,
    fontSize: fontSize.md,
  },
  qrButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: spacing.lg,
    alignItems: 'center',
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
  hint: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
  aboutText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginBottom: spacing.xs,
  },
});
