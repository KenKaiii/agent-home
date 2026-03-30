import { useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { MessageType } from '@agent-home/protocol';
import { Add01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react-native';

import { BlurHeader } from '@/components/BlurHeader';
import { colors, fontSize, spacing } from '@/lib/constants';
import { relayClient } from '@/lib/websocket';
import { useAgentsStore } from '@/stores/agents';
import type { AgentSession } from '@/types';

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

function SessionRow({ session, onPress }: { session: AgentSession; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <Text style={styles.rowTitle} numberOfLines={1}>
        {session.title}
      </Text>
      <Text style={styles.rowTime}>{getTimeAgo(session.updatedAt)}</Text>
    </Pressable>
  );
}

export default function SessionsScreen() {
  const { agentId } = useLocalSearchParams<{ agentId: string }>();
  const router = useRouter();
  const agent = useAgentsStore((s) => s.agents.get(agentId ?? ''));

  // Refresh agent list (including sessions) every time this screen gains focus
  useFocusEffect(
    useCallback(() => {
      if (relayClient.isConnected) {
        relayClient.send({
          id: `focus-${Date.now()}`,
          type: MessageType.AGENT_LIST,
          timestamp: Date.now(),
        });
      }
    }, []),
  );

  const sessions = useMemo(() => {
    if (!agent?.sessions) return [];
    return [...agent.sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [agent?.sessions]);

  return (
    <View style={styles.container}>
      <BlurHeader
        title={agent?.name ?? 'Sessions'}
        rightElement={
          <Pressable onPress={() => router.push(`/chat/${agentId}?newChat=1`)} hitSlop={8}>
            <HugeiconsIcon icon={Add01Icon} size={24} color={colors.accent} />
          </Pressable>
        }
      />
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SessionRow
            session={item}
            onPress={() => router.push(`/chat/${agentId}?sessionId=${item.id}`)}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No sessions yet</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  list: {
    flexGrow: 1,
    paddingTop: 100,
  },
  row: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  rowPressed: {
    backgroundColor: colors.surfaceHover,
  },
  rowTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  rowTime: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 4,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
});
