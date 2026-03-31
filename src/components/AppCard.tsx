import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useRouter } from 'expo-router';

import { colors, fontSize, spacing } from '@/lib/constants';
import { lightTap } from '@/lib/haptics';
import { playClick } from '@/lib/sounds';
import { useAgentsStore } from '@/stores/agents';
import type { ConnectedApp } from '@/types';

const COLUMNS = 3;
const GAP = spacing.md;
const HORIZONTAL_PADDING = spacing.xl;

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

function getInitials(name: string): string {
  return name
    .split(/[\s-_]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function AppCard({ app }: { app: ConnectedApp }) {
  const router = useRouter();
  const agents = useAgentsStore((s) => s.agents);
  const { width: screenWidth } = useWindowDimensions();

  const tileSize = (screenWidth - HORIZONTAL_PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  const appAgents = Array.from(agents.values()).filter(
    (a) => a.appId === app.id || a.id === app.id,
  );
  const isOnline = appAgents.length > 0 && appAgents.some((a) => a.status === 'online');

  const handlePress = () => {
    lightTap();
    playClick();
    if (appAgents.length === 1) {
      const agent = appAgents[0];
      if (agent.sessions && agent.sessions.length > 0) {
        router.push(`/sessions/${agent.id}`);
      } else {
        router.push(`/chat/${agent.id}`);
      }
    } else {
      router.push(`/app/${app.id}`);
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.container, { width: tileSize }, pressed && styles.pressed]}
      onPress={handlePress}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.initials}>{getInitials(app.name)}</Text>
        <View style={[styles.statusDot, { backgroundColor: isOnline ? '#22c55e' : '#ef4444' }]} />
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {app.name}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {getTimeAgo(app.lastActiveAt)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  initials: {
    color: colors.accent,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  statusDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 2,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
});
