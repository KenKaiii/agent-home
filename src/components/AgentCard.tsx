import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, spacing } from '@/lib/constants';
import type { Agent } from '@/types';

const statusColor = {
  online: colors.green,
  offline: colors.red,
  busy: colors.yellow,
};

export function AgentCard({ agent }: { agent: Agent }) {
  const router = useRouter();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
      ]}
      onPress={() => router.push(`/chat/${agent.id}`)}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{agent.icon ?? '🤖'}</Text>
      </View>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {agent.name}
          </Text>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: statusColor[agent.status] },
            ]}
          />
        </View>
        {agent.description ? (
          <Text style={styles.description} numberOfLines={1}>
            {agent.description}
          </Text>
        ) : null}
        {agent.lastMessage ? (
          <Text style={styles.lastMessage} numberOfLines={1}>
            {agent.lastMessage}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  pressed: {
    backgroundColor: colors.surfaceHover,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  icon: {
    fontSize: 24,
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  description: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  lastMessage: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginTop: 4,
  },
});
