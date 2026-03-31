import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { colors, fontSize } from '@/lib/constants';

export function StreamingCursor() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return <Animated.Text style={[styles.cursor, { opacity }]}>▊</Animated.Text>;
}

const styles = StyleSheet.create({
  cursor: {
    color: colors.accent,
    fontSize: fontSize.md,
  },
});
