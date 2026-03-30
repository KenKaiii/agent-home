import { useEffect, useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { useLocalSearchParams, useNavigation } from 'expo-router';

import { AiBrain01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react-native';

import { AgentCard } from '@/components/AgentCard';
import { colors, fontSize, spacing } from '@/lib/constants';
import { useAgentsStore } from '@/stores/agents';

export default function AppAgentsScreen() {
  const { appId } = useLocalSearchParams<{ appId: string }>();
  const navigation = useNavigation();
  const agentsMap = useAgentsStore((s) => s.agents);
  const app = useAgentsStore((s) => s.apps.get(appId ?? ''));

  useEffect(() => {
    navigation.setOptions({ title: app?.name ?? 'App' });
  }, [app, navigation]);

  const agents = useMemo(() => {
    return Array.from(agentsMap.values())
      .filter((a) => !appId || a.appId === appId || a.appId === '')
      .sort((a, b) => {
        if (a.status === 'online' && b.status !== 'online') return -1;
        if (a.status !== 'online' && b.status === 'online') return 1;
        return a.name.localeCompare(b.name);
      });
  }, [agentsMap, appId]);

  return (
    <View style={styles.container}>
      {agents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <HugeiconsIcon icon={AiBrain01Icon} size={48} color={colors.textSecondary} />
          <Text style={styles.emptyText}>No agents available</Text>
        </View>
      ) : (
        <FlatList
          data={agents}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AgentCard agent={item} />}
          contentContainerStyle={styles.list}
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
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
