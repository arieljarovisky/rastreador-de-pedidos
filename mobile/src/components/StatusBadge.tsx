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
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1.5,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    lineHeight: 13,
  },
});
