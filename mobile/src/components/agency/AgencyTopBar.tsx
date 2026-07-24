import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import PostaIcon from '../icons/PostaIcons';
import { AgencyPalette, fonts } from '../../theme';
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

export default function AgencyTopBar({
  agencyName,
  notificationCount = 0,
  onNotifications,
  showThemeToggle = true,
}: Props) {
  const { palette: t, mode, toggleMode } = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const when = useMemo(() => formatWhen(), []);

  return (
    <View style={styles.top}>
      <View style={styles.mark}>
        <Text style={styles.markText}>PD</Text>
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
          style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
          accessibilityLabel={mode === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
          hitSlop={8}
        >
          <PostaIcon
            name={mode === 'light' ? 'moon' : 'sun'}
            size={18}
            color={t.ink2}
            strokeWidth={1.7}
          />
        </Pressable>
      ) : null}
      {onNotifications ? (
        <Pressable
          onPress={onNotifications}
          style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
          accessibilityLabel="Notificaciones"
          hitSlop={8}
        >
          <PostaIcon name="bell" size={19} color={t.ink2} strokeWidth={1.7} />
          {notificationCount > 0 ? <View style={styles.dot} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(t: AgencyPalette) {
  return StyleSheet.create({
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 14,
      backgroundColor: t.card,
      borderBottomWidth: 1,
      borderBottomColor: t.line,
    },
    mark: {
      width: 36,
      height: 36,
      borderRadius: 9,
      backgroundColor: t.sello,
      alignItems: 'center',
      justifyContent: 'center',
    },
    markText: {
      fontFamily: fonts.displaySemi,
      fontWeight: '600',
      fontSize: 13,
      letterSpacing: 0.5,
      color: t.markText,
    },
    textWrap: { flex: 1, minWidth: 0 },
    name: {
      fontFamily: fonts.displaySemi,
      fontWeight: '600',
      fontSize: 16,
      lineHeight: 19,
      color: t.ink,
    },
    when: {
      fontFamily: fonts.monoRegular,
      fontSize: 11,
      color: t.ink3,
      marginTop: 1,
    },
    bell: {
      width: 34,
      height: 34,
      borderRadius: 8,
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
      backgroundColor: t.rojo,
      borderWidth: 1.5,
      borderColor: t.card,
    },
    pressed: { backgroundColor: t.paper },
  });
}
