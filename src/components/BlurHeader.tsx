import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { ArrowLeft02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontSize, spacing } from '@/lib/constants';
import { lightTap } from '@/lib/haptics';
import { playClick } from '@/lib/sounds';

interface BlurHeaderProps {
  title: string;
  rightElement?: React.ReactNode;
  showBack?: boolean;
  isWorking?: boolean;
}

/** Staggered bouncing dot for the thinking indicator */
function ThinkingDot({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: -6,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }),
        // Wait for the other dots to finish their cycle
        Animated.delay(600 - delay),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, delay]);

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          transform: [{ translateY: anim }],
          opacity: anim.interpolate({
            inputRange: [-6, 0],
            outputRange: [1, 0.4],
          }),
        },
      ]}
    />
  );
}

export function BlurHeader({ title, rightElement, showBack = true, isWorking }: BlurHeaderProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: isWorking ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isWorking, fadeAnim]);

  const insets = useSafeAreaInsets();
  const router = useRouter();
  const headerHeight = insets.top + 44 + 30;

  return (
    <View style={[styles.container, { height: headerHeight }]} pointerEvents="box-none">
      <MaskedView
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        maskElement={
          <LinearGradient
            colors={['rgba(0,0,0,1)', 'rgba(0,0,0,1)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0)']}
            locations={[0, 0.65, 0.85, 1]}
            style={StyleSheet.absoluteFill}
          />
        }
      >
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      </MaskedView>
      <View style={[styles.content, { marginTop: insets.top }]}>
        {showBack ? (
          <Pressable
            onPress={() => {
              lightTap();
              playClick();
              router.back();
            }}
            hitSlop={8}
            style={styles.backButton}
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} size={22} color={colors.accent} />
          </Pressable>
        ) : (
          <View style={styles.backButton} />
        )}
        <View style={styles.titleCenter}>
          {/* Static title — fades out when working */}
          <Animated.Text
            style={[
              styles.title,
              {
                opacity: fadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0],
                }),
              },
            ]}
            numberOfLines={1}
          >
            {title}
          </Animated.Text>

          {/* Working indicator — fades in when working */}
          <Animated.View style={[styles.workingRow, { opacity: fadeAnim }]} pointerEvents="none">
            <Text style={styles.workingText}>{title}</Text>
            <View style={styles.dotsContainer}>
              <ThinkingDot delay={0} />
              <ThinkingDot delay={150} />
              <ThinkingDot delay={300} />
            </View>
          </Animated.View>
        </View>
        <View style={styles.right}>{rightElement}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    paddingHorizontal: spacing.md,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 60,
  },
  titleCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: fontSize.lg,
    fontWeight: '600',
    textAlign: 'center',
  },
  workingRow: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    height: 20,
    justifyContent: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
  },
  workingText: {
    color: colors.accent,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  right: {
    minWidth: 60,
    alignItems: 'flex-end',
  },
});
