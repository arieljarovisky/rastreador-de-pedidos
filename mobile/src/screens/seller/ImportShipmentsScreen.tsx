import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useSellerOrdersContext } from '../../context/SellerOrdersContext';
import { api } from '../../api';
import { MarketplaceShipmentPreview } from '../../types';
import { colors, radius, spacing } from '../../theme';
import Button from '../../components/Button';
import { SellerStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<SellerStackParamList, 'ImportShipments'>;

export default function ImportShipmentsScreen({ route, navigation }: Props) {
  const { platform } = route.params;
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { importShipments } = useSellerOrdersContext();
  const [shipments, setShipments] = useState<MarketplaceShipmentPreview[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.listMarketplaceShipments(token, platform);
      setShipments(data);
      setSelected(new Set());
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudieron cargar envíos.');
    }
  }, [token, platform]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const toggle = (externalId: string, alreadyImported: boolean) => {
    if (alreadyImported) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(externalId)) next.delete(externalId);
      else next.add(externalId);
      return next;
    });
  };

  const handleImport = async () => {
    if (selected.size === 0) {
      Alert.alert('Seleccioná envíos', 'Elegí al menos un envío para importar.');
      return;
    }
    setImporting(true);
    try {
      const result = await importShipments(platform, [...selected]);
      const parts: string[] = [];
      if (result.imported > 0) {
        parts.push(`${result.imported} importado(s)`);
      }
      if (result.skipped > 0) {
        parts.push(`${result.skipped} omitido(s)`);
      }
      if (result.errors.length > 0) {
        parts.push(`${result.errors.length} error(es)`);
      }
      Alert.alert('Importación', parts.join(' · ') || 'Listo.', [
        {
          text: 'OK',
          onPress: () => {
            if (result.orders.length === 1) {
              navigation.replace('SellerOrderDetail', {
                orderId: result.orders[0],
              });
            } else {
              navigation.goBack();
            }
          },
        },
      ]);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo importar.');
    } finally {
      setImporting(false);
    }
  };

  const title = platform === 'mercadolibre' ? 'Mercado Libre Flex' : 'Tienda Nube Express';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <Text style={styles.subtitle}>{title} · envíos disponibles para importar</Text>

      <FlatList
        data={shipments}
        keyExtractor={(item) => item.externalId}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No hay envíos pendientes de importar. Verificá que tu cuenta esté conectada.
          </Text>
        }
        renderItem={({ item }) => {
          const isSelected = selected.has(item.externalId);
          return (
            <Pressable
              onPress={() => toggle(item.externalId, item.alreadyImported)}
              style={[
                styles.card,
                item.alreadyImported && styles.cardDisabled,
                isSelected && styles.cardSelected,
              ]}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardId}>#{item.externalId}</Text>
                {item.alreadyImported ? (
                  <Text style={styles.importedTag}>Ya importado</Text>
                ) : (
                  <Text style={isSelected ? styles.checkOn : styles.checkOff}>
                    {isSelected ? '✓' : '○'}
                  </Text>
                )}
              </View>
              <Text style={styles.client}>{item.clientName}</Text>
              <Text style={styles.address} numberOfLines={2}>
                {item.address}
              </Text>
            </Pressable>
          );
        }}
      />

      <View style={styles.footer}>
        <Button
          label={
            selected.size > 0
              ? `Importar ${selected.size} envío(s)`
              : 'Importar seleccionados'
          }
          onPress={handleImport}
          loading={importing}
          disabled={selected.size === 0}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  list: { padding: spacing.xl, paddingTop: 0, flexGrow: 1 },
  empty: { color: colors.textFaint, textAlign: 'center', marginTop: 40, lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardSelected: { borderColor: colors.accent, backgroundColor: colors.accentBg },
  cardDisabled: { opacity: 0.55 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardId: { color: colors.textFaint, fontSize: 12, fontWeight: '700' },
  importedTag: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  checkOn: { color: colors.accent, fontSize: 18, fontWeight: '700' },
  checkOff: { color: colors.textFaint, fontSize: 18 },
  client: { color: colors.text, fontSize: 15, fontWeight: '700' },
  address: { color: colors.textMuted, fontSize: 13, marginTop: 2, lineHeight: 18 },
  footer: {
    padding: spacing.xl,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    backgroundColor: colors.surface,
  },
});
