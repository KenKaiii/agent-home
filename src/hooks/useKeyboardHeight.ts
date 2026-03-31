import { useEffect, useRef } from 'react';
import { Animated, Easing, Keyboard, Platform } from 'react-native';

/**
 * Returns an Animated.Value that tracks the keyboard height,
 * animated in perfect sync with the iOS keyboard show/hide animation.
 *
 * iOS keyboard uses UIViewAnimationCurveKeyboard (curve 7) which is
 * closely approximated by Easing.bezier(0.17, 0.59, 0.4, 0.77).
 */
const IOS_KEYBOARD_EASING = Easing.bezier(0.17, 0.59, 0.4, 0.77);

export function useKeyboardHeight(): Animated.Value {
  const height = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const showSub = Keyboard.addListener('keyboardWillShow', (e) => {
      Animated.timing(height, {
        toValue: e.endCoordinates.height,
        duration: e.duration || 250,
        easing: IOS_KEYBOARD_EASING,
        useNativeDriver: false,
      }).start();
    });

    const hideSub = Keyboard.addListener('keyboardWillHide', (e) => {
      Animated.timing(height, {
        toValue: 0,
        duration: e.duration || 250,
        easing: IOS_KEYBOARD_EASING,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [height]);

  return height;
}
