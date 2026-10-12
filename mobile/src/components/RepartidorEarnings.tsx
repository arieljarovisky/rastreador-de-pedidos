import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { DriverLedgerEntry, DriverSettlementSummary } from '../types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { BalancePeriod, balanceRange } from '../utils/balancePeriods';
import { formatArDateTime } from '../utils/deliverySummary';

const PERIODS: Array<{ id: BalancePeriod; label: string }> = [
  { id: 'day', label: 'Día' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
];

function formatArs(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

function entryTitle(entry: DriverLedgerEntry): string {
  if (entry.entryType === 'payment') return entry.description || 'Liquidación';
  if (entry.entryType === 'adjustment') return entry.description || 'Ajuste';
  return entry.description || (entry.orderId ? `Entrega ${entry.orderId}` : 'Entrega');
}

export default function RepartidorEarnings({
  token,
  reloadKey = 0,
}: {
  token: string;
  reloadKey?: number;
}) {
  const [period, setPeriod] = useState<BalancePeriod>('day');
  const [offset, setOffset] = useState(0);
  const [summary, setSummary] = useState<DriverSettlementSummary | null>(null);
  const [ledger, setLedger] = useState<DriverLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = balanceRange(period, offset);

  const load = useCallback(async () => {
    const current = balanceRange(period, offset);
    setError(null);
    try {
      const [nextSummary, nextLedger] = await Promise.all([
        api.getDriverSettlementSummary(token, current.dateFrom, current.dateTo),
        api.getDriverLedger(token, current.dateFrom, current.dateTo, { limit: 200 }),
      ]);
      setSummary(nextSummary);
      setLedger(nextLedger);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las estadísticas.');
    } finally {
      setLoading(false);
    }
  }, [token, period, offset, reloadKey]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const pickPeriod = (next: BalancePeriod) => {
    setPeriod(next);
    setOffset(0);
    setLoading(true);
  };

  const deliveries = summary?.deliveredShipments ?? 0;

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>Tus entregas</Text>
      <View style={styles.periods}>
        {PERIODS.map((item) => {
          const active = item.id === period;
          return (
            <Pressable
              key={item.id}
              onPress={() => pickPeriod(item.id)}
              style={[styles.period, active && styles.periodOn]}
            >
              <Text style={[styles.periodText, active && styles.periodTextOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.nav}>
        <Pressable onPress={() => { setOffset((value) => value - 1); setLoading(true); }} hitSlop={8}>
          <Text style={styles.navBtn}>Anterior</Text>
        </Pressable>
        <View style={styles.navCenter}>
          <Text style={styles.rangeTitle}>{range.title}</Text>
          <Text style={styles.rangeLabel}>{range.rangeLabel}</Text>
        </View>
        <Pressable
          disabled={offset === 0}
          onPress={() => { setOffset((value) => Math.min(0, value + 1)); setLoading(true); }}
          hitSlop={8}
        >
          <Text style={[styles.navBtn, offset === 0 && styles.navBtnOff]}>Siguiente</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.lg }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <>
          <Text style={styles.amount}>{formatArs(summary?.totalEarned ?? 0)}</Text>
          <Text style={styles.count}>
            {deliveries === 1 ? '1 pedido entregado' : `${deliveries} pedidos entregados`}
          </Text>

          <Text style={styles.historyTitle}>Historial</Text>
          {ledger.length === 0 ? (
            <Text style={styles.empty}>No hay movimientos en este período.</Text>
          ) : (
            ledger.map((entry) => {
              const payout = entry.entryType === 'payment';
              return (
                <View key={entry.id} style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {entryTitle(entry)}
                    </Text>
                    <Text style={styles.rowMeta}>{formatArDateTime(entry.createdAt).replace(/:\d{2}$/, '')}</Text>
                  </View>
                  <Text style={[styles.rowAmount, payout ? styles.rowPay : styles.rowEarn]}>
                    {payout ? '−' : '+'}
                    {formatArs(entry.amount)}
                  </Text>
                </View>
              );
            })
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  periods: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  period: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: radius.posta,
    borderWidth: 1,
    borderColor: colors.border,
  },
  periodOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  periodText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textMuted,
  },
  periodTextOn: {
    color: colors.ctaInk,
    fontFamily: fonts.bodySemiBold,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  navCenter: { flex: 1, alignItems: 'center' },
  navBtn: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.accent,
  },
  navBtnOff: { color: colors.textFaint },
  rangeTitle: {
    ...typography.displaySection(15),
    textAlign: 'center',
  },
  rangeLabel: {
    marginTop: 2,
    fontSize: 11,
    color: colors.textFaint,
    textAlign: 'center',
  },
  amount: {
    ...typography.displayTitle(32),
    marginTop: spacing.md,
  },
  count: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 14,
  },
  historyTitle: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  empty: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.red, fontSize: 13, marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowText: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 14, fontFamily: fonts.bodyMedium },
  rowMeta: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  rowAmount: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  rowEarn: { color: colors.green },
  rowPay: { color: colors.textMuted },
});
