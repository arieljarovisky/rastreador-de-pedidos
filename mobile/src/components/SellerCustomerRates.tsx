import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { colors, radius, spacing } from '../theme';
import Button from './Button';
import PostaInput from './ui/PostaInput';

interface ZoneRate {
  zoneKey: string;
  zoneName: string;
  customerPrice: number | null;
  postaPrice: number;
}

function formatArs(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function SellerCustomerRates({ token }: { token: string }) {
  const [zones, setZones] = useState<ZoneRate[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const apply = useCallback((next: ZoneRate[]) => {
    setZones(next);
    setDrafts(
      Object.fromEntries(next.map((zone) => [zone.zoneKey, zone.customerPrice == null ? '' : String(zone.customerPrice)]))
    );
  }, []);

  const load = useCallback(async () => {
    const data = await api.getSellerCustomerRates(token);
    apply(data.zones);
  }, [apply, token]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      load()
        .catch((err: unknown) => {
          if (cancelled) return;
          Alert.alert('Error', err instanceof Error ? err.message : 'No se pudieron cargar los precios.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  const save = async (nextDrafts: Record<string, string>) => {
    setSaving(true);
    try {
      const payload = zones.map((zone) => {
        const raw = (nextDrafts[zone.zoneKey] ?? '').trim().replace(',', '.');
        if (raw === '') return { zoneKey: zone.zoneKey, customerPrice: null };
        const price = Number(raw);
        if (!Number.isFinite(price) || price < 0) {
          throw new Error(`El precio de ${zone.zoneName} tiene que ser un número mayor o igual a 0.`);
        }
        return { zoneKey: zone.zoneKey, customerPrice: price };
      });
      const data = await api.saveSellerCustomerRates(token, payload);
      apply(data.zones);
      Alert.alert('Listo', 'Tus clientes van a ver estos precios en Tienda Nube.');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudieron guardar los precios.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Precios para tus clientes</Text>
      <Text style={styles.hint}>
        Es lo que paga tu cliente por Posta Express en Tienda Nube. Si dejás una zona vacía, ve el mismo
        importe que te cobra Posta. En Mercado Libre, Shopify y WooCommerce el precio se define en cada tienda.
      </Text>
      {loading ? (
        <Text style={styles.hint}>Cargando precios…</Text>
      ) : (
        zones.map((zone) => (
          <View key={zone.zoneKey} style={styles.card}>
            <Text style={styles.zoneName}>{zone.zoneName}</Text>
            <Text style={styles.posta}>Posta te cobra {formatArs(zone.postaPrice)}</Text>
            <PostaInput
              value={drafts[zone.zoneKey] ?? ''}
              onChangeText={(value) => setDrafts((prev) => ({ ...prev, [zone.zoneKey]: value }))}
              placeholder="Igual que Posta"
              keyboardType="decimal-pad"
              style={styles.field}
            />
          </View>
        ))
      )}
      <Button
        label="Guardar precios"
        onPress={() => void save(drafts)}
        loading={saving}
        disabled={loading || zones.length === 0}
      />
      <Button
        label="Seguir el precio de Posta"
        variant="ghost"
        onPress={() => {
          setDrafts(Object.fromEntries(zones.map((zone) => [zone.zoneKey, ''])));
        }}
        disabled={loading || saving || zones.length === 0}
        style={{ marginTop: spacing.sm }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  zoneName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  posta: { color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: spacing.sm },
  field: { height: 44 },
});
