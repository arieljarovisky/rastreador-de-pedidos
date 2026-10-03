import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useAgencyOrdersContext } from '../../context/AgencyOrdersContext';
import { api } from '../../api';
import {
  BillingLedgerEntry,
  BillingSummary,
  DriverLedgerEntry,
  DriverSettlementSummary,
} from '../../types';
import { AgencyPalette, fonts, spacing } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { formatArDateTime } from '../../utils/deliverySummary';
import { BalancePeriod, balanceRange } from '../../utils/balancePeriods';

type AccountKind = 'sellers' | 'drivers';

interface PersonOption {
  id: string;
  name: string;
}

function formatArs(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

function shippingTypeLabel(type: string): string {
  if (type === 'flex') return 'Mercado Libre Flex';
  if (type === 'express') return 'Tienda Nube Express';
  return 'Carga manual';
}

export default function AgencyBalancesScreen() {
  const insets = useSafeAreaInsets();
  const { palette: t } = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const { token } = useAuth();
  const { sellers, repartidores } = useAgencyOrdersContext();

  const [kind, setKind] = useState<AccountKind>('sellers');
  const [period, setPeriod] = useState<BalancePeriod>('day');
  const [offset, setOffset] = useState(0);
  const [sellerSummary, setSellerSummary] = useState<BillingSummary | null>(null);
  const [driverSummary, setDriverSummary] = useState<DriverSettlementSummary | null>(null);
  const [sellerLedger, setSellerLedger] = useState<BillingLedgerEntry[]>([]);
  const [driverLedger, setDriverLedger] = useState<DriverLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [payPersonId, setPayPersonId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [recording, setRecording] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const range = useMemo(() => balanceRange(period, offset), [period, offset]);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    const { dateFrom, dateTo } = balanceRange(period, offset);
    if (kind === 'sellers') {
      const [summary, ledger] = await Promise.all([
        api.getBillingSummary(token, dateFrom, dateTo),
        api.getBillingLedger(token, dateFrom, dateTo, { limit: 80 }),
      ]);
      setSellerSummary(summary);
      setSellerLedger(ledger);
    } else {
      const [summary, ledger] = await Promise.all([
        api.getDriverSettlementSummary(token, dateFrom, dateTo),
        api.getDriverLedger(token, dateFrom, dateTo, { limit: 80 }),
      ]);
      setDriverSummary(summary);
      setDriverLedger(ledger);
    }
  }, [token, kind, period, offset]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load()
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el saldo.');
        })
        .finally(() => setLoading(false));
    }, [load])
  );

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el saldo.');
    } finally {
      setRefreshing(false);
    }
  };

  const changePeriod = (next: BalancePeriod) => {
    setPeriod(next);
    setOffset(0);
  };

  const people: PersonOption[] = useMemo(() => {
    const fromSummary =
      kind === 'sellers'
        ? (sellerSummary?.sellers ?? []).map((row) => ({ id: row.sellerId, name: row.sellerName }))
        : (driverSummary?.repartidores ?? []).map((row) => ({
            id: row.repartidorId,
            name: row.repartidorName,
          }));
    const roster =
      kind === 'sellers'
        ? sellers.map((person) => ({ id: person.id, name: person.name }))
        : repartidores.map((person) => ({ id: person.id, name: person.name }));
    const seen = new Set(fromSummary.map((person) => person.id));
    return [...fromSummary, ...roster.filter((person) => !seen.has(person.id))].sort((a, b) =>
      a.name.localeCompare(b.name, 'es')
    );
  }, [kind, sellerSummary, driverSummary, sellers, repartidores]);

  const selectedPerson = people.find((p) => p.id === payPersonId) ?? null;

  const recordPayment = async () => {
    if (!token || !payPersonId) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Monto inválido', 'Ingresá un monto mayor a cero.');
      return;
    }
    setRecording(true);
    try {
      if (kind === 'sellers') {
        await api.recordBillingPayment(token, {
          sellerId: payPersonId,
          amount,
          description: payNote.trim() || undefined,
        });
      } else {
        await api.recordDriverPayment(token, {
          repartidorId: payPersonId,
          amount,
          description: payNote.trim() || undefined,
        });
      }
      setPayAmount('');
      setPayNote('');
      Alert.alert('Listo', 'Pago registrado.');
      await load();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo registrar el pago.');
    } finally {
      setRecording(false);
    }
  };

  const summaryCards =
    kind === 'sellers' && sellerSummary
      ? [
          { label: 'Gastado', value: formatArs(sellerSummary.totalSpent) },
          {
            label: 'Pendiente',
            value: formatArs(sellerSummary.balance),
            tone: sellerSummary.balance > 0 ? ('warn' as const) : ('ok' as const),
          },
          { label: 'Cobrado', value: formatArs(sellerSummary.totalPaid) },
          { label: 'Envíos', value: String(sellerSummary.chargedShipments) },
        ]
      : kind === 'drivers' && driverSummary
        ? [
            { label: 'Generado', value: formatArs(driverSummary.totalEarned) },
            {
              label: 'A pagar',
              value: formatArs(driverSummary.balance),
              tone: driverSummary.balance > 0 ? ('warn' as const) : ('ok' as const),
            },
            { label: 'Pagado', value: formatArs(driverSummary.totalPaid) },
            { label: 'Entregas', value: String(driverSummary.deliveredShipments) },
          ]
        : [];

  const rows =
    kind === 'sellers'
      ? (sellerSummary?.sellers ?? []).map((row) => ({
          id: row.sellerId,
          name: row.sellerName,
          primary: formatArs(row.totalSpent),
          secondary: `Saldo ${formatArs(row.balance)}`,
          warn: row.balance > 0,
          meta: `${row.chargedShipments} envío${row.chargedShipments === 1 ? '' : 's'}`,
        }))
      : (driverSummary?.repartidores ?? []).map((row) => ({
          id: row.repartidorId,
          name: row.repartidorName,
          primary: formatArs(row.totalEarned),
          secondary: `A pagar ${formatArs(row.balance)}`,
          warn: row.balance > 0,
          meta: `${row.deliveredShipments} entrega${row.deliveredShipments === 1 ? '' : 's'}`,
        }));

  const movements =
    kind === 'sellers'
      ? sellerLedger.map((entry) => ({
          id: entry.id,
          title: entry.description,
          meta: `${formatArDateTime(entry.createdAt)}${entry.sellerName ? ` · ${entry.sellerName}` : ''}`,
          amount: entry.amount,
          payment: entry.entryType === 'payment',
        }))
      : driverLedger.map((entry) => ({
          id: entry.id,
          title: entry.description,
          meta: `${formatArDateTime(entry.createdAt)}${entry.repartidorName ? ` · ${entry.repartidorName}` : ''}`,
          amount: entry.amount,
          payment: entry.entryType === 'payment',
        }));

  const byType =
    kind === 'sellers' ? sellerSummary?.byShippingType : driverSummary?.byShippingType;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={t.sello} />
        }
      >
        <View style={styles.block}>
          <Text style={styles.lead}>
            {kind === 'sellers'
              ? 'Lo que los vendedores deben a la agencia por envíos entregados.'
              : 'Lo que la agencia debe a cada repartidor por entregas.'}
          </Text>

          <View style={styles.segment}>
            <SegButton
              label="Vendedores"
              active={kind === 'sellers'}
              onPress={() => {
                setKind('sellers');
                setPayPersonId('');
              }}
            />
            <SegButton
              label="Repartidores"
              active={kind === 'drivers'}
              onPress={() => {
                setKind('drivers');
                setPayPersonId('');
              }}
            />
          </View>

          <View style={styles.segment}>
            <SegButton label="Día" active={period === 'day'} onPress={() => changePeriod('day')} />
            <SegButton label="Semana" active={period === 'week'} onPress={() => changePeriod('week')} />
            <SegButton label="Mes" active={period === 'month'} onPress={() => changePeriod('month')} />
          </View>

          <View style={styles.periodNav}>
            <Pressable
              style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
              onPress={() => setOffset((n) => n - 1)}
            >
              <Text style={styles.navBtnText}>‹</Text>
            </Pressable>
            <View style={styles.periodCopy}>
              <Text style={styles.periodTitle}>{range.title}</Text>
              <Text style={styles.periodRange}>{range.rangeLabel}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.navBtn,
                offset >= 0 && styles.navBtnDisabled,
                pressed && offset < 0 && styles.pressed,
              ]}
              disabled={offset >= 0}
              onPress={() => setOffset((n) => Math.min(0, n + 1))}
            >
              <Text style={[styles.navBtnText, offset >= 0 && styles.navBtnTextDisabled]}>›</Text>
            </Pressable>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading && summaryCards.length === 0 ? (
          <ActivityIndicator color={t.sello} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            {loading ? <Text style={styles.updating}>Actualizando…</Text> : null}

            <View style={styles.cards}>
              {summaryCards.map((card) => (
                <View key={card.label} style={styles.card}>
                  <Text style={styles.cardLabel}>{card.label}</Text>
                  <Text
                    style={[
                      styles.cardValue,
                      card.tone === 'warn' && { color: t.ambar },
                      card.tone === 'ok' && { color: t.verde },
                    ]}
                  >
                    {card.value}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.caption}>
              {kind === 'sellers'
                ? 'Gastado y cobrado son del período. Pendiente es lo que todavía deben.'
                : 'Generado y pagado son del período. A pagar es lo que todavía les debés.'}
            </Text>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {kind === 'sellers' ? 'Saldo por vendedor' : 'Saldo por repartidor'}
              </Text>
              <Text style={styles.captionInline}>Tocá un nombre para cargarlo en el pago.</Text>
              {rows.length === 0 ? (
                <Text style={styles.muted}>No hay movimientos en este período.</Text>
              ) : (
                rows.map((row) => (
                  <Pressable
                    key={row.id}
                    style={({ pressed }) => [
                      styles.personRow,
                      payPersonId === row.id && styles.personRowOn,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => setPayPersonId(row.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.personName}>{row.name}</Text>
                      <Text style={styles.personMeta}>{row.meta}</Text>
                    </View>
                    <View style={styles.personAmounts}>
                      <Text style={styles.personPrimary}>{row.primary}</Text>
                      <Text style={[styles.personSecondary, row.warn && { color: t.ambar }]}>
                        {row.secondary}
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}
            </View>

            {byType && byType.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Por tipo de envío</Text>
                {byType.map((row) => (
                  <View key={row.shippingType} style={styles.personRow}>
                    <Text style={[styles.personName, { flex: 1 }]}>
                      {shippingTypeLabel(row.shippingType)}
                    </Text>
                    <View style={styles.personAmounts}>
                      <Text style={styles.personPrimary}>{formatArs(row.amount)}</Text>
                      <Text style={styles.personMeta}>
                        {row.count} envío{row.count === 1 ? '' : 's'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {kind === 'sellers' ? 'Registrar pago de vendedor' : 'Registrar pago a repartidor'}
              </Text>
              <View style={styles.form}>
                <Text style={styles.fieldLabel}>
                  {kind === 'sellers' ? 'Vendedor' : 'Repartidor'}
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.picker, pressed && styles.pressed]}
                  onPress={() => setPickerOpen(true)}
                >
                  <Text style={selectedPerson ? styles.pickerValue : styles.pickerPlaceholder}>
                    {selectedPerson?.name ??
                      (kind === 'sellers' ? 'Elegir vendedor' : 'Elegir repartidor')}
                  </Text>
                  <Text style={styles.chev}>›</Text>
                </Pressable>

                <Text style={styles.fieldLabel}>Monto (ARS)</Text>
                <TextInput
                  value={payAmount}
                  onChangeText={(value) => setPayAmount(value.replace(/[^\d]/g, ''))}
                  placeholder="Ej. 50000"
                  placeholderTextColor={t.ink3}
                  keyboardType="number-pad"
                  style={styles.input}
                />

                <Text style={styles.fieldLabel}>Nota (opcional)</Text>
                <TextInput
                  value={payNote}
                  onChangeText={setPayNote}
                  placeholder="Transferencia, efectivo…"
                  placeholderTextColor={t.ink3}
                  style={styles.input}
                />

                <Pressable
                  style={({ pressed }) => [
                    styles.submit,
                    (!payPersonId || !payAmount || recording) && styles.submitDisabled,
                    pressed && payPersonId && payAmount && styles.pressed,
                  ]}
                  disabled={!payPersonId || !payAmount || recording}
                  onPress={() => void recordPayment()}
                >
                  {recording ? (
                    <ActivityIndicator color={t.markText} />
                  ) : (
                    <Text style={styles.submitText}>Registrar pago</Text>
                  )}
                </Pressable>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Movimientos</Text>
              {movements.length === 0 ? (
                <Text style={styles.muted}>
                  No hay movimientos en este período. Los cargos aparecen cuando un envío se entrega.
                </Text>
              ) : (
                movements.map((entry) => (
                  <View key={entry.id} style={styles.moveRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.personName}>{entry.title}</Text>
                      <Text style={styles.personMeta}>{entry.meta}</Text>
                    </View>
                    <Text style={[styles.moveAmount, entry.payment ? { color: t.verde } : { color: t.ambar }]}>
                      {entry.payment ? '−' : '+'}
                      {formatArs(entry.amount)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.sheetTitle}>
            {kind === 'sellers' ? 'Elegir vendedor' : 'Elegir repartidor'}
          </Text>
          {people.length === 0 ? (
            <Text style={styles.muted}>
              {kind === 'sellers' ? 'No hay vendedores en la agencia.' : 'No hay repartidores en la agencia.'}
            </Text>
          ) : (
            <FlatList
              data={people}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
                  onPress={() => {
                    setPayPersonId(item.id);
                    setPickerOpen(false);
                  }}
                >
                  <Text style={styles.personName}>{item.name}</Text>
                  {payPersonId === item.id ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

function SegButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { palette: t } = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.seg, active && { backgroundColor: t.selloBg, borderColor: t.sello }]}
    >
      <Text style={[styles.segText, active && { color: t.sello }]}>{label}</Text>
    </Pressable>
  );
}

function createStyles(t: AgencyPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.paper },
    block: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
    lead: {
      fontFamily: fonts.body,
      fontSize: 13.5,
      lineHeight: 19,
      color: t.ink2,
      marginBottom: 4,
    },
    segment: { flexDirection: 'row', gap: 6 },
    seg: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.card,
    },
    segText: {
      fontFamily: fonts.bodySemiBold,
      fontSize: 13,
      color: t.ink2,
    },
    periodNav: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: 14,
      padding: 8,
      marginTop: 4,
    },
    navBtn: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.flat,
    },
    navBtnDisabled: { opacity: 0.4 },
    navBtnText: {
      fontSize: 22,
      color: t.ink,
      fontFamily: fonts.displaySemi,
      marginTop: -2,
    },
    navBtnTextDisabled: { color: t.ink3 },
    periodCopy: { flex: 1, alignItems: 'center' },
    periodTitle: {
      fontFamily: fonts.displaySemi,
      fontSize: 16,
      color: t.ink,
    },
    periodRange: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: t.ink2,
      marginTop: 1,
    },
    error: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      color: t.rojo,
      fontFamily: fonts.body,
      fontSize: 13,
    },
    updating: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      fontFamily: fonts.body,
      fontSize: 12,
      color: t.ink3,
    },
    caption: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      fontFamily: fonts.body,
      fontSize: 12,
      lineHeight: 17,
      color: t.ink3,
    },
    captionInline: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: t.ink3,
      marginBottom: spacing.sm,
    },
    cards: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },
    card: {
      flexBasis: '47%',
      flexGrow: 1,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: 12,
      padding: 12,
    },
    cardLabel: {
      fontFamily: fonts.monoRegular,
      fontSize: 10,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: t.ink3,
    },
    cardValue: {
      marginTop: 4,
      fontFamily: fonts.displaySemi,
      fontSize: 18,
      color: t.ink,
    },
    section: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
    sectionTitle: {
      fontFamily: fonts.monoRegular,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: t.ink3,
      marginBottom: spacing.sm,
    },
    muted: {
      fontFamily: fonts.body,
      fontSize: 13.5,
      color: t.ink2,
      lineHeight: 19,
    },
    personRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: 12,
      marginBottom: 8,
    },
    personRowOn: { borderColor: t.sello, backgroundColor: t.selloBg },
    personName: {
      fontFamily: fonts.bodySemiBold,
      fontSize: 14.5,
      color: t.ink,
    },
    personMeta: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: t.ink2,
      marginTop: 2,
    },
    personAmounts: { alignItems: 'flex-end' },
    personPrimary: {
      fontFamily: fonts.bodySemiBold,
      fontSize: 14,
      color: t.sello,
    },
    personSecondary: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: t.ink2,
      marginTop: 2,
    },
    form: {
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: 14,
      padding: spacing.lg,
      gap: 6,
    },
    fieldLabel: {
      fontFamily: fonts.monoRegular,
      fontSize: 10,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: t.ink3,
      marginTop: 6,
    },
    picker: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: t.line2,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 46,
      backgroundColor: t.paper,
    },
    pickerValue: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: t.ink },
    pickerPlaceholder: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: t.ink3 },
    chev: { color: t.ink3, fontSize: 18 },
    input: {
      borderWidth: 1,
      borderColor: t.line2,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 46,
      backgroundColor: t.paper,
      color: t.ink,
      fontFamily: fonts.body,
      fontSize: 16,
    },
    submit: {
      marginTop: 10,
      height: 46,
      borderRadius: 10,
      backgroundColor: t.sello,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitDisabled: { opacity: 0.45 },
    submitText: {
      fontFamily: fonts.bodySemiBold,
      fontSize: 15,
      color: t.markText,
    },
    moveRow: {
      flexDirection: 'row',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.line,
    },
    moveAmount: {
      fontFamily: fonts.bodySemiBold,
      fontSize: 14,
    },
    pressed: { opacity: 0.88 },
    backdrop: { flex: 1, backgroundColor: 'rgba(18, 22, 28, 0.45)' },
    sheet: {
      maxHeight: '70%',
      backgroundColor: t.card,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },
    sheetTitle: {
      fontFamily: fonts.displaySemi,
      fontSize: 18,
      color: t.ink,
      marginBottom: spacing.md,
    },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: t.line,
    },
    check: { color: t.sello, fontSize: 16, fontFamily: fonts.bodySemiBold },
  });
}
