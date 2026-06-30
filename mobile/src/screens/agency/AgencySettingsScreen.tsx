import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { useAgencyOrdersContext } from '../../context/AgencyOrdersContext';
import { OrderStatus } from '../../types';
import { colors, radius, spacing } from '../../theme';
import Button from '../../components/Button';
import { zoneLabel } from '../../config/deliveryZones';
import { AgencyStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AgencyStackParamList, 'AgencySettings'>;

export default function AgencySettingsScreen({ navigation: _navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { orders, repartidores, sellers, deliveryZones } = useAgencyOrdersContext();

  const pending = orders.filter((o) => o.status === OrderStatus.PENDING).length;
  const enRoute = orders.filter((o) => o.status === OrderStatus.DELIVERING).length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
    >
      <View style={styles.hero}>
        <Text style={styles.agencyName}>{user?.agencyName ?? 'Tu agencia'}</Text>
        <Text style={styles.userName}>{user?.name}</Text>
      </View>

      <View style={styles.statsRow}>
        <Stat label="Pendientes" value={String(pending)} />
        <Stat label="En ruta" value={String(enRoute)} />
        <Stat label="Repartidores" value={String(repartidores.length)} />
        <Stat label="Vendedores" value={String(sellers.length)} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Flota</Text>
        {repartidores.length === 0 ? (
          <Text style={styles.muted}>Sin repartidores. Creálos desde la web de Posta.</Text>
        ) : (
          repartidores.map((rep) => (
            <View key={rep.id} style={styles.row}>
              <Text style={styles.rowName}>🏍️ {rep.name}</Text>
              <Text style={styles.rowMeta}>
                {rep.deliveryZone ? zoneLabel(deliveryZones, rep.deliveryZone) : 'Sin zona'}
                {rep.currentLocation ? ' · GPS activo' : ''}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Vendedores</Text>
        {sellers.length === 0 ? (
          <Text style={styles.muted}>Sin vendedores registrados.</Text>
        ) : (
          sellers.map((seller) => (
            <View key={seller.id} style={styles.row}>
              <Text style={styles.rowName}>🏪 {seller.name}</Text>
              <Text style={styles.rowMeta}>@{seller.username}</Text>
            </View>
          ))
        )}
      </View>

      <Text style={styles.hint}>
        Para crear vendedores, repartidores, zonas de entrega o configurar el punto de salida, usá la web de Posta
        desde una computadora.
      </Text>

      <Button label="Cerrar sesión" variant="danger" onPress={logout} style={{ marginTop: spacing.xl }} />
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: { padding: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border },
  agencyName: { fontSize: 22, fontWeight: '700', color: colors.text },
  userName: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: { fontSize: 24, fontWeight: '700', color: colors.text },
  statLabel: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 10,
    color: colors.textFaint,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  section: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  sectionTitle: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 11,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowName: { fontSize: 15, color: colors.text, fontWeight: '600' },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  muted: { color: colors.textFaint, fontSize: 14 },
  hint: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.xl,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
});
