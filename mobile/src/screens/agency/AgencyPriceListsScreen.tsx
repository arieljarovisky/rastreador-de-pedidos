import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { api } from '../../api';
import {
  PriceList,
  PriceListSummary,
  RateTrio,
  SellerPriceListAssignment,
} from '../../types';
import { AgencyPalette, fonts, spacing } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type Tab = 'lists' | 'sellers';
type RateKey = keyof RateTrio;

interface DraftTrio {
  flex: string;
  express: string;
  standard: string;
}

interface ZoneDraft {
  ship: DraftTrio;
  driver: DraftTrio;
}

const RATE_ROWS: { key: RateKey; label: string }[] = [
  { key: 'flex', label: 'Flex' },
  { key: 'express', label: 'Express' },
  { key: 'standard', label: 'Estándar' },
];

function trioToDraft(rates: RateTrio): DraftTrio {
  return {
    flex: String(rates.flex),
    express: String(rates.express),
    standard: String(rates.standard),
  };
}

function draftToTrio(draft: DraftTrio): RateTrio | null {
  const parse = (value: string) => Number(value.replace(',', '.'));
  const flex = parse(draft.flex);
  const express = parse(draft.express);
  const standard = parse(draft.standard);
  if (![flex, express, standard].every((n) => Number.isFinite(n) && n >= 0)) return null;
  return { flex, express, standard };
}

function sanitizeAmount(value: string): string {
  const cleaned = value.replace(/[^\d.,]/g, '').replace(',', '.');
  const [whole, ...rest] = cleaned.split('.');
  if (rest.length === 0) return whole;
  return `${whole}.${rest.join('').slice(0, 2)}`;
}

