import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import PostaIcon from '../icons/PostaIcons';
import { colors, fonts, radius, roleAccents, spacing } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { DELIVERY_TIMEZONE } from '../../utils/deliverySummary';

interface Props {
  agencyName: string;
  notificationCount?: number;
  onNotifications?: () => void;
  showThemeToggle?: boolean;
}

function formatWhen(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('es-AR', {
    timeZone: DELIVERY_TIMEZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = get('weekday').replace('.', '');
  const day = get('day');
  const month = get('month').replace('.', '');
  const hour = get('hour');
  const minute = get('minute');
  return `${weekday} ${day} ${month} · ${hour}:${minute}`;
}

const accent = roleAccents.agency;

export default function AgencyTopBar({
  agencyName,
  notificationCount = 0,
  onNotifications,
  showThemeToggle = true,
}: Props) {
  const { mode, toggleMode } = useTheme();
  const when = useMemo(() => formatWhen(), []);

  return (
    <View style={styles.top}>
      <View style={[styles.mark, { backgroundColor: `${accent}22`, borderColor: `${accent}55` }]}>
        <Text style={[styles.markText, { color: accent }]}>PD</Text>
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.name} numberOfLines={1}>
          {agencyName}
        </Text>
        <Text style={styles.when}>{when}</Text>
      </View>
      {showThemeToggle ? (
        <Pressable
          onPress={toggleMode}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          accessibilityLabel={mode === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
          hitSlop={8}
        >
          <PostaIcon
            name={mode === 'light' ? 'moon' : 'sun'}
            size={18}
            color={colors.textMuted}
            strokeWidth={1.7}
          />
        </Pressable>
      ) : null}
      {onNotifications ? (
        <Pressable
          onPress={onNotifications}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          accessibilityLabel="Notificaciones"
          hitSlop={8}
        >
          <PostaIcon name="bell" size={19} color={colors.textMuted} strokeWidth={1.7} />
          {notificationCount > 0 ? <View style={styles.dot} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  mark: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  textWrap: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: fonts.displaySemi,
    fontWeight: '600',
    fontSize: 16,
    lineHeight: 19,
    color: colors.text,
  },
  when: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    color: colors.textFaint,
    marginTop: 1,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dot: {
    position: 'absolute',
    top: 6,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.red,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  pressed: { backgroundColor: colors.surfaceAlt },
});
