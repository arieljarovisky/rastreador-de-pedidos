import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import PostaIcon, { PostaIconName } from '../icons/PostaIcons';
import { colors, fonts, radius, spacing } from '../../theme';

interface Props {
  icon: PostaIconName;
  label: string;
  onPress: () => void;
  variant?: 'default' | 'danger' | 'accent';
  disabled?: boolean;
  style?: ViewStyle;
}

/** Botón compacto con icono SVG para acciones secundarias. */
export default function IconActionChip({
  icon,
  label,
  onPress,
  variant = 'default',
  disabled = false,
  style,
}: Props) {
  const palette =
    variant === 'danger'
      ? { fg: colors.red, bg: colors.redBg, border: 'rgba(229, 86, 79, 0.35)' }
      : variant === 'accent'
        ? { fg: colors.accent, bg: colors.accentBg, border: colors.accentBorder }
        : { fg: colors.textMuted, bg: colors.surfaceAlt, border: colors.border };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <PostaIcon name={icon} size={16} color={palette.fg} />
      <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.posta,
    borderWidth: 1,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
  },
});
