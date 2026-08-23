import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Order } from '../types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { orderStatusPresentation } from '../utils/orderBadge';
import PostaIcon from './icons/PostaIcons';
import StatusBadge from './StatusBadge';
import IconLabelRow from './ui/IconLabelRow';
import MonoLabel from './ui/MonoLabel';
import MarketplaceSourceLogo from './MarketplaceSourceLogo';

interface Props {
  order: Order;
  onPress: () => void;
  showRepartidor?: boolean;
  showSeller?: boolean;
}

export default function OrderCard({ order, onPress, showRepartidor, showSeller }: Props) {
  const status = orderStatusPresentation(order);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.statusStripe, { backgroundColor: status.fg }]} />

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.idRow}>
            <MonoLabel color={colors.textFaint}>#{order.id.slice(-6)}</MonoLabel>
            <MarketplaceSourceLogo source={order.externalSource} />
          </View>
          <StatusBadge order={order} />
        </View>

        <Text style={styles.client} numberOfLines={1}>
          {order.clientName}
        </Text>
        <View style={styles.addressRow}>
          <PostaIcon name="mapPin" size={14} color={colors.textFaint} strokeWidth={1.5} />
          <Text style={styles.address} numberOfLines={2}>
            {order.address}
          </Text>
        </View>

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
          <View />
          <View style={styles.detailLink}>
            <Text style={styles.detailText}>Ver detalle</Text>
            <PostaIcon name="chevronRight" size={14} color={colors.accent} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },
  statusStripe: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  client: {
    ...typography.displaySection(16, colors.text),
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: 4,
  },
  address: {
    ...typography.body(13, colors.textMuted),
    lineHeight: 18,
    flex: 1,
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
