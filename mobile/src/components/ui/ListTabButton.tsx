import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import PostaIcon, { PostaIconName } from '../icons/PostaIcons';
import { colors, fonts, spacing } from '../../theme';

interface Props {
  active: boolean;
  icon: PostaIconName;
  label: string;
  count: number;
  color: string;
  onPress: () => void;
}

export default function ListTabButton({ active, icon, label, count, color, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tab, active && { borderBottomColor: color, borderBottomWidth: 2.5 }]}
    >
      <View style={[styles.inner, active && { backgroundColor: `${color}10` }]}>
        <PostaIcon name={icon} size={16} color={active ? color : colors.textFaint} strokeWidth={1.75} />
        <Text
          style={[
            styles.label,
            { color: active ? color : colors.textFaint, fontFamily: active ? fonts.mono : fonts.bodyMedium },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <View
          style={[
            styles.badge,
            active ? { backgroundColor: `${color}22`, borderColor: `${color}55` } : styles.badgeIdle,
          ]}
        >
          <Text style={[styles.badgeText, { color: active ? color : colors.textFaint }]}>{count}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    minWidth: 0,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.15, flexShrink: 1 },
  badge: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIdle: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  badgeText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
  },
});
