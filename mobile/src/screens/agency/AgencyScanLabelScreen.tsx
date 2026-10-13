import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { useAgencyOrdersContext } from '../../context/AgencyOrdersContext';
import { api } from '../../api';
import { colors, fonts, radius, spacing, typography } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import Button from '../../components/Button';
import PostaIcon from '../../components/icons/PostaIcons';
import { AgencyStackParamList } from '../../navigation/types';
import { User } from '../../types';

type Props = NativeStackScreenProps<AgencyStackParamList, 'AgencyScanLabel'>;

const POSTA_ORDER_QR_PREFIX = 'POSTA-ORDER:';

async function currentLocation(): Promise<{ lat: number; lng: number } | undefined> {
  try {
    const last = await Location.getLastKnownPositionAsync();
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
  } catch {
    // sin ubicación
  }
  return undefined;
}

export default function AgencyScanLabelScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { palette: t } = useTheme();
  const { token } = useAuth();
  const { repartidores, refresh } = useAgencyOrdersContext();
  const [permission, requestPermission] = useCameraPermissions();
  const [selectedRep, setSelectedRep] = useState<User | null>(null);
  const [chooserOpen, setChooserOpen] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [scannedCount, setScannedCount] = useState(0);
  const lastCodeRef = useRef<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (repartidores.length === 1 && !selectedRep) {
      setSelectedRep(repartidores[0]);
    }
  }, [repartidores, selectedRep]);

  const handleScan = useCallback(
    async (scan: BarcodeScanningResult) => {
      const code = scan.data?.trim();
      if (!token || !code || !selectedRep || busyRef.current) return;
      if (scan.type !== 'qr' && !code) return;
      if (lastCodeRef.current === code) return;
      busyRef.current = true;
      lastCodeRef.current = code;
      setProcessing(true);
      try {
        const location = await currentLocation();
        if (code.startsWith(POSTA_ORDER_QR_PREFIX)) {
          const result = await api.scanOrderLabel(token, code, location, selectedRep.id);
          setScannedCount((n) => n + 1);
          setLastResult(
            result.alreadyAssigned
              ? `Ya en ${selectedRep.name}: ${result.order.clientName}`
              : `Asignado a ${selectedRep.name}: ${result.order.clientName}`
          );
        } else {
          const result = await api.scanImportMercadoLibre(
            token,
            code,
            location,
            selectedRep.id
          );
          setScannedCount((n) => n + 1);
          setLastResult(
            result.alreadyImported
              ? `Actualizado → ${selectedRep.name}: ${result.order.clientName}`
              : `Importado → ${selectedRep.name}: ${result.order.clientName}`
          );
        }
        void refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo procesar el escaneo.';
        setLastResult(null);
        Alert.alert('Escaneo', message, [
          {
            text: 'OK',
            onPress: () => {
              lastCodeRef.current = null;
            },
          },
        ]);
      } finally {
        setProcessing(false);
        busyRef.current = false;
      }
    },
    [token, selectedRep, refresh]
  );

  if (!permission) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: t.paper }]}>
        <ActivityIndicator color={t.sello} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View
        style={[
          styles.container,
          styles.center,
          { backgroundColor: t.paper, padding: spacing.xl, paddingTop: insets.top + spacing.lg },
        ]}
      >
        <PostaIcon name="camera" size={44} color={t.ink3} />
        <Text style={[typography.displayTitle(20), { color: t.ink, marginTop: spacing.md }]}>
          Permiso de cámara
        </Text>
        <Text style={[styles.permissionText, { color: t.ink2 }]}>
          Posta necesita la cámara para escanear etiquetas y asignarlas a un repartidor.
        </Text>
        <Button
          label={permission.canAskAgain ? 'Permitir cámara' : 'Abrir ajustes'}
          variant="amber"
          onPress={() => void requestPermission()}
          style={{ marginTop: spacing.lg, alignSelf: 'stretch' }}
        />
        <Pressable onPress={() => navigation.goBack()} style={{ marginTop: spacing.md }}>
          <Text style={{ color: t.ink3, fontFamily: fonts.body }}>Cancelar</Text>
        </Pressable>
      </View>
    );
  }

  if (chooserOpen || !selectedRep) {
    return (
      <View
        style={[
          styles.chooser,
          {
            backgroundColor: t.paper,
            paddingTop: insets.top + spacing.md,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}
      >
        <View style={styles.chooserHeader}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ color: t.sello, fontFamily: fonts.bodySemiBold }}>Cerrar</Text>
          </Pressable>
          <Text style={[typography.displayTitle(22), { color: t.ink }]}>Asignar a repartidor</Text>
          <Text style={[styles.chooserLead, { color: t.ink2 }]}>
            Elegí el repartidor que va a llevar estos paquetes. Cada etiqueta escaneada se le asigna
            automáticamente.
          </Text>
        </View>
        {repartidores.length === 0 ? (
          <View style={styles.center}>
            <Text style={{ color: t.ink3, textAlign: 'center', fontFamily: fonts.body }}>
              No hay repartidores. Creálos desde la web de Posta.
            </Text>
          </View>
        ) : (
          <FlatList
            data={repartidores}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
            renderItem={({ item }) => {
              const active = selectedRep?.id === item.id;
              return (
                <Pressable
                  onPress={() => {
                    setSelectedRep(item);
                    setChooserOpen(false);
                    lastCodeRef.current = null;
                    setLastResult(null);
                  }}
                  style={[
                    styles.repRow,
                    {
                      backgroundColor: active ? `${t.sello}18` : t.card,
                      borderColor: active ? t.sello : t.line,
                    },
                  ]}
                >
                  <Text style={[styles.repName, { color: t.ink }]}>{item.name}</Text>
                  <Text style={{ color: t.ink3, fontSize: 12, fontFamily: fonts.body }}>
                    @{item.username}
                    {item.deliveryZone ? ` · zona ${item.deliveryZone}` : ''}
                  </Text>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: '#0a0a0a' }]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={processing ? undefined : handleScan}
      />
      <View style={[styles.overlayTop, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.overlayBtn}>
          <Text style={styles.overlayBtnText}>Cerrar</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setChooserOpen(true);
            lastCodeRef.current = null;
          }}
          hitSlop={12}
          style={styles.overlayBtn}
        >
          <Text style={styles.overlayBtnText}>{selectedRep.name}</Text>
        </Pressable>
      </View>
      <View style={styles.frameWrap} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.hint}>Escaneá etiqueta Posta o Mercado Libre Flex</Text>
      </View>
      <View style={[styles.overlayBottom, { paddingBottom: insets.bottom + spacing.md }]}>
        {processing && <ActivityIndicator color={colors.accent} style={{ marginBottom: spacing.sm }} />}
        <Text style={styles.count}>
          {scannedCount} asignado{scannedCount === 1 ? '' : 's'} a {selectedRep.name}
        </Text>
        {lastResult ? <Text style={styles.result}>{lastResult}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  permissionText: {
    marginTop: spacing.sm,
    textAlign: 'center',
    fontFamily: fonts.body,
    lineHeight: 20,
  },
  chooser: { flex: 1 },
  chooserHeader: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  chooserLead: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  repRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  repName: {
    fontFamily: fonts.displaySemi,
    fontSize: 16,
    marginBottom: 2,
  },
  overlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    zIndex: 2,
  },
  overlayBtn: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  overlayBtnText: {
    color: '#fff',
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
  },
  frameWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 240,
    height: 240,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  hint: {
    marginTop: spacing.md,
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.body,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  overlayBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  count: {
    color: '#fff',
    fontFamily: fonts.displaySemi,
    fontSize: 15,
  },
  result: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.9)',
    fontFamily: fonts.body,
    fontSize: 13,
    textAlign: 'center',
  },
});
