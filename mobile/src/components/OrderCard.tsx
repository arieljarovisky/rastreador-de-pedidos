import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Order } from '../types';
import { colors, radius, spacing } from '../theme';
import StatusBadge from './StatusBadge';

interface Props {
  order: Order;
  onPress: () => void;
}

export default function OrderCard({ order, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.id}>{order.id}</Text>
        <StatusBadge status={order.status} />
      </View>

      <Text style={styles.client} numberOfLines={1}>
        {order.clientName}
      </Text>
      <Text style={styles.address} numberOfLines={2}>
        {order.address}
      </Text>

      <View style={styles.footerRow}>
        {order.externalSource ? (
          <Text style={styles.tag}>{order.externalSource}</Text>
        ) : (
          <View />
        )}
        <Text style={styles.chevron}>Ver detalle ›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  pressed: { opacity: 0.85 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  id: {
    color: colors.textFaint,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  client: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  address: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  tag: {
    color: colors.textFaint,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chevron: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: '600',
  },
});
