import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';
import { BillingLedgerEntry, BillingSummary } from '../../types';
import { colors, radius, spacing } from '../../theme';
import Button from '../../components/Button';
import { TAB_BAR_CLEARANCE } from '../../constants/layout';
import { SellerStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<SellerStackParamList, 'SellerShippingAccount'>;

function formatArs(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

function currentMonthRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    dateFrom: `${y}-${m}-01`,
    dateTo: `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
  };
}

export default function SellerShippingAccountScreen(_props: Props) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [ledger, setLedger] = useState<BillingLedgerEntry[]>([]);
  const [mpAvailable, setMpAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payLoading, setPayLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const range = currentMonthRange();
    const [summaryData, ledgerData, opts] = await Promise.all([
      api.getBillingSummary(token, range.dateFrom, range.dateTo),
      api.getBillingLedger(token, range.dateFrom, range.dateTo),
      api.getBillingPaymentOptions(token),
    ]);
    setSummary(summaryData);
    setLedger(ledgerData);
    setMpAvailable(opts.mercadoPagoAvailable);
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load()
        .catch((err) => Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo cargar.'))
        .finally(() => setLoading(false));
    }, [load])
  );

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo cargar.');
    } finally {
      setRefreshing(false);
    }
  };

  const pay = async () => {
    if (!token) return;
    setPayLoading(true);
    try {
      const { initPoint } = await api.createBillingCheckout(token);
      await Linking.openURL(initPoint);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo iniciar el pago.');
    } finally {
      setPayLoading(false);
    }
  };

  if (loading && !summary) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingBottom: TAB_BAR_CLEARANCE + spacing.xl,
        paddingHorizontal: spacing.xl,
      }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
      }
    >
      <Text style={styles.title}>Mi cuenta de envíos</Text>
      <Text style={styles.subtitle}>Saldo y pagos a tu agencia</Text>

      {summary && (
        <View style={styles.statsRow}>
          <Stat label="Gastado" value={formatArs(summary.totalSpent)} />
          <Stat label="Saldo" value={formatArs(summary.balance)} highlight={summary.balance > 0} />
        </View>
      )}

      {summary && summary.balance > 0 && mpAvailable && (
        <Button
          label={payLoading ? 'Abriendo…' : `Pagar ${formatArs(summary.balance)} con Mercado Pago`}
          onPress={pay}
          loading={payLoading}
          style={{ marginTop: spacing.md }}
        />
      )}

      {summary && summary.balance > 0 && !mpAvailable && (
        <Text style={styles.hint}>
          Tu agencia aún no conectó Mercado Pago. Coordiná el pago por transferencia o efectivo.
        </Text>
      )}

      <Text style={styles.sectionTitle}>Movimientos recientes</Text>
      {ledger.length === 0 ? (
        <Text style={styles.muted}>No hay movimientos este mes.</Text>
      ) : (
        ledger.map((entry) => (
          <View key={entry.id} style={styles.ledgerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ledgerDesc}>{entry.description}</Text>
              <Text style={styles.ledgerDate}>
                {new Date(entry.createdAt).toLocaleString('es-AR')}
              </Text>
            </View>
            <Text
              style={[
                styles.ledgerAmount,
                entry.entryType === 'payment' ? styles.amountOk : styles.amountCharge,
              ]}
            >
              {entry.entryType === 'payment' ? '−' : '+'}
              {formatArs(entry.amount)}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, highlight && { color: colors.amber }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: spacing.lg },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.text },
  statLabel: {
    fontSize: 10,
    color: colors.textFaint,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  sectionTitle: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    fontSize: 11,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ledgerDesc: { color: colors.text, fontSize: 14, fontWeight: '600' },
  ledgerDate: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  ledgerAmount: { fontWeight: '700', fontSize: 14 },
  amountOk: { color: colors.green },
  amountCharge: { color: colors.amber },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.md, lineHeight: 17 },
  muted: { color: colors.textMuted, fontSize: 13 },
});
