import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fontSize, spacing } from '@/lib/constants';
import { relayClient } from '@/lib/websocket';
import { useConnectionStore } from '@/stores/connection';

export function ConnectionStatus() {
  const { status, relayUrl, token } = useConnectionStore();

  if (status === 'connected') return null;

  const label =
    status === 'connecting'
      ? 'Reconnecting...'
      : status === 'error'
        ? 'Connection error — tap to retry'
        : 'Disconnected — tap to reconnect';

  const bgColor = status === 'connecting' ? colors.yellow : colors.red;

  const handleRetry = () => {
    if (token) {
      relayClient.disconnect();
      relayClient.connect(relayUrl, token);
    }
  };

  return (
    <Pressable
      style={[styles.container, { backgroundColor: bgColor }]}
      onPress={handleRetry}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  text: {
    color: colors.bg,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
