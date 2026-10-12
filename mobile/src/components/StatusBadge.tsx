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
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0,
    textTransform: 'none',
    lineHeight: 13,
  },
});
