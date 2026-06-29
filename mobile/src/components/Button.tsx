import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import { colors, paper, radius, typography } from '../theme';

type Variant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'amber';

const VARIANTS: Record<
  Variant,
  { bg: string; fg: string; border?: string; borderWidth?: number }
> = {
  primary: { bg: colors.stamp, fg: '#FFFFFF' },
  secondary: { bg: 'transparent', fg: colors.text, border: colors.text, borderWidth: 1.5 },
  success: { bg: colors.green, fg: '#04140d' },
  amber: { bg: colors.amber, fg: '#1a1203' },
  danger: { bg: colors.redBg, fg: colors.red, border: colors.red, borderWidth: 1 },
  ghost: { bg: 'transparent', fg: colors.textMuted, border: colors.border, borderWidth: 1 },
};

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  /** Tema papel para login */
  paperTheme?: boolean;
}

export default function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  paperTheme = false,
}: Props) {
  const v = VARIANTS[variant];
  const isDisabled = disabled || loading;

  let bg = v.bg;
  let fg = v.fg;
  let border = v.border ?? 'transparent';
  if (paperTheme) {
    if (variant === 'primary') {
      bg = paper.stamp;
      fg = '#FFFFFF';
    } else if (variant === 'secondary' || variant === 'ghost') {
      border = paper.ink;
      fg = paper.ink;
    }
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: v.borderWidth ?? (v.border ? 1.5 : 0),
          opacity: isDisabled ? 0.5 : pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={typography.buttonLabel(fg)}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 44,
    borderRadius: radius.posta,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
