import * as Haptics from 'expo-haptics';

/** Light tap — navigation, dismiss, close, link taps */
export function lightTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Medium tap — send message, copy, retry, toggle */
export function mediumTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** Heavy tap — destructive actions (delete, disconnect) */
export function heavyTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

/** Success notification — copy confirmed, scan success */
export function successHaptic() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Warning notification — destructive confirmation */
export function warningHaptic() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}

/** Error notification — failures */
export function errorHaptic() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}

/** Selection tick — swipe thresholds, selection changes */
export function selectionTick() {
  Haptics.selectionAsync();
}
