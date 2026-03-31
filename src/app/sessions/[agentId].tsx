import { useCallback, useMemo, useRef } from 'react';
import { Animated, FlatList, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { MessageType } from '@agent-home/protocol';
import { BubbleChatAddIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { eq } from 'drizzle-orm';

import { BlurHeader } from '@/components/BlurHeader';
import { db, schema } from '@/db';
import { colors, fontSize, spacing } from '@/lib/constants';
import { relayClient } from '@/lib/websocket';
import { useAgentsStore } from '@/stores/agents';
import type { AgentSession } from '@/types';

const DELETE_BUTTON_WIDTH = 80;
const SWIPE_THRESHOLD = 40;

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

function SessionRow({
  session,
  onPress,
  onDelete,
}: {
  session: AgentSession;
  onPress: () => void;
  onDelete: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return (
          Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
        );
      },
      onPanResponderMove: (_, gestureState) => {
        if (isOpen.current) {
          // Already open — allow dragging from open position
          const newVal = -DELETE_BUTTON_WIDTH + gestureState.dx;
          translateX.setValue(Math.min(0, Math.max(-DELETE_BUTTON_WIDTH, newVal)));
        } else {
          // Only allow left swipe (negative dx)
          translateX.setValue(Math.min(0, Math.max(-DELETE_BUTTON_WIDTH, gestureState.dx)));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isOpen.current) {
          // If swiped right enough, close
          if (gestureState.dx > SWIPE_THRESHOLD) {
            isOpen.current = false;
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 0,
            }).start();
          } else {
            // Snap back open
            Animated.spring(translateX, {
              toValue: -DELETE_BUTTON_WIDTH,
              useNativeDriver: true,
              bounciness: 0,
            }).start();
          }
        } else {
          // If swiped left enough, open
          if (gestureState.dx < -SWIPE_THRESHOLD) {
            isOpen.current = true;
            Animated.spring(translateX, {
              toValue: -DELETE_BUTTON_WIDTH,
              useNativeDriver: true,
              bounciness: 0,
            }).start();
          } else {
            // Snap back closed
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 0,
            }).start();
          }
        }
      },
    }),
  ).current;

  return (
    <View style={styles.swipeContainer}>
      <Pressable
        style={styles.deleteButton}
        onPress={() => {
          Animated.timing(translateX, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            isOpen.current = false;
            onDelete();
          });
        }}
      >
        <Text style={styles.deleteText}>Delete</Text>
      </Pressable>
      <Animated.View
        style={[styles.rowAnimated, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={onPress}
        >
          <Text style={styles.rowTitle} numberOfLines={1}>
            {session.title}
          </Text>
          <Text style={styles.rowTime}>{getTimeAgo(session.updatedAt)}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function SessionsScreen() {
  const { agentId } = useLocalSearchParams<{ agentId: string }>();
  const router = useRouter();
  const agent = useAgentsStore((s) => s.agents.get(agentId ?? ''));
  const removeSession = useAgentsStore((s) => s.removeSession);

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

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      if (!agentId) return;

      // Remove from Zustand store (instant UI feedback)
      removeSession(agentId, sessionId);

      // Send SESSION_DELETE to relay for server-side cleanup
      if (relayClient.isConnected) {
        relayClient.send({
          id: `del-${Date.now()}`,
          type: MessageType.SESSION_DELETE,
          timestamp: Date.now(),
          agentId,
          sessionId,
        });
      }

      // Remove from local DB (messages + session record)
      try {
        db.delete(schema.messages).where(eq(schema.messages.sessionId, sessionId)).run();
        db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId)).run();
      } catch {
        // DB cleanup is best-effort
      }
    },
    [agentId, removeSession],
  );

  return (
    <View style={styles.container}>
      <BlurHeader
        title={agent?.name ?? 'Sessions'}
        rightElement={
          <Pressable onPress={() => router.push(`/chat/${agentId}?newChat=1`)} hitSlop={8}>
            <HugeiconsIcon icon={BubbleChatAddIcon} size={24} color={colors.accent} />
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
            onDelete={() => handleDeleteSession(item.id)}
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
  swipeContainer: {
    overflow: 'hidden',
    backgroundColor: colors.red,
  },
  deleteButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: DELETE_BUTTON_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.red,
  },
  deleteText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  rowAnimated: {
    backgroundColor: colors.bg,
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
