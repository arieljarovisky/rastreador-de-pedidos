import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Order } from '../../types';
import { colors, fonts, radius, spacing } from '../../theme';
import { orderStatusPresentation } from '../../utils/orderBadge';
import StatusBadge from '../StatusBadge';
import IconLabelRow from '../ui/IconLabelRow';
import MarketplaceSourceLogo from '../MarketplaceSourceLogo';
import MonoLabel from '../ui/MonoLabel';
import PostaIcon from '../icons/PostaIcons';
import { plazoLabel, urgencyForOrder, AgencyUrgency } from '../../utils/agencyPanel';

interface Props {
  order: Order;
  onPress: () => void;
}

const plazoTone: Record<AgencyUrgency, { fg: string; bg: string }> = {
  late: { fg: colors.red, bg: colors.redBg },
  soon: { fg: colors.amber, bg: colors.amberBg },
  ok: { fg: colors.green, bg: colors.greenBg },
  flat: { fg: colors.textFaint, bg: colors.surfaceAlt },
};

export default function AgencyOrderStub({ order, onPress }: Props) {
  const status = orderStatusPresentation(order);
  const urgency = urgencyForOrder(order);
  const plazo = plazoTone[urgency];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.statusStripe, { backgroundColor: status.fg }]} />

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.idRow}>
            <MonoLabel color={colors.textFaint}>{order.id}</MonoLabel>
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

        <View style={styles.sellerBox}>
          <Text style={styles.sellerLabel}>Vendedor</Text>
          {order.sellerName ? (
            <IconLabelRow
              icon="store"
              label={order.sellerName}
              color={colors.text}
              style={styles.sellerRow}
            />
          ) : (
            <Text style={styles.noSeller}>Sin vendedor asignado</Text>
          )}
        </View>

        <View style={styles.foot}>
          <View style={[styles.plazoTag, { backgroundColor: plazo.bg }]}>
            <Text style={[styles.plazoText, { color: plazo.fg }]}>{plazoLabel(order)}</Text>
          </View>
          {order.repartidorName ? (
            <View style={styles.riderRow}>
              <PostaIcon name="motorcycle" size={13} color={colors.accent} strokeWidth={1.6} />
              <Text style={styles.rider} numberOfLines={1}>
                {order.repartidorName}
              </Text>
            </View>
          ) : (
            <Text style={styles.noRider}>Sin repartidor</Text>
          )}
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
  pressed: { opacity: 0.92, transform: [{ scale: 0.995 }] },
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
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  idRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: 0,
  },
  client: {
    fontFamily: fonts.displaySemi,
    fontWeight: '700',
    fontSize: 17,
    color: colors.text,
    letterSpacing: -0.2,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: 4,
  },
  address: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
  sellerBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  sellerLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sellerRow: {
    marginTop: 4,
  },
  noSeller: {
    marginTop: 4,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.amber,
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  plazoTag: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  plazoText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    fontWeight: '500',
  },
  riderRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minWidth: 0,
  },
  rider: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.accent,
  },
  noRider: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.red,
  },
});
