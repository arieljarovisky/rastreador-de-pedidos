import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { OrderStatus } from '../types';
import { fonts, radius, statusStyle } from '../theme';

export default function StatusBadge({ status }: { status: OrderStatus }) {
  const s = statusStyle(status);
  return (
    <View
      style={[
        styles.badge,
        {
          borderColor: s.fg,
          backgroundColor: s.bg,
        },
      ]}
    >
      <Text style={[styles.text, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 2,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.54,
    textTransform: 'uppercase',
    lineHeight: 12,
  },
});
