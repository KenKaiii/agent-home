import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, fontSize, spacing } from '@/lib/constants';
import { mediumTap } from '@/lib/haptics';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  isWorking?: boolean;
}

const BORDER_RADIUS = 16;
const BORDER_WIDTH = 1.5;

function ShimmerBorder({ isWorking }: { isWorking: boolean }) {
  const translate = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isWorking) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      const loop = Animated.loop(
        Animated.timing(translate, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      );
      animRef.current = loop;
      loop.start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();

      if (animRef.current) {
        animRef.current.stop();
        animRef.current = null;
      }
      translate.setValue(0);
    }
  }, [isWorking, translate, opacity]);

  // Shimmer sweeps from left (-100%) to right (+100%) of the container
  // We use a wide gradient (3x container width) and translate it across
  const translateX = translate.interpolate({
    inputRange: [0, 1],
    outputRange: [-400, 400],
  });

  return (
    <Animated.View style={[styles.shimmerLayer, { opacity }]} pointerEvents="none">
      <Animated.View style={[styles.shimmerGradient, { transform: [{ translateX }] }]}>
        <LinearGradient
          colors={[
            'transparent',
            'rgba(239, 141, 107, 0.15)',
            'rgba(239, 141, 107, 0.4)',
            colors.accent,
            'rgba(239, 141, 107, 0.4)',
            'rgba(239, 141, 107, 0.15)',
            'transparent',
          ]}
          locations={[0, 0.2, 0.35, 0.5, 0.65, 0.8, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
}

export function ChatInput({ onSend, disabled, isWorking = false }: ChatInputProps) {
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    mediumTap();
    onSend(trimmed);
    setText('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.borderHost}>
        <ShimmerBorder isWorking={isWorking} />
        <BlurView intensity={60} tint="systemChromeMaterialDark" style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={disabled ? 'Agent offline' : 'Message...'}
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={10000}
            editable={!disabled}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            textAlignVertical="top"
          />
          <Pressable
            style={[styles.sendButton, (!text.trim() || disabled) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || disabled}
          >
            <Text style={styles.sendText}>↑</Text>
          </Pressable>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
  },
  borderHost: {
    borderRadius: BORDER_RADIUS,
    overflow: 'hidden',
    position: 'relative',
  },
  shimmerLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  shimmerGradient: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -200,
    width: 600,
  },
  inputWrapper: {
    borderRadius: BORDER_RADIUS - BORDER_WIDTH,
    minHeight: 100,
    position: 'relative',
    overflow: 'hidden',
    margin: BORDER_WIDTH,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md + 36 + spacing.sm,
    color: colors.text,
    fontSize: fontSize.lg,
    minHeight: 100,
  },
  sendButton: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.border,
  },
  sendText: {
    color: '#ffffff',
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
});
