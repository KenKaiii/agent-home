import { Text } from 'react-native';

import { Tabs } from 'expo-router';

import { colors, fontSize } from '@/lib/constants';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
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
          title: 'Agents',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: fontSize.xl, color }}>🤖</Text>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: fontSize.xl, color }}>⚙️</Text>,
        }}
      />
    </Tabs>
  );
}
