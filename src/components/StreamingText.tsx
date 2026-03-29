import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { colors, fontSize } from '@/lib/constants';

export function StreamingCursor() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible((v) => !v);
    }, 500);
    return () => clearInterval(timer);
  }, []);

  return (
    <Text style={[styles.cursor, { opacity: visible ? 1 : 0 }]}>▊</Text>
  );
}

const styles = StyleSheet.create({
  cursor: {
    color: colors.accent,
    fontSize: fontSize.md,
  },
});
