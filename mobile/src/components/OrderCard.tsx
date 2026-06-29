import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Order } from '../types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import StatusBadge from './StatusBadge';
import MonoLabel from './ui/MonoLabel';

interface Props {
  order: Order;
  onPress: () => void;
  showRepartidor?: boolean;
  showSeller?: boolean;
}

export default function OrderCard({ order, onPress, showRepartidor, showSeller }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <MonoLabel color={colors.textFaint}>ID: {order.id}</MonoLabel>
        <StatusBadge status={order.status} />
      </View>

      <Text style={styles.client} numberOfLines={1}>
        {order.clientName}
      </Text>
      <Text style={styles.address} numberOfLines={2}>
        {order.address}
      </Text>

      {showSeller && order.sellerName ? (
        <Text style={styles.seller} numberOfLines={1}>
          🏪 {order.sellerName}
        </Text>
      ) : null}

      {showRepartidor && order.repartidorName ? (
        <Text style={styles.repartidor} numberOfLines={1}>
          🏍️ {order.repartidorName}
        </Text>
      ) : null}

      <View style={styles.footerRow}>
        {order.externalSource ? (
          <MonoLabel color={colors.textFaint}>{order.externalSource}</MonoLabel>
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
    borderRadius: radius.posta,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  pressed: { opacity: 0.88 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  client: {
    ...typography.displaySection(16, colors.text),
  },
  address: {
    ...typography.body(13, colors.textMuted),
    lineHeight: 18,
    marginTop: 2,
  },
  repartidor: {
    fontFamily: fonts.bodyMedium,
    color: colors.accent,
    fontSize: 12,
    marginTop: 4,
  },
  seller: {
    fontFamily: fonts.bodyMedium,
    color: colors.blue,
    fontSize: 12,
    marginTop: 4,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  chevron: {
    fontFamily: fonts.bodySemiBold,
    color: colors.accent,
    fontSize: 13,
  },
});
