import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useInitialize } from '@/hooks/useInitialize';
import { useNotifications } from '@/hooks/useNotifications';
import { useWebSocket } from '@/hooks/useWebSocket';
import { colors } from '@/lib/constants';

export default function RootLayout() {
  const ready = useInitialize();
  useWebSocket(ready);
  useNotifications();

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor={colors.bg} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            contentStyle: { backgroundColor: colors.bg },
            headerShown: false,
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="chat/[agentId]"
            options={{
              headerShown: true,
              headerBackTitle: 'Back',
            }}
          />
        </Stack>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
