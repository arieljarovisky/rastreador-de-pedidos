import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Order } from '../../types';
import { AgencyPalette, fonts } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import PostaIcon from '../icons/PostaIcons';
import {
  channelLabel,
  plazoLabel,
  shortOrderCode,
  urgencyForOrder,
  AgencyUrgency,
} from '../../utils/agencyPanel';

interface Props {
  order: Order;
  onPress: () => void;
}

export default function AgencyOrderStub({ order, onPress }: Props) {
  const { palette: t } = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const urgency = urgencyForOrder(order);
  const code = shortOrderCode(order);
  const channel = channelLabel(order);
  const zone = order.address.split(',').slice(-2).join(',').trim() || order.address;

  const borderByUrgency: Record<AgencyUrgency, string> = {
    late: t.rojo,
    soon: t.ambar,
    ok: t.verde,
    flat: t.line2,
  };
  const tagBg: Record<AgencyUrgency, string> = {
    late: t.rojoBg,
    soon: t.ambarBg,
    ok: t.verdeBg,
    flat: t.flat,
  };
  const tagFg: Record<AgencyUrgency, string> = {
    late: t.rojo,
    soon: t.ambar,
    ok: t.verde,
    flat: t.ink2,
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.stub,
        { borderLeftColor: borderByUrgency[urgency] },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.perf} />
      <View style={styles.body}>
        <Text style={styles.code}>
          {code} · {channel}
        </Text>
        <Text style={styles.cliente} numberOfLines={1}>
          {order.clientName}
        </Text>
        <Text style={styles.zona} numberOfLines={1}>
          {zone}
        </Text>

        <View style={styles.sellerBox}>
          <Text style={styles.sellerLabel}>Vendedor</Text>
          <View style={styles.sellerRow}>
            <PostaIcon
              name="store"
              size={13}
              color={order.sellerName ? t.ink : t.ambar}
              strokeWidth={1.6}
            />
            <Text
              style={[styles.seller, !order.sellerName && { color: t.ambar }]}
              numberOfLines={1}
            >
              {order.sellerName ? order.sellerName : 'Sin vendedor asignado'}
            </Text>
          </View>
        </View>

        <View style={styles.foot}>
          <View style={[styles.tag, { backgroundColor: tagBg[urgency] }]}>
            <Text style={[styles.tagText, { color: tagFg[urgency] }]}>{plazoLabel(order)}</Text>
          </View>
          {order.repartidorName ? (
            <Text style={styles.rider} numberOfLines={1}>
              {order.repartidorName}
            </Text>
          ) : (
            <Text style={styles.noRider}>Sin repartidor</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function createStyles(t: AgencyPalette) {
  return StyleSheet.create({
    stub: {
      width: '100%',
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      borderLeftWidth: 3,
      borderRadius: 0,
      borderTopRightRadius: 12,
      borderBottomRightRadius: 12,
      paddingVertical: 13,
      paddingHorizontal: 15,
      marginBottom: 9,
      position: 'relative',
    },
    pressed: { borderColor: t.line2 },
    perf: {
      position: 'absolute',
      left: 9,
      top: 12,
      bottom: 12,
      borderLeftWidth: 1,
      borderStyle: 'dashed',
      borderLeftColor: t.line2,
    },
    body: { paddingLeft: 14 },
    code: {
      fontFamily: fonts.monoRegular,
      fontSize: 10.5,
      letterSpacing: 0.5,
      color: t.ink3,
      textTransform: 'uppercase',
    },
    cliente: {
      fontFamily: fonts.displaySemi,
      fontWeight: '600',
      fontSize: 16,
      color: t.ink,
      marginTop: 5,
      marginBottom: 2,
      letterSpacing: -0.15,
    },
    zona: {
      fontSize: 12.5,
      fontFamily: fonts.body,
      color: t.ink2,
    },
    sellerBox: {
      marginTop: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.flat,
    },
    sellerLabel: {
      fontFamily: fonts.monoRegular,
      fontSize: 9.5,
      letterSpacing: 0.8,
      color: t.ink3,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    sellerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    seller: {
      flex: 1,
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: t.ink,
    },
    foot: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      marginTop: 9,
    },
    tag: {
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 6,
    },
    tagText: {
      fontFamily: fonts.bodyMedium,
      fontSize: 11.5,
      fontWeight: '500',
    },
    rider: {
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 12.5,
      color: t.ink2,
    },
    noRider: {
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 12.5,
      color: t.rojo,
    },
  });
}
