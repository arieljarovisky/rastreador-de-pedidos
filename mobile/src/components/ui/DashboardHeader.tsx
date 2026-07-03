import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import PostaIcon, { PostaIconName } from '../icons/PostaIcons';
import { colors, fonts, spacing } from '../../theme';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

interface Props {
  eyebrow: string;
  title: string;
  subtitle?: string;
  connected: boolean;
  onNotifications?: () => void;
  notificationCount?: number;
  onLogout: () => void;
  accentColor?: string;
  style?: ViewStyle;
}

export default function DashboardHeader({
  eyebrow,
  title,
  subtitle,
  connected,
  onNotifications,
  notificationCount = 0,
  onLogout,
  accentColor = colors.accent,
  style,
}: Props) {
  return (
    <View style={[styles.header, style]}>
      <View style={styles.left}>
        <View style={[styles.avatar, { backgroundColor: `${accentColor}22`, borderColor: `${accentColor}55` }]}>
          <Text style={[styles.avatarText, { color: accentColor }]}>{initials(title)}</Text>
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.right}>
        {onNotifications ? (
          <Pressable
            onPress={onNotifications}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            accessibilityLabel="Notificaciones"
          >
            <PostaIcon name="bell" size={18} color={colors.textMuted} />
            {notificationCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {notificationCount > 9 ? '9+' : notificationCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
        <View style={styles.liveBadge}>
          <View style={[styles.liveDot, connected ? styles.liveOn : styles.liveOff]} />
          <Text style={[styles.liveText, connected ? styles.liveTextOn : styles.liveTextOff]}>
            {connected ? 'En vivo' : 'Offline'}
          </Text>
        </View>
        <Pressable
          onPress={onLogout}
          hitSlop={8}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          accessibilityLabel="Salir"
        >
          <PostaIcon name="logOut" size={18} color={colors.red} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minWidth: 0,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '700',
  },
  textWrap: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontFamily: fonts.mono,
    fontSize: 8,
    fontWeight: '700',
    color: '#fff',
  },
  pressed: { opacity: 0.85 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveOn: { backgroundColor: colors.green },
  liveOff: { backgroundColor: colors.textFaint },
  liveText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  liveTextOn: { color: colors.green },
  liveTextOff: { color: colors.textFaint },
});
