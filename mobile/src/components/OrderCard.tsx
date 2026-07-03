import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Order } from '../types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import PostaIcon from './icons/PostaIcons';
import StatusBadge from './StatusBadge';
import IconLabelRow from './ui/IconLabelRow';
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
        <IconLabelRow
          icon="store"
          label={order.sellerName}
          color={colors.blue}
          iconBg={colors.accentBg}
        />
      ) : null}

      {showRepartidor && order.repartidorName ? (
        <IconLabelRow
          icon="motorcycle"
          label={order.repartidorName}
          color={colors.accent}
          iconBg={colors.accentBg}
        />
      ) : null}

      <View style={styles.footerRow}>
        {order.externalSource ? (
          <MonoLabel color={colors.textFaint}>{order.externalSource}</MonoLabel>
        ) : (
          <View />
        )}
        <View style={styles.detailLink}>
          <Text style={styles.detailText}>Ver detalle</Text>
          <PostaIcon name="chevronRight" size={14} color={colors.accent} />
        </View>
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
  pressed: { opacity: 0.88, transform: [{ scale: 0.995 }] },
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
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  detailText: {
    fontFamily: fonts.bodySemiBold,
    color: colors.accent,
    fontSize: 13,
  },
});
