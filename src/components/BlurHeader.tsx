import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import MaskedView from '@react-native-masked-view/masked-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontSize, spacing } from '@/lib/constants';

interface BlurHeaderProps {
  title: string;
  rightElement?: React.ReactNode;
  showBack?: boolean;
}

export function BlurHeader({ title, rightElement, showBack = true }: BlurHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const headerHeight = insets.top + 44 + 30;

  return (
    <View style={[styles.container, { height: headerHeight }]}>
      <MaskedView
        style={StyleSheet.absoluteFill}
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
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
            <Text style={styles.backChevron}>‹</Text>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : (
          <View style={styles.backButton} />
        )}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
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
  backChevron: {
    color: colors.accent,
    fontSize: 28,
    lineHeight: 28,
    marginRight: 2,
  },
  backText: {
    color: colors.accent,
    fontSize: fontSize.lg,
  },
  title: {
    color: '#ffffff',
    fontSize: fontSize.lg,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  right: {
    minWidth: 60,
    alignItems: 'flex-end',
  },
});
