import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useRouter } from 'expo-router';

import { and, asc, eq } from 'drizzle-orm';

import { db, schema } from '@/db';
import { colors, fontSize, spacing } from '@/lib/constants';
import { lightTap } from '@/lib/haptics';
import { playClick } from '@/lib/sounds';
import type { Agent } from '@/types';

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export function AgentCard({ agent }: { agent: Agent }) {
  const router = useRouter();

  const firstUserMessage = useMemo(() => {
    return db
      .select({ content: schema.messages.content, createdAt: schema.messages.createdAt })
      .from(schema.messages)
      .where(and(eq(schema.messages.agentId, agent.id), eq(schema.messages.role, 'user')))
      .orderBy(asc(schema.messages.createdAt))
      .limit(1)
      .get();
  }, [agent.id]);

  const title = firstUserMessage?.content ?? agent.name;
  const timestamp = firstUserMessage?.createdAt ?? agent.lastMessageAt;

  const hasSessions = agent.sessions && agent.sessions.length > 0;

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={() => {
        lightTap();
        playClick();
        if (hasSessions) router.push(`/sessions/${agent.id}`);
        else router.push(`/chat/${agent.id}`);
      }}
    >
      <View style={styles.titleRow}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: agent.status === 'online' ? '#22c55e' : '#ef4444' },
          ]}
        />
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {timestamp ? <Text style={styles.timeAgo}>{getTimeAgo(timestamp)}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  pressed: {
    backgroundColor: colors.surfaceHover,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    flexShrink: 1,
  },
  timeAgo: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 4,
  },
});
