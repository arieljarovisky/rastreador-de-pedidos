import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { OrderStatus } from '../types';
import { radius, statusStyle } from '../theme';

export default function StatusBadge({ status }: { status: OrderStatus }) {
  const s = statusStyle(status);
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.text, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
