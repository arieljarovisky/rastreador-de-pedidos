import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Order } from '../../types';
import { colors, fonts, radius, spacing } from '../../theme';
import StatusBadge from '../StatusBadge';
import IconLabelRow from '../ui/IconLabelRow';
import PostaIcon from '../icons/PostaIcons';
import { plazoLabel, urgencyForOrder, AgencyUrgency } from '../../utils/agencyPanel';

interface Props {
  order: Order;
  onPress: () => void;
}

const plazoColor: Record<AgencyUrgency, { fg: string; bg: string }> = {
  late: { fg: colors.red, bg: colors.redBg },
  soon: { fg: colors.amber, bg: colors.amberBg },
  ok: { fg: colors.green, bg: colors.greenBg },
  flat: { fg: colors.textFaint, bg: colors.surfaceAlt },
};

export default function AgencyOrderStub({ order, onPress }: Props) {
  const urgency = urgencyForOrder(order);
  const plazo = plazoColor[urgency];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.orderId} numberOfLines={1}>
          {order.id}
        </Text>
        <StatusBadge status={order.status} />
      </View>

      <Text style={styles.client} numberOfLines={1}>
        {order.clientName}
      </Text>
      <Text style={styles.address} numberOfLines={2}>
        {order.address}
      </Text>

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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  pressed: { opacity: 0.92 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  orderId: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textMuted,
  },
  client: {
    fontFamily: fonts.displaySemi,
    fontWeight: '700',
    fontSize: 18,
    color: colors.text,
    letterSpacing: -0.2,
  },
  address: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 18,
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
  },
  plazoTag: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
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
