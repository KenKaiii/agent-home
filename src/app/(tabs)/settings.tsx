import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ConnectionStatus } from '@/components/ConnectionStatus';
import { colors, fontSize, spacing } from '@/lib/constants';
import { relayClient } from '@/lib/websocket';
import { useConnectionStore } from '@/stores/connection';

const STORAGE_KEY_URL = 'relay-url';
const STORAGE_KEY_TOKEN = 'relay-token';
const STORAGE_KEY_PUSH = 'push-enabled';

export default function SettingsScreen() {
  const { relayUrl, token, status, setRelayUrl, setToken } =
    useConnectionStore();
  const [urlInput, setUrlInput] = useState(relayUrl);
  const [tokenInput, setTokenInput] = useState(token ?? '');
  const [pushEnabled, setPushEnabled] = useState(true);

  // Load persisted settings on mount
  useEffect(() => {
    (async () => {
      const savedUrl = await SecureStore.getItemAsync(STORAGE_KEY_URL);
      const savedToken = await SecureStore.getItemAsync(STORAGE_KEY_TOKEN);
      const savedPush = await SecureStore.getItemAsync(STORAGE_KEY_PUSH);

      if (savedUrl) {
        setUrlInput(savedUrl);
        setRelayUrl(savedUrl);
      }
      if (savedToken) {
        setTokenInput(savedToken);
        setToken(savedToken);
      }
      if (savedPush !== null) {
        setPushEnabled(savedPush !== 'false');
      }
    })();
  }, [setRelayUrl, setToken]);

  const handleSave = async () => {
    setRelayUrl(urlInput);
    setToken(tokenInput || null);

    // Persist to secure store
    await SecureStore.setItemAsync(STORAGE_KEY_URL, urlInput);
    if (tokenInput) {
      await SecureStore.setItemAsync(STORAGE_KEY_TOKEN, tokenInput);
    } else {
      await SecureStore.deleteItemAsync(STORAGE_KEY_TOKEN);
    }

    // Reconnect with new settings
    relayClient.disconnect();
    if (tokenInput) {
      relayClient.connect(urlInput, tokenInput);
    }

    Alert.alert('Saved', 'Settings updated. Reconnecting...');
  };

  const handlePushToggle = async (value: boolean) => {
    setPushEnabled(value);
    await SecureStore.setItemAsync(STORAGE_KEY_PUSH, value.toString());
  };

  const statusColor =
    status === 'connected'
      ? colors.green
      : status === 'connecting'
        ? colors.yellow
        : colors.red;

  return (
    <ScrollView style={styles.container}>
      <ConnectionStatus />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connection</Text>

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.statusText}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Relay Server</Text>

        <Text style={styles.label}>Relay URL</Text>
        <TextInput
          style={styles.input}
          value={urlInput}
          onChangeText={setUrlInput}
          placeholder="ws://localhost:8080/ws"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Auth Token</Text>
        <TextInput
          style={styles.input}
          value={tokenInput}
          onChangeText={setTokenInput}
          placeholder="Paste your token here"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />

        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
          onPress={handleSave}
        >
          <Text style={styles.buttonText}>Save & Reconnect</Text>
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
  label: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    color: colors.text,
    fontSize: fontSize.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: fontSize.md,
    fontWeight: '600',
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
