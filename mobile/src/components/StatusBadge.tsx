import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Order } from '../types';
import { fonts, radius } from '../theme';
import { orderStatusPresentation } from '../utils/orderBadge';

export default function StatusBadge({ order }: { order: Order }) {
  const s = orderStatusPresentation(order);
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
