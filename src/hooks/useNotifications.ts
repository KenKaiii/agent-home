import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import Constants from 'expo-constants';
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
  const { relayUrl, token } = useConnectionStore();
  const responseListener = useRef<EventSubscription>(null);

  useEffect(() => {
    registerForPushNotifications(relayUrl, token);

    // Handle notification taps → navigate to correct chat
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.agentId) {
        router.push(`/chat/${data.agentId as string}`);
      }
    });

    return () => {
      responseListener.current?.remove();
      responseListener.current = null;
    };
  }, [router, relayUrl, token]);
}

async function registerForPushNotifications(relayUrl: string, authToken: string | null) {
  try {
    if (!Device.isDevice) {
      console.log('[notifications] Must use physical device for push notifications');
      return null;
    }

    if (!authToken) {
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

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const pushToken = tokenData.data;

    // Register push token with relay server
    const httpUrl = relayUrl
      .replace('ws://', 'http://')
      .replace('wss://', 'https://')
      .replace('/ws', '');

    await fetch(`${httpUrl}/devices/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        pushToken,
        deviceName: Device.deviceName ?? Device.modelName ?? undefined,
        platform: Platform.OS,
        appVersion: Constants.expoConfig?.version ?? undefined,
      }),
    });
    console.log('[notifications] Push token registered with relay');

    return pushToken;
  } catch (err) {
    console.warn('[notifications] Failed to register:', err);
    return null;
  }
}
