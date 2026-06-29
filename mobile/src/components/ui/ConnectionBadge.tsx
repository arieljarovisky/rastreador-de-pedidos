import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '../../theme';

interface Props {
  connected: boolean;
  compact?: boolean;
}

/** Indicador de conexión — .connection-indicator en la web */
export default function ConnectionBadge({ connected, compact }: Props) {
  return (
    <View
      style={[
        styles.wrap,
        compact && styles.compact,
        connected ? styles.live : styles.offline,
      ]}
    >
      <View style={[styles.dot, connected ? styles.dotLive : styles.dotOff]} />
      {!compact && (
        <Text style={[styles.label, connected ? styles.labelLive : styles.labelOff]}>
          {connected ? 'En vivo' : 'Sin conexión'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.posta,
    borderWidth: 1,
  },
  compact: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  live: {
    backgroundColor: colors.greenBg,
    borderColor: colors.greenBorder,
  },
  offline: {
    backgroundColor: 'rgba(92, 105, 134, 0.12)',
    borderColor: 'rgba(92, 105, 134, 0.28)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotLive: { backgroundColor: colors.green },
  dotOff: { backgroundColor: colors.textFaint },
  label: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  labelLive: { color: colors.green },
  labelOff: { color: colors.textFaint },
});
