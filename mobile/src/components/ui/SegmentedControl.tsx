import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import PostaIcon, { PostaIconName } from '../icons/PostaIcons';
import { colors, fonts, radius, spacing } from '../../theme';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: PostaIconName;
}

interface Props<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accentColor?: string;
  style?: ViewStyle;
}

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accentColor = colors.accent,
  style,
}: Props<T>) {
  return (
    <View style={[styles.wrap, style]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.segment,
              active && {
                backgroundColor: `${accentColor}18`,
                borderColor: accentColor,
              },
            ]}
          >
            {opt.icon ? (
              <PostaIcon
                name={opt.icon}
                size={15}
                color={active ? accentColor : colors.textFaint}
                strokeWidth={1.75}
              />
            ) : null}
            <Text style={[styles.label, active && { color: accentColor }]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 3,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.textMuted,
  },
});
