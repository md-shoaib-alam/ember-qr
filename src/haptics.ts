import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export type HapticWeight = 'hard' | 'soft';

// Fire and forget: a missing vibrator or a web build must never delay the action it accompanies.
export function tap(weight: HapticWeight) {
  if (Platform.OS === 'web') return;
  const style = weight === 'hard' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light;
  Haptics.impactAsync(style).catch(() => {});
}
