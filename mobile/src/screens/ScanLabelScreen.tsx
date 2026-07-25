import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { colors, radius, spacing, typography } from '../theme';
import Button from '../components/Button';
import PostaIcon from '../components/icons/PostaIcons';
import { RepartidorStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RepartidorStackParamList, 'ScanLabel'>;

const POSTA_ORDER_QR_PREFIX = 'POSTA-ORDER:';

async function currentLocation(): Promise<{ lat: number; lng: number } | undefined> {
  try {
    const last = await Location.getLastKnownPositionAsync();
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
  } catch {
    // sin ubicación disponible
  }
  return undefined;
}

export default function ScanLabelScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [processing, setProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [scannedCount, setScannedCount] = useState(0);
  const lastCodeRef = useRef<string | null>(null);
  const busyRef = useRef(false);

  const handleScan = useCallback(
    async (scan: BarcodeScanningResult) => {
      const code = scan.data?.trim();
      if (!token || !code || busyRef.current) return;
      // Evita reprocesar el mismo QR mientras sigue en el encuadre.
      if (lastCodeRef.current === code) return;
      busyRef.current = true;
      lastCodeRef.current = code;
      setProcessing(true);
      try {
        const location = await currentLocation();
        if (code.startsWith(POSTA_ORDER_QR_PREFIX)) {
          const result = await api.scanOrderLabel(token, code, location);
          setScannedCount((n) => n + 1);
          setLastResult(
            result.alreadyAssigned
              ? `Ya asignado: ${result.order.clientName} (${result.order.id})`
              : `Asignado: ${result.order.clientName} (${result.order.id})`
          );
        } else {
          const result = await api.scanImportMercadoLibre(token, code, location);
          setScannedCount((n) => n + 1);
          const flexNote = result.mlFlexRegistered ? '' : `\n${result.mlFlexMessage}`;
          setLastResult(
            result.alreadyImported
              ? `Reescaneado: ${result.order.clientName} (${result.order.id})${flexNote}`
              : `Agregado: ${result.order.clientName} (${result.order.id})${flexNote}`
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo procesar el escaneo.';
        setLastResult(null);
        Alert.alert('Escaneo', message, [
          {
            text: 'OK',
            onPress: () => {
              // Permite reintentar el mismo código tras cerrar el error.
              lastCodeRef.current = null;
            },
          },
        ]);
      } finally {
        setProcessing(false);
        busyRef.current = false;
      }
    },
    [token]
  );

  if (!permission) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.center, { padding: spacing.xl }]}>
        <PostaIcon name="camera" size={44} color={colors.textFaint} />
        <Text style={[typography.displayTitle(20), styles.permissionTitle]}>
          Permiso de cámara
        </Text>
        <Text style={styles.permissionText}>
          Posta necesita la cámara para escanear las etiquetas de tus envíos.
        </Text>
        <Button
          label={permission.canAskAgain ? 'Permitir cámara' : 'Abrir ajustes'}
          variant="amber"
          onPress={() => void requestPermission()}
          style={styles.permissionBtn}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'datamatrix'] }}
        onBarcodeScanned={processing ? undefined : (scan) => void handleScan(scan)}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()} hitSlop={12}>
          <PostaIcon name="chevronDown" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>Escanear etiqueta</Text>
        <View style={styles.closeBtn} />
      </View>

      <View style={styles.frame} pointerEvents="none">
        <View style={styles.frameBox} />
        <Text style={styles.frameHint}>Apuntá al QR de la etiqueta</Text>
      </View>

      <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + spacing.lg }]}>
        {processing ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.statusText}>Registrando paquete…</Text>
          </View>
        ) : lastResult ? (
          <View style={styles.statusRow}>
            <PostaIcon name="checkCircle" size={20} color={colors.green ?? '#4caf50'} />
            <Text style={styles.statusText} numberOfLines={3}>
              {lastResult}
            </Text>
          </View>
        ) : (
          <Text style={styles.statusText}>
            Escaneá la etiqueta del pedido para asignártelo.
          </Text>
        )}
        {scannedCount > 0 ? (
          <Button
            label={`Listo (${scannedCount} escaneado${scannedCount === 1 ? '' : 's'})`}
            variant="amber"
            onPress={() => navigation.goBack()}
            style={styles.doneBtn}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  permissionTitle: { textAlign: 'center' },
  permissionText: {
    color: colors.textFaint,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  permissionBtn: { marginTop: spacing.md, alignSelf: 'stretch' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: 'rgba(20, 18, 16, 0.72)',
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  frame: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  frameBox: {
    width: 240,
    height: 240,
    borderRadius: radius?.lg ?? 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  frameHint: {
    color: colors.text,
    fontSize: 13,
    backgroundColor: 'rgba(20, 18, 16, 0.6)',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: 'rgba(20, 18, 16, 0.85)',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusText: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  doneBtn: { width: '100%' },
});
