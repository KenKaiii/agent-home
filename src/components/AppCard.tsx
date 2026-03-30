import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useRouter } from 'expo-router';

import { colors, fontSize, spacing } from '@/lib/constants';
import type { ConnectedApp } from '@/types';

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

export function AppCard({ app }: { app: ConnectedApp }) {
  const router = useRouter();

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={() => router.push(`/app/${app.id}`)}
    >
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {app.name}
          </Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{app.agentCount}</Text>
          </View>
        </View>
        <Text style={styles.deviceName} numberOfLines={1}>
          {app.hostName}
        </Text>
        <Text style={styles.meta}>
          {app.platform} · v{app.appVersion} · Active {getTimeAgo(app.lastActiveAt)}
        </Text>
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
  countBadge: {
    backgroundColor: colors.accent + '22',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  deviceName: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
});
