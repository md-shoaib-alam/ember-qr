import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { useTheme } from '@/theme';

type Props = {
  label: string;
  icon: IconName;
  onPress: () => void;
  /** Solid accent button; `secondary` is the outlined surface twin. */
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  busy?: boolean;
};

export function Button({ label, icon, onPress, variant = 'primary', disabled, busy }: Props) {
  const c = useTheme();
  const primary = variant === 'primary';
  const fg = primary ? c.onAccent : c.text;
  return (
    <Pressable
      role="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: c.accent }
          : { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
        { opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
      ]}>
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          <Icon name={icon} size={22} color={fg} />
          <Text style={[styles.label, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 16,
  },
  label: { fontFamily: 'Bricolage-700-16', fontSize: 16 },
});
