import { Stack } from 'expo-router';

import { colors } from '@/lib/constants';

export default function TabLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="agents" />
    </Stack>
  );
}
