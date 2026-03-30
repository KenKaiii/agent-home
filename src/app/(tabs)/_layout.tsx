import { Tabs } from 'expo-router';

import { DashboardBrowsingIcon, Settings01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react-native';

import { colors } from '@/lib/constants';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
      }}
    >
      <Tabs.Screen
        name="agents"
        options={{
          title: 'Apps',
          tabBarIcon: ({ color }) => (
            <HugeiconsIcon icon={DashboardBrowsingIcon} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <HugeiconsIcon icon={Settings01Icon} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
