import React, { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { AgencyShippingService, MarketplaceAgency } from '../types';
import { colors, radius, spacing } from '../theme';

const SERVICE_LABELS: Record<AgencyShippingService['type'], string> = {
  same_day: 'Envío en el día',
  turbo: 'Envío turbo',
  custom: 'Personalizado',
};

function BuildingIcon({ size = 16, color = colors.accent }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function MapPinIcon({ size = 14, color = colors.accent }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21s7-4.5 7-10a7 7 0 1 0-14 0c0 5.5 7 10 7 10z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={11} r={2.5} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

function TruckIcon({ size = 14, color = colors.textMuted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10 17h4M3 17h2M19 17h2M5 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0zm10 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM3 13V6a1 1 0 0 1 1-1h11v8H3zM14 5h3l3 4v4h-6V5z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CheckIcon({ size = 14, color = colors.accent }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12l4 4L19 6" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CloseIcon({ size = 14, color = colors.red }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function ChevronIcon({ up, size = 14 }: { up?: boolean; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}
        stroke={colors.textMuted}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function formatTariff(tariff: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(tariff);
}

function AgencyDetailBody({ agency }: { agency: MarketplaceAgency }) {
  const location = [agency.city, agency.province].filter(Boolean).join(', ');
  return (
    <View style={styles.detailBody}>
      {agency.shippingServices.length > 0 && (
        <View style={styles.detailBlock}>
          <View style={styles.detailHeading}>
            <TruckIcon />
            <Text style={styles.detailHeadingText}>Servicios de envío</Text>
          </View>
          {agency.shippingServices.map((svc, i) => (
            <View key={`${svc.type}-${i}`} style={styles.serviceRow}>
              <Text style={styles.serviceTitle}>
                {svc.type === 'custom' && svc.label ? svc.label : SERVICE_LABELS[svc.type]}
              </Text>
              {svc.description ? <Text style={styles.serviceDesc}>{svc.description}</Text> : null}
            </View>
          ))}
        </View>
      )}
      <View style={styles.detailBlock}>
        <View style={styles.detailHeading}>
          <MapPinIcon />
          <Text style={styles.detailHeadingText}>Cobertura y tarifas</Text>
        </View>
        {location ? <Text style={styles.detailText}>Base: {location}</Text> : null}
        {agency.departurePoint?.address ? (
          <Text style={styles.detailSub}>Depósito: {agency.departurePoint.address}</Text>
        ) : null}
        {agency.coverageAreas?.map((area) => (
          <View key={area.id} style={styles.zoneRow}>
            <View style={styles.tariffRow}>
              <Text style={styles.zoneName}>{area.name}</Text>
              <Text style={styles.tariff}>{formatTariff(area.tariff)}</Text>
            </View>
            <Text style={styles.detailSub}>{area.places.join(' · ')}</Text>
            {area.minimumOrders != null && area.minimumOrders > 0 ? (
              <Text style={styles.detailSub}>Pedido mínimo: {area.minimumOrders}</Text>
            ) : null}
          </View>
        ))}
        {agency.coverageZones?.map((zone) => (
          <View key={zone.id} style={styles.zoneRow}>
            <Text style={styles.zoneName}>{zone.name}</Text>
            {zone.barrios && zone.barrios.length > 0 ? (
              <Text style={styles.detailSub}>{zone.barrios.join(' · ')}</Text>
            ) : null}
          </View>
        ))}
      </View>
      {(agency.website || agency.instagram) && (
        <View style={styles.linksRow}>
          {agency.website ? (
            <Pressable onPress={() => Linking.openURL(agency.website!.startsWith('http') ? agency.website! : `https://${agency.website}`)}>
              <Text style={styles.link}>{agency.website.replace(/^https?:\/\//, '')}</Text>
            </Pressable>
          ) : null}
          {agency.instagram ? (
            <Pressable onPress={() => Linking.openURL(`https://instagram.com/${agency.instagram!.replace(/^@/, '')}`)}>
              <Text style={styles.link}>@{agency.instagram.replace(/^@/, '')}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

interface Props {
  agencies: MarketplaceAgency[];
  selectedAgencyId?: string | null;
  saving: string | 'clear' | null;
  onSelect: (agencyId: string | null) => Promise<void>;
}

export default function AgencyMarketplaceList({ agencies, selectedAgencyId, saving, onSelect }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (agencies.length === 0) {
    return <Text style={styles.empty}>No hay agencias disponibles todavía.</Text>;
  }

  return (
    <View>
      {selectedAgencyId ? (
        <Pressable
          style={styles.clearBtn}
          disabled={!!saving}
          onPress={() => void onSelect(null)}
        >
          <CloseIcon />
          <Text style={styles.clearBtnText}>{saving === 'clear' ? 'Quitando…' : 'Quitar agencia seleccionada'}</Text>
        </Pressable>
      ) : null}

      {agencies.map((agency) => {
        const selected = agency.id === selectedAgencyId;
        const expanded = expandedId === agency.id;
        const busy = saving === agency.id || saving === 'clear';
        return (
          <View key={agency.id} style={[styles.card, selected && styles.cardSelected]}>
            <View style={styles.cardHeader}>
              <BuildingIcon />
              <View style={styles.cardMain}>
                <Text style={styles.cardTitle}>{agency.name}</Text>
                {(agency.city || agency.province) && (
                  <View style={styles.locationRow}>
                    <MapPinIcon size={12} color={colors.textMuted} />
                    <Text style={styles.rowSub}>{[agency.city, agency.province].filter(Boolean).join(', ')}</Text>
                  </View>
                )}
                {agency.shippingServices.length > 0 && (
                  <View style={styles.tagsRow}>
                    {agency.shippingServices.map((svc, i) => (
                      <View key={`${svc.type}-${i}`} style={styles.tag}>
                        <Text style={styles.tagText}>
                          {svc.type === 'custom' && svc.label ? svc.label : SERVICE_LABELS[svc.type]}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                {agency.coverageAreas && agency.coverageAreas.length > 0 && (
                  <View style={styles.tagsRow}>
                    {agency.coverageAreas.slice(0, 2).map((area) => (
                      <View key={area.id} style={styles.tagAccent}>
                        <Text style={styles.tagAccentText}>
                          {area.name} · {formatTariff(area.tariff)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                {expanded ? <AgencyDetailBody agency={agency} /> : null}
              </View>
              {selected ? (
                <View style={styles.selectedBadge}>
                  <CheckIcon size={12} />
                  <Text style={styles.selectedText}>Elegida</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.actionsRow}>
              <Pressable style={styles.actionBtn} onPress={() => setExpandedId(expanded ? null : agency.id)}>
                <ChevronIcon up={expanded} />
                <Text style={styles.actionText}>{expanded ? 'Ocultar' : 'Ver detalle'}</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, selected && styles.actionBtnDanger]}
                disabled={busy}
                onPress={() => void onSelect(selected ? null : agency.id)}
              >
                {selected ? (
                  <>
                    <CloseIcon size={12} />
                    <Text style={[styles.actionText, styles.actionTextDanger]}>Deseleccionar</Text>
                  </>
                ) : saving === agency.id ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <>
                    <CheckIcon />
                    <Text style={[styles.actionText, styles.actionTextAccent]}>Elegir</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.textMuted, fontSize: 13 },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  clearBtnText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  cardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentBg,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    alignItems: 'flex-start',
  },
  cardMain: { flex: 1, minWidth: 0 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  rowSub: { color: colors.textMuted, fontSize: 13 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  tag: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagText: { color: colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  tagAccent: {
    backgroundColor: colors.accentBg,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  tagAccentText: { color: colors.accent, fontSize: 10, fontWeight: '700' },
  tariffRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  tariff: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  selectedText: { color: colors.accent, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  actionsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.md,
  },
  actionBtnDanger: {},
  actionText: { color: colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  actionTextAccent: { color: colors.accent },
  actionTextDanger: { color: colors.red },
  detailBody: { marginTop: spacing.md, gap: spacing.md },
  detailBlock: { gap: spacing.sm },
  detailHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailHeadingText: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  serviceRow: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  serviceTitle: { color: colors.text, fontSize: 12, fontWeight: '600' },
  serviceDesc: { color: colors.textMuted, fontSize: 11, marginTop: 2, lineHeight: 16 },
  detailText: { color: colors.text, fontSize: 12 },
  detailSub: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  zoneRow: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  zoneName: { color: colors.text, fontSize: 12, fontWeight: '600' },
  linksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  link: { color: colors.accent, fontSize: 12, fontWeight: '600' },
});