function formatArs(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function AgencyPriceListsScreen() {
  const insets = useSafeAreaInsets();
  const { palette: t } = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const { token } = useAuth();

  const [tab, setTab] = useState<Tab>('lists');
  const [summaries, setSummaries] = useState<PriceListSummary[]>([]);
  const [list, setList] = useState<PriceList | null>(null);
  const [assignments, setAssignments] = useState<SellerPriceListAssignment[]>([]);
  const [zoneKey, setZoneKey] = useState('zona_caba');
  const [listName, setListName] = useState('');
  const [drafts, setDrafts] = useState<Record<string, ZoneDraft>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [assignSeller, setAssignSeller] = useState<SellerPriceListAssignment | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  const loadList = useCallback(
    async (listId: string) => {
      if (!token) return;
      const data = await api.getPriceList(token, listId);
      setList(data);
      setListName(data.name);
      const next: Record<string, ZoneDraft> = {};
      for (const zone of data.zoneRates) {
        next[zone.zoneKey] = {
          ship: trioToDraft(zone.shipping),
          driver: trioToDraft(zone.driverPay),
        };
      }
      setDrafts(next);
      selectedIdRef.current = data.id;
      setZoneKey((current) =>
        data.zoneRates.some((zone) => zone.zoneKey === current)
          ? current
          : (data.zoneRates[0]?.zoneKey ?? 'zona_caba')
      );
    },
    [token]
  );

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    const [lists, sellerRows] = await Promise.all([
      api.listPriceLists(token),
      api.listSellerPriceListAssignments(token),
    ]);
    setSummaries(lists);
    setAssignments(sellerRows);
    const currentId = selectedIdRef.current;
    const nextId =
      (currentId && lists.some((item) => item.id === currentId) ? currentId : null) ??
      lists.find((item) => item.isDefault)?.id ??
      lists[0]?.id;
    if (nextId) await loadList(nextId);
    else setList(null);
  }, [token, loadList]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load()
        .catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar las listas.'))
        .finally(() => setLoading(false));
    }, [load])
  );

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las listas.');
    } finally {
      setRefreshing(false);
    }
  };

  const zone = list?.zoneRates.find((item) => item.zoneKey === zoneKey) ?? list?.zoneRates[0];
  const draft = zone ? drafts[zone.zoneKey] : undefined;

  const updateDraft = (kind: 'ship' | 'driver', key: RateKey, value: string) => {
    if (!zone) return;
    setDrafts((current) => {
      const row = current[zone.zoneKey];
      if (!row) return current;
      return {
        ...current,
        [zone.zoneKey]: {
          ...row,
          [kind]: { ...row[kind], [key]: sanitizeAmount(value) },
        },
      };
    });
  };

  const save = async () => {
    if (!token || !list) return;
    const zoneRates = list.zoneRates.map((item) => {
      const row = drafts[item.zoneKey];
      const shipping = row ? draftToTrio(row.ship) : item.shipping;
      const driverPay = row ? draftToTrio(row.driver) : item.driverPay;
      if (!shipping || !driverPay) return null;
      return { zoneKey: item.zoneKey, shipping, driverPay };
    });
    if (zoneRates.some((item) => item == null)) {
      Alert.alert('Montos inválidos', 'Los precios tienen que ser números válidos, de 0 o más.');
      return;
    }
    const name = list.isDefault ? list.name : listName.trim() || list.name;
    if (name.length < 2) {
      Alert.alert('Nombre', 'El nombre de la lista tiene que tener al menos 2 caracteres.');
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updatePriceList(token, list.id, {
        name,
        zoneRates: zoneRates as Array<{ zoneKey: string; shipping: RateTrio; driverPay: RateTrio }>,
      });
      setList(updated);
      setListName(updated.name);
      const lists = await api.listPriceLists(token);
      setSummaries(lists);
      Alert.alert('Listo', 'Lista guardada.');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo guardar la lista.');
    } finally {
      setSaving(false);
    }
  };

  const createList = async () => {
    if (!token) return;
    const name = newName.trim();
    if (name.length < 2) {
      Alert.alert('Nombre', 'Ingresá un nombre de al menos 2 caracteres.');
      return;
    }
    setCreating(true);
    try {
      const created = await api.createPriceList(token, {
        name,
        cloneFromId: list?.id ?? null,
      });
      setNewName('');
      setCreateOpen(false);
      const lists = await api.listPriceLists(token);
      setSummaries(lists);
      await loadList(created.id);
      setTab('lists');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo crear la lista.');
    } finally {
      setCreating(false);
    }
  };

  const removeList = () => {
    if (!token || !list || list.isDefault) return;
    Alert.alert(
      'Eliminar lista',
      `¿Eliminar “${list.name}”? Los vendedores que la usaban pasan a la lista general.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                await api.deletePriceList(token, list.id);
                const lists = await api.listPriceLists(token);
                setSummaries(lists);
                const sellerRows = await api.listSellerPriceListAssignments(token);
                setAssignments(sellerRows);
                const next = lists.find((item) => item.isDefault) ?? lists[0];
                if (next) await loadList(next.id);
                else setList(null);
              } catch (err) {
                Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo eliminar.');
              } finally {
                setSaving(false);
              }
            })();
          },
        },
      ]
    );
  };

  const assign = async (sellerId: string, priceListId: string | null) => {
    if (!token) return;
    setAssigningId(sellerId);
    try {
      await api.assignSellerPriceList(token, sellerId, priceListId);
      const [sellerRows, lists] = await Promise.all([
        api.listSellerPriceListAssignments(token),
        api.listPriceLists(token),
      ]);
      setAssignments(sellerRows);
      setSummaries(lists);
      setAssignSeller(null);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo asignar la lista.');
    } finally {
      setAssigningId(null);
    }
  };

  const defaultList = summaries.find((item) => item.isDefault) ?? null;
  const assignOptions = useMemo(
    () => [
      { id: null as string | null, name: defaultList?.name ?? 'Lista general' },
      ...summaries.filter((item) => !item.isDefault).map((item) => ({ id: item.id, name: item.name })),
    ],
    [summaries, defaultList]
  );

  const selectedAssignId = (row: SellerPriceListAssignment): string | null => {
    if (!row.priceListId || row.priceListId === defaultList?.id) return null;
    return row.priceListId;
  };

  useEffect(() => {
    if (!zone && list?.zoneRates[0]) setZoneKey(list.zoneRates[0].zoneKey);
  }, [zone, list]);

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
            El cobro al vendedor y el pago al repartidor se definen por zona. Quien no tiene lista usa la general.
          </Text>
          <View style={styles.segment}>
            <Seg label="Editar" active={tab === 'lists'} onPress={() => setTab('lists')} />
            <Seg label="Asignar" active={tab === 'sellers'} onPress={() => setTab('sellers')} />
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading && !list && assignments.length === 0 ? (
          <ActivityIndicator color={t.sello} style={{ marginTop: spacing.xl }} />
        ) : tab === 'sellers' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Qué lista usa cada vendedor</Text>
            {assignments.length === 0 ? (
              <Text style={styles.muted}>Todavía no hay vendedores.</Text>
            ) : (
              assignments.map((row) => (
                <Pressable
                  key={row.sellerId}
                  style={({ pressed }) => [styles.personRow, pressed && styles.pressed]}
                  onPress={() => setAssignSeller(row)}
                  disabled={assigningId === row.sellerId}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.personName}>{row.sellerName}</Text>
                    <Text style={styles.personMeta}>
                      {row.priceListName ?? defaultList?.name ?? 'Lista general'}
                    </Text>
                  </View>
                  {assigningId === row.sellerId ? (
                    <ActivityIndicator color={t.sello} />
                  ) : (
                    <Text style={styles.chev}>›</Text>
                  )}
                </Pressable>
              ))
            )}
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {summaries.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => void loadList(item.id)}
                  style={[styles.chip, list?.id === item.id && styles.chipOn]}
                >
                  <Text style={[styles.chipText, list?.id === item.id && styles.chipTextOn]}>
                    {item.name}
                  </Text>
                  <Text style={[styles.chipMeta, list?.id === item.id && styles.chipTextOn]}>
                    {item.sellerCount} vendedor{item.sellerCount === 1 ? '' : 'es'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.section}>
              <Pressable
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                onPress={() => setCreateOpen(true)}
              >
                <Text style={styles.secondaryBtnText}>Nueva lista</Text>
              </Pressable>
              <Text style={styles.caption}>
                Se copia de {list?.name ?? 'la lista seleccionada'}.
              </Text>
            </View>

            {list && zone && draft ? (
              <View style={styles.section}>
                <Text style={styles.fieldLabel}>Nombre</Text>
                <TextInput
                  value={list.isDefault ? list.name : listName}
                  onChangeText={setListName}
                  editable={!list.isDefault}
                  scrollEnabled={false}
                  multiline={false}
                  style={[styles.input, list.isDefault && styles.inputDisabled]}
                />
                {list.isDefault ? (
                  <Text style={styles.caption}>La lista general no se puede renombrar ni eliminar.</Text>
                ) : null}

                <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Zona</Text>
                <View style={styles.zoneRow}>
                  {list.zoneRates.map((item) => (
                    <Pressable
                      key={item.zoneKey}
                      onPress={() => setZoneKey(item.zoneKey)}
                      style={[styles.zoneChip, zone.zoneKey === item.zoneKey && styles.chipOn]}
                    >
                      <Text
                        style={[styles.zoneChipText, zone.zoneKey === item.zoneKey && styles.chipTextOn]}
                      >
                        {item.zoneName}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.groupTitle}>Cobro al vendedor</Text>
                {RATE_ROWS.map((row) => (
                  <RateField
                    key={`ship-${row.key}`}
                    label={row.label}
                    value={draft.ship[row.key]}
                    onChange={(value) => updateDraft('ship', row.key, value)}
                  />
                ))}

                <Text style={styles.groupTitle}>Pago al repartidor</Text>
                {RATE_ROWS.map((row) => (
                  <RateField
                    key={`driver-${row.key}`}
                    label={row.label}
                    value={draft.driver[row.key]}
                    onChange={(value) => updateDraft('driver', row.key, value)}
                  />
                ))}

                <View style={styles.marginBox}>
                  {RATE_ROWS.map((row) => {
                    const ship = Number(draft.ship[row.key].replace(',', '.')) || 0;
                    const driver = Number(draft.driver[row.key].replace(',', '.')) || 0;
                    return (
                      <Text key={row.key} style={styles.marginLine}>
                        {row.label}: margen {formatArs(ship - driver)}
                      </Text>
                    );
                  })}
                </View>

                <Pressable
                  style={({ pressed }) => [styles.submit, saving && styles.submitDisabled, pressed && styles.pressed]}
                  disabled={saving}
                  onPress={() => void save()}
                >
                  {saving ? (
                    <ActivityIndicator color={t.markText} />
                  ) : (
                    <Text style={styles.submitText}>Guardar lista</Text>
                  )}
                </Pressable>

                {!list.isDefault ? (
                  <Pressable
                    style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressed]}
                    disabled={saving}
                    onPress={removeList}
                  >
                    <Text style={styles.dangerText}>Eliminar lista</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <Text style={[styles.muted, { marginHorizontal: spacing.lg }]}>No hay listas cargadas.</Text>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={createOpen} animationType="fade" transparent onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.modalFill}>
        <Pressable style={styles.backdrop} onPress={() => setCreateOpen(false)} />
        <View style={[styles.dialog, { marginBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.sheetTitle}>Nueva lista</Text>
          <Text style={styles.muted}>Se copian los precios de la lista que estás viendo.</Text>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="Nombre"
            placeholderTextColor={t.ink3}
            scrollEnabled={false}
            multiline={false}
            style={[styles.input, { marginTop: spacing.md }]}
            autoFocus
          />
          <Pressable
            style={({ pressed }) => [styles.submit, creating && styles.submitDisabled, pressed && styles.pressed]}
            disabled={creating}
            onPress={() => void createList()}
          >
            {creating ? (
              <ActivityIndicator color={t.markText} />
            ) : (
              <Text style={styles.submitText}>Crear</Text>
            )}
          </Pressable>
        </View>
        </View>
      </Modal>

      <Modal
        visible={assignSeller != null}
        animationType="slide"
        transparent
        onRequestClose={() => setAssignSeller(null)}
      >
        <View style={styles.modalFill}>
        <Pressable style={styles.backdrop} onPress={() => setAssignSeller(null)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.sheetTitle}>{assignSeller?.sellerName}</Text>
          <Text style={styles.muted}>Elegí la lista que va a usar.</Text>
          <ScrollView style={{ maxHeight: 360, marginTop: spacing.md }}>
            {assignOptions.map((option) => {
              const selected = assignSeller ? selectedAssignId(assignSeller) === option.id : false;
              return (
                <Pressable
                  key={option.id ?? 'default'}
                  style={({ pressed }) => [styles.sheetRow, selected && styles.personRowOn, pressed && styles.pressed]}
                  onPress={() => {
                    if (assignSeller) void assign(assignSeller.sellerId, option.id);
                  }}
                >
                  <Text style={styles.personName}>{option.name}</Text>
                  {option.id == null ? <Text style={styles.personMeta}>General</Text> : null}
                  {selected ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        </View>
      </Modal>
    </View>
  );
}

function Seg({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { palette: t } = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return (
    <Pressable onPress={onPress} style={[styles.seg, active && styles.chipOn]}>
      <Text style={[styles.segText, active && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function RateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { palette: t } = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return (
    <View style={styles.rateRow}>
      <Text style={styles.rateLabel} numberOfLines={1}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        scrollEnabled={false}
        multiline={false}
        style={styles.rateInput}
        placeholder="0"
        placeholderTextColor={t.ink3}
      />
    </View>
  );
}

function createStyles(t: AgencyPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.paper },
    block: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
    lead: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: t.ink2 },
    segment: { flexDirection: 'row', gap: 6, marginTop: 4 },
    seg: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.card,
    },
    segText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: t.ink2 },
    error: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      color: t.rojo,
      fontFamily: fonts.body,
      fontSize: 13,
    },
    section: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
    sectionTitle: {
      fontFamily: fonts.monoRegular,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: t.ink3,
      marginBottom: spacing.sm,
    },
    muted: { fontFamily: fonts.body, fontSize: 13.5, color: t.ink2, lineHeight: 19 },
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
    personName: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: t.ink },
    personMeta: { fontFamily: fonts.body, fontSize: 12, color: t.ink2, marginTop: 2 },
    chev: { color: t.ink3, fontSize: 18 },
    chips: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: 8 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.card,
    },
    chipOn: { borderColor: t.sello, backgroundColor: t.selloBg },
    chipText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: t.ink },
    chipTextOn: { color: t.sello },
    chipMeta: { fontFamily: fonts.body, fontSize: 11, color: t.ink3, marginTop: 2 },
    secondaryBtn: {
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.line2,
      backgroundColor: t.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: t.ink },
    caption: { fontFamily: fonts.body, fontSize: 12, color: t.ink3, marginTop: 6, lineHeight: 17 },
    fieldLabel: {
      fontFamily: fonts.monoRegular,
      fontSize: 10,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: t.ink3,
      marginBottom: 6,
    },
    input: {
      borderWidth: 1,
      borderColor: t.line2,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 0,
      height: 48,
      backgroundColor: t.card,
      color: t.ink,
      fontFamily: fonts.body,
      fontSize: 16,
      lineHeight: 20,
      textAlignVertical: 'center',
      includeFontPadding: false,
    },
    inputDisabled: { color: t.ink2, backgroundColor: t.flat },
    zoneRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    zoneChip: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.card,
    },
    zoneChipText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: t.ink2 },
    groupTitle: {
      marginTop: spacing.lg,
      marginBottom: 8,
      fontFamily: fonts.displaySemi,
      fontSize: 15,
      color: t.ink,
    },
    rateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      marginBottom: 8,
    },
    rateLabel: {
      flex: 1,
      flexShrink: 1,
      fontFamily: fonts.body,
      fontSize: 15,
      color: t.ink2,
    },
    rateInput: {
      width: '46%',
      flexGrow: 0,
      height: 42,
      borderWidth: 1,
      borderColor: t.line2,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 0,
      backgroundColor: t.card,
      color: t.ink,
      fontFamily: fonts.body,
      fontSize: 16,
      lineHeight: 20,
      textAlignVertical: 'center',
      includeFontPadding: false,
    },
    marginBox: {
      marginTop: 4,
      padding: 12,
      borderRadius: 12,
      backgroundColor: t.flat,
    },
    marginLine: { fontFamily: fonts.body, fontSize: 13, color: t.ink2, marginBottom: 2 },
    submit: {
      marginTop: spacing.lg,
      height: 46,
      borderRadius: 10,
      backgroundColor: t.sello,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitDisabled: { opacity: 0.45 },
    submitText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: t.markText },
    dangerBtn: {
      marginTop: 10,
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.rojo,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dangerText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: t.rojo },
    pressed: { opacity: 0.88 },
    modalFill: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(18, 22, 28, 0.45)' },
    dialog: {
      marginHorizontal: spacing.lg,
      backgroundColor: t.card,
      borderRadius: 16,
      padding: spacing.lg,
    },
    sheet: {
      backgroundColor: t.card,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      maxHeight: '70%',
    },
    sheetTitle: { fontFamily: fonts.displaySemi, fontSize: 18, color: t.ink, marginBottom: 4 },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: t.line,
    },
    check: { marginLeft: 'auto', color: t.sello, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  });
}
