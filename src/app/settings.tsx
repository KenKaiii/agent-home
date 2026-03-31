import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { router } from 'expo-router';

import { BlurHeader } from '@/components/BlurHeader';
import { colors, fontSize, spacing } from '@/lib/constants';
import { heavyTap, lightTap, selectionTick } from '@/lib/haptics';
import { playClick } from '@/lib/sounds';
import { useAgentsStore } from '@/stores/agents';
import { useConnectionStore } from '@/stores/connection';
import type { ConnectedApp } from '@/types';

const DISCONNECT_BUTTON_WIDTH = 100;
const SWIPE_THRESHOLD = 40;

function ConnectedAppRow({
  app,
  onDisconnect,
  onSwipeStart,
  onSwipeOpen,
  onSwipeClose,
  closeRef,
}: {
  app: ConnectedApp;
  onDisconnect: () => void;
  onSwipeStart: () => void;
  onSwipeOpen: () => void;
  onSwipeClose: () => void;
  closeRef: React.MutableRefObject<(() => void) | null>;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const callbacksRef = useRef({ onSwipeStart, onSwipeOpen, onSwipeClose });
  callbacksRef.current = { onSwipeStart, onSwipeOpen, onSwipeClose };

  const close = useCallback(() => {
    if (isOpen.current) {
      isOpen.current = false;
      Animated.timing(translateX, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      callbacksRef.current.onSwipeClose();
    }
  }, [translateX]);

  const closeRefStable = useRef(closeRef);
  closeRefStable.current = closeRef;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const dominated = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2;
        return Math.abs(gestureState.dx) > 15 && dominated;
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        callbacksRef.current.onSwipeStart();
      },
      onPanResponderMove: (_, gestureState) => {
        if (isOpen.current) {
          const newVal = -DISCONNECT_BUTTON_WIDTH + gestureState.dx;
          translateX.setValue(Math.min(0, Math.max(-DISCONNECT_BUTTON_WIDTH, newVal)));
        } else {
          translateX.setValue(Math.min(0, Math.max(-DISCONNECT_BUTTON_WIDTH, gestureState.dx)));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const velocity = gestureState.vx;
        if (isOpen.current) {
          if (gestureState.dx > SWIPE_THRESHOLD) {
            isOpen.current = false;
            callbacksRef.current.onSwipeClose();
            Animated.spring(translateX, {
              toValue: 0,
              velocity,
              stiffness: 300,
              damping: 30,
              mass: 0.8,
              useNativeDriver: true,
            }).start();
          } else {
            Animated.spring(translateX, {
              toValue: -DISCONNECT_BUTTON_WIDTH,
              velocity,
              stiffness: 300,
              damping: 30,
              mass: 0.8,
              useNativeDriver: true,
            }).start();
          }
        } else {
          if (gestureState.dx < -SWIPE_THRESHOLD) {
            selectionTick();
            isOpen.current = true;
            closeRefStable.current.current = close;
            callbacksRef.current.onSwipeOpen();
            Animated.spring(translateX, {
              toValue: -DISCONNECT_BUTTON_WIDTH,
              velocity,
              stiffness: 300,
              damping: 30,
              mass: 0.8,
              useNativeDriver: true,
            }).start();
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              velocity,
              stiffness: 300,
              damping: 30,
              mass: 0.8,
              useNativeDriver: true,
            }).start();
          }
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: isOpen.current ? -DISCONNECT_BUTTON_WIDTH : 0,
          stiffness: 300,
          damping: 30,
          mass: 0.8,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  const agentStatus = useAgentsStore((s) => s.agents.get(app.id)?.status);

  return (
    <View style={styles.swipeContainer}>
      <Pressable
        style={styles.disconnectButton}
        onPress={() => {
          heavyTap();
          Animated.timing(translateX, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            isOpen.current = false;
            onDisconnect();
          });
        }}
      >
        <Text style={styles.disconnectText}>Disconnect</Text>
      </Pressable>
      <Animated.View
        style={[styles.appRowAnimated, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.appRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: agentStatus === 'online' ? '#22c55e' : '#ef4444' },
            ]}
          />
          <View style={styles.appInfo}>
            <Text style={styles.appName} numberOfLines={1}>
              {app.name}
            </Text>
            <Text style={styles.appMeta} numberOfLines={1}>
              {app.hostName || app.platform}
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

export default function SettingsScreen() {
  const { relayUrl, token } = useConnectionStore();
  const appsMap = useAgentsStore((s) => s.apps);
  const apps = useMemo(() => Array.from(appsMap.values()), [appsMap]);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const openRowCloseRef = useRef<(() => void) | null>(null);
  const hasOpenRow = useRef(false);

  const handleSwipeOpen = useCallback(() => {
    hasOpenRow.current = true;
  }, []);

  const handleSwipeClose = useCallback(() => {
    hasOpenRow.current = false;
    openRowCloseRef.current = null;
  }, []);

  const handleSwipeStart = useCallback(() => {
    if (hasOpenRow.current && openRowCloseRef.current) {
      openRowCloseRef.current();
    }
    setScrollEnabled(false);
    setTimeout(() => setScrollEnabled(true), 300);
  }, []);

  const handleDisconnect = useCallback(
    (app: ConnectedApp) => {
      heavyTap();
      // Remove from relay via HTTP if connected
      if (token) {
        const httpUrl = relayUrl
          .replace('wss://', 'https://')
          .replace('ws://', 'http://')
          .replace(/\/ws$/, '');
        fetch(`${httpUrl}/devices/${app.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).catch((error) => {
          console.error('[settings] Failed to disconnect app:', error);
        });
      }
      // Remove from local store (persisted — survives relay re-sync)
      useAgentsStore.getState().disconnectApp(app.id);
    },
    [token, relayUrl],
  );

  return (
    <View style={styles.container}>
      <BlurHeader title="Settings" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={scrollEnabled}
      >
        <View style={styles.section}>
          <Pressable
            style={({ pressed }) => [styles.generateButton, pressed && styles.buttonPressed]}
            onPress={() => {
              lightTap();
              playClick();
              router.push('/generate-token');
            }}
          >
            <Text style={styles.generateButtonText}>Generate SDK Token</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connected Apps</Text>
          {apps.length > 0 ? (
            <View style={styles.appsList}>
              {apps.map((app) => (
                <ConnectedAppRow
                  key={app.id}
                  app={app}
                  onDisconnect={() => handleDisconnect(app)}
                  onSwipeStart={handleSwipeStart}
                  onSwipeOpen={handleSwipeOpen}
                  onSwipeClose={handleSwipeClose}
                  closeRef={openRowCloseRef}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No apps connected</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 100,
  },
  section: {
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    marginBottom: spacing.md,
  },
  generateButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    padding: spacing.lg,
    alignItems: 'center',
  },
  generateButtonText: {
    color: '#ffffff',
    fontSize: fontSize.lg,
    fontWeight: '400',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  appsList: {
    marginTop: spacing.sm,
  },
  swipeContainer: {
    overflow: 'hidden',
    backgroundColor: colors.red,
    borderRadius: 10,
    marginBottom: spacing.sm,
  },
  disconnectButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: DISCONNECT_BUTTON_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.red,
  },
  disconnectText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  appRowAnimated: {
    backgroundColor: colors.surface,
    borderRadius: 10,
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.md,
  },
  appInfo: {
    flex: 1,
  },
  appName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  appMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
});
