import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import * as Device from 'expo-device';
import type { EventSubscription } from 'expo-modules-core';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

import { useConnectionStore } from '@/stores/connection';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function useNotifications() {
  const router = useRouter();
  const { relayUrl } = useConnectionStore();
  const notificationListener = useRef<EventSubscription>(null);
  const responseListener = useRef<EventSubscription>(null);

  useEffect(() => {
    registerForPushNotifications(relayUrl);

    // Handle notification taps → navigate to correct chat
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.agentId) {
        router.push(`/chat/${data.agentId as string}`);
      }
    });

    // Handle foreground notifications (just log, no system banner)
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('[notifications] Received in foreground:', notification);
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
      notificationListener.current = null;
      responseListener.current = null;
    };
  }, [router, relayUrl]);
}

async function registerForPushNotifications(relayUrl: string) {
  try {
    if (!Device.isDevice) {
      console.log('[notifications] Must use physical device for push notifications');
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({});
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[notifications] Permission not granted');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const pushToken = tokenData.data;
    console.log('[notifications] Push token:', pushToken);

    // Register push token with relay server
    const httpUrl = relayUrl
      .replace('ws://', 'http://')
      .replace('wss://', 'https://')
      .replace('/ws', '');

    await fetch(`${httpUrl}/devices/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: `app-${Device.modelName ?? 'unknown'}`,
        pushToken,
      }),
    });
    console.log('[notifications] Push token registered with relay');

    return pushToken;
  } catch (err) {
    console.warn('[notifications] Failed to register:', err);
    return null;
  }
}
