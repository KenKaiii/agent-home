import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { MessageType } from '@agent-home/protocol';
import { AiBrain01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { nanoid } from 'nanoid/non-secure';

import { AgentCard } from '@/components/AgentCard';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { useAgents } from '@/hooks/useAgents';
import { colors, fontSize, spacing } from '@/lib/constants';
import { relayClient } from '@/lib/websocket';

export default function AgentsScreen() {
  const { agents } = useAgents();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Request fresh agent list from relay
    relayClient.send({
      id: nanoid(),
      type: MessageType.AGENT_LIST,
      timestamp: Date.now(),
    });
    // Stop spinner after a short delay (response will update store)
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  return (
    <View style={styles.container}>
      <ConnectionStatus />
      {agents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <HugeiconsIcon icon={AiBrain01Icon} size={48} color={colors.textSecondary} />
          <Text style={styles.empty}>No agents connected</Text>
          <Text style={styles.hint}>Start the bridge on your laptop</Text>
        </View>
      ) : (
        <FlatList
          data={agents}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AgentCard agent={item} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
              progressBackgroundColor={colors.surface}
            />
          }
        />
      )}
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
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  empty: {
    color: colors.text,
    fontSize: fontSize.lg,
    marginBottom: spacing.sm,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
});
