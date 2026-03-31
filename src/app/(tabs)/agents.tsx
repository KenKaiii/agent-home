import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useRouter } from 'expo-router';

import { ComputerDesk01Icon, Settings01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react-native';

import { AppCard } from '@/components/AppCard';
import { BlurHeader } from '@/components/BlurHeader';
import { colors, fontSize, spacing } from '@/lib/constants';
import { lightTap } from '@/lib/haptics';
import { useAgentsStore } from '@/stores/agents';

export default function AgentsScreen() {
  const router = useRouter();
  const appsMap = useAgentsStore((s) => s.apps);

  const apps = useMemo(() => {
    const list = Array.from(appsMap.values());
    list.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    return list;
  }, [appsMap]);

  return (
    <View style={styles.container}>
      <BlurHeader
        title="Apps"
        showBack={false}
        rightElement={
          <Pressable
            onPress={() => {
              lightTap();
              router.push('/settings');
            }}
            hitSlop={8}
          >
            <HugeiconsIcon icon={Settings01Icon} size={22} color={colors.accent} />
          </Pressable>
        }
      />
      {apps.length === 0 ? (
        <View style={styles.emptyContainer}>
          <HugeiconsIcon icon={ComputerDesk01Icon} size={48} color={colors.textSecondary} />
          <Text style={styles.empty}>No apps connected</Text>
          <Text style={styles.hint}>Generate an SDK token to connect an app</Text>
        </View>
      ) : (
        <FlatList
          data={apps}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AppCard app={item} />}
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
    paddingTop: 100,
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
