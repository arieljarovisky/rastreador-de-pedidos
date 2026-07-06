import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import PostaIcon, { PostaIconName } from '../icons/PostaIcons';
import { colors, fonts, spacing, typography } from '../../theme';

interface ActionProps {
  label: string;
  onPress: () => void;
  color?: string;
  icon?: PostaIconName;
}

interface Props {
  icon: PostaIconName;
  title: string;
  message: string;
  action?: ActionProps;
  style?: ViewStyle;
}

export default function EmptyState({ icon, title, message, action, style }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.iconWrap}>
        <PostaIcon name={icon} size={32} color={colors.textFaint} strokeWidth={1.5} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: `${action.color ?? colors.accent}14`,
              borderColor: `${action.color ?? colors.accent}40`,
            },
            pressed && styles.pressed,
          ]}
        >
          {action.icon ? (
            <PostaIcon name={action.icon} size={16} color={action.color ?? colors.accent} />
          ) : null}
          <Text style={[styles.actionText, { color: action.color ?? colors.accent }]}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.displaySection(17, colors.text),
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 300,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
  },
  pressed: { opacity: 0.85 },
});
