import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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
import { formatScanCodeLabel } from '../utils/scanCodeLabel';
import { parseShippingLabelOcr } from '../utils/parseShippingLabelOcr';
import { DriverScanEntry } from '../types';
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

async function recognizeLabelFromPhoto(
  uri: string
): Promise<{ address: string | null; clientName: string | null }> {
  try {
    const ocr = await import('expo-mlkit-ocr');
    if (typeof ocr.isSupported === 'function' && !ocr.isSupported()) {
      return { address: null, clientName: null };
    }
    const result = await ocr.recognizeText(uri);
    return parseShippingLabelOcr(result?.text ?? '');
  } catch (err) {
    console.warn('[ocr] recognize failed:', err);
    return { address: null, clientName: null };
  }
}

function entryHasAddress(entry: Pick<DriverScanEntry, 'address'>): boolean {
  return Boolean(entry.address?.trim());
}

export default function ScanLabelScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [processing, setProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [scannedCount, setScannedCount] = useState(0);
  const [addressDraft, setAddressDraft] = useState('');
  const [pendingAddressEntry, setPendingAddressEntry] = useState<DriverScanEntry | null>(null);
  const [savingAddress, setSavingAddress] = useState(false);
  const [ocrReading, setOcrReading] = useState(false);
  const lastCodeRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const cameraRef = useRef<CameraView>(null);

  const showPersonalResult = useCallback((entry: DriverScanEntry) => {
    setScannedCount((n) => n + 1);
    setLastResult(
      entry.alreadyRegistered
        ? `Ya en tu registro: ${entry.clientName?.trim() || formatScanCodeLabel(entry.scanCode)}${
            entry.address?.trim() ? `\n${entry.address.trim()}` : ''
          }`
        : `Registro: ${entry.clientName?.trim() || formatScanCodeLabel(entry.scanCode)}${
            entry.address?.trim() ? `\n${entry.address.trim()}` : ''
          }`
    );
  }, []);

  /** Foto + OCR de la etiqueta mientras sigue en el encuadre. */
  const captureLabelFields = useCallback(async () => {
    setOcrReading(true);
    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.85,
        shutterSound: false,
      });
      if (!photo?.uri) return { address: null as string | null, clientName: null as string | null };
      return await recognizeLabelFromPhoto(photo.uri);
    } catch (err) {
      console.warn('[ocr] capture failed:', err);
      return { address: null as string | null, clientName: null as string | null };
    } finally {
      setOcrReading(false);
    }
  }, []);

  const savePersonal = useCallback(
    async (code: string, location?: { lat: number; lng: number }) => {
      if (!token) throw new Error('Sesión inválida');

      setLastResult(`Leyendo dirección de la etiqueta…\n#${formatScanCodeLabel(code)}`);
      const ocrFields = await captureLabelFields();

      let entry = await api.createDriverScanEntry(token, code, {
        lat: location?.lat,
        lng: location?.lng,
        address: ocrFields.address ?? undefined,
        clientName: ocrFields.clientName ?? undefined,
      });

      // Por si el alta no persistió la dirección del OCR, la completamos.
      const resolvedAddress = entry.address?.trim() || ocrFields.address?.trim() || null;
      const resolvedName = entry.clientName?.trim() || ocrFields.clientName?.trim() || null;

      if (ocrFields.address && !entryHasAddress(entry)) {
        try {
          entry = await api.updateDriverScanEntryDetails(token, entry.id, {
            address: ocrFields.address,
            clientName: ocrFields.clientName ?? undefined,
          });
        } catch (err) {
          console.warn('[ocr] update details failed:', err);
          entry = {
            ...entry,
            address: ocrFields.address,
            clientName: ocrFields.clientName ?? entry.clientName,
          };
        }
      } else if (resolvedAddress || resolvedName) {
        entry = {
          ...entry,
          address: resolvedAddress ?? entry.address,
          clientName: resolvedName ?? entry.clientName,
        };
      }

      showPersonalResult(entry);

      // Solo pedir carga manual si no hay dirección de OCR ni del backend.
      if (!entryHasAddress(entry)) {
        setAddressDraft('');
        setPendingAddressEntry(entry);
      } else {
        setPendingAddressEntry(null);
      }
    },
    [token, captureLabelFields, showPersonalResult]
  );

  const confirmAddressFromLabel = useCallback(async () => {
    if (!token || !pendingAddressEntry) return;
    const address = addressDraft.trim();
    if (!address) {
      Alert.alert('Dirección', 'Escribí la dirección que figura en la etiqueta.');
      return;
    }
    setSavingAddress(true);
    try {
      const updated = await api.updateDriverScanEntryDetails(token, pendingAddressEntry.id, {
        address,
        clientName: pendingAddressEntry.clientName ?? undefined,
      });
      setPendingAddressEntry(null);
      setAddressDraft('');
      setLastResult(
        `Registro: ${updated.clientName?.trim() || formatScanCodeLabel(updated.scanCode)}\n${updated.address}`
      );
    } catch (err) {
      Alert.alert(
        'Dirección',
        err instanceof Error ? err.message : 'No se pudo guardar la dirección.'
      );
    } finally {
      setSavingAddress(false);
    }
  }, [token, pendingAddressEntry, addressDraft]);

  const handleScan = useCallback(
    async (scan: BarcodeScanningResult) => {
      const code = scan.data?.trim();
      if (!token || !code || busyRef.current || pendingAddressEntry || ocrReading) return;
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
          // Siempre registro personal (paquetes ajenos / control).
          await savePersonal(code, location);
        }
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
    [token, savePersonal, pendingAddressEntry, ocrReading]
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
          Posta necesita la cámara para escanear etiquetas y leer la dirección impresa.
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
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'datamatrix'] }}
        onBarcodeScanned={
          processing || pendingAddressEntry || ocrReading
            ? undefined
            : (scan) => void handleScan(scan)
        }
      />

      <Modal
        visible={Boolean(pendingAddressEntry)}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingAddressEntry(null)}
      >
        <View style={styles.addressModalBackdrop}>
          <View style={styles.addressModalCard}>
            <Text style={styles.addressModalTitle}>Dirección de la etiqueta</Text>
            <Text style={styles.addressModalHint}>
              No se pudo leer la calle automáticamente. Escribila para el registro.
            </Text>
            <TextInput
              style={styles.addressInput}
              value={addressDraft}
              onChangeText={setAddressDraft}
              placeholder="Dirección del destinatario"
              placeholderTextColor={colors.textFaint}
              autoFocus
              multiline
            />
            <View style={styles.addressModalActions}>
              <Pressable
                style={styles.addressSkipBtn}
                onPress={() => setPendingAddressEntry(null)}
                disabled={savingAddress}
              >
                <Text style={styles.addressSkipText}>Omitir</Text>
              </Pressable>
              <Pressable
                style={[styles.addressSaveBtn, savingAddress && { opacity: 0.6 }]}
                onPress={() => void confirmAddressFromLabel()}
                disabled={savingAddress}
              >
                {savingAddress ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.addressSaveText}>Guardar</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()} hitSlop={12}>
          <PostaIcon name="chevronDown" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>Registro de paquetes</Text>
        <View style={styles.closeBtn} />
      </View>

      <View style={styles.frame} pointerEvents="none">
        <View style={styles.frameBox} />
        <Text style={styles.frameHint}>
          {ocrReading ? 'Leyendo texto de la etiqueta…' : 'Apuntá al QR de la etiqueta'}
        </Text>
      </View>

      <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + spacing.lg }]}>
        {processing || ocrReading ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.statusText}>
              {ocrReading ? 'Leyendo dirección impresa…' : 'Registrando paquete…'}
            </Text>
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
            Escaneá la etiqueta: queda en tu registro del día con la dirección leída del texto.
          </Text>
        )}

        {scannedCount > 0 && !processing && !ocrReading ? (
          <Button
            label={`Listo (${scannedCount})`}
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
  addressModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  addressModalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius?.lg ?? 16,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  addressModalTitle: {
    ...typography.displayTitle(18),
    color: colors.text,
  },
  addressModalHint: {
    ...typography.body(13, colors.textFaint),
    lineHeight: 18,
  },
  addressInput: {
    marginTop: spacing.xs,
    minHeight: 72,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  addressModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  addressSkipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addressSkipText: {
    color: colors.textFaint,
    fontWeight: '600',
  },
  addressSaveBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 96,
    alignItems: 'center',
  },
  addressSaveText: {
    color: '#fff',
    fontWeight: '700',
  },
});
