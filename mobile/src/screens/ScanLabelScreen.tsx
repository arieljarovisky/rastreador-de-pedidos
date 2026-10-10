import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { SellerOption } from '../components/ui/SellerPickerSheet';
import { formatScanCodeLabel, stripAddressReference } from '../utils/scanCodeLabel';
import { parseShippingLabelOcr } from '../utils/parseShippingLabelOcr';
import { DriverScanEntry } from '../types';
import { RepartidorStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RepartidorStackParamList, 'ScanLabel'>;

type ScanAssignment =
  | { mode: 'auto' }
  | { mode: 'seller'; sellerId: string; sellerName: string };

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
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [sellersReady, setSellersReady] = useState(false);
  const [assignment, setAssignment] = useState<ScanAssignment | null>(null);
  const [chooserOpen, setChooserOpen] = useState(true);
  const lastCodeRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void api
      .getDriverScanSellers(token)
      .then((data) => {
        if (!cancelled) setSellers(data.sellers ?? []);
      })
      .catch(() => {
        if (!cancelled) setSellers([]);
      })
      .finally(() => {
        if (!cancelled) setSellersReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const showPersonalResult = useCallback((entry: DriverScanEntry) => {
    setScannedCount((n) => n + 1);
    const name = entry.clientName?.trim() || 'Sin nombre';
    const isPhoto = entry.scanCode.startsWith('FOTO-') || entry.hasPhoto;
    const code = isPhoto && entry.scanCode.startsWith('FOTO-') ? 'Foto de etiqueta' : `#${formatScanCodeLabel(entry.scanCode)}`;
    const addr = entry.address?.trim() ? `\n${stripAddressReference(entry.address.trim())}` : '';
    const seller = entry.sellerName?.trim()
      ? `\nVendedor: ${entry.sellerName.trim()}`
      : '\nAsignación automática';
    const photo = entry.hasPhoto ? '\nFoto guardada' : '';
    setLastResult(
      entry.alreadyRegistered
        ? `Ya en tu registro: ${name}\n${code}${addr}${seller}${photo}`
        : `Registro: ${name}\n${code}${addr}${seller}${photo}`
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
    async (
      code: string,
      location: { lat: number; lng: number } | undefined,
      ocrFields: { address: string | null; clientName: string | null },
      options: { sellerId?: string; assignAutomatic?: boolean; photoUri?: string }
    ) => {
      if (!token) throw new Error('Sesión inválida');

      let entry = await api.createDriverScanEntry(token, code, {
        lat: location?.lat,
        lng: location?.lng,
        address: ocrFields.address ? stripAddressReference(ocrFields.address) : undefined,
        clientName: ocrFields.clientName ?? undefined,
        sellerId: options.sellerId,
        assignAutomatic: options.assignAutomatic,
        photoUri: options.photoUri,
      });

      // Por si el alta no persistió la dirección del OCR, la completamos.
      const resolvedAddress =
        stripAddressReference(entry.address?.trim() || ocrFields.address?.trim() || '') || null;
      const resolvedName = entry.clientName?.trim() || ocrFields.clientName?.trim() || null;

      if (ocrFields.address && !entryHasAddress(entry)) {
        const cleanAddress = stripAddressReference(ocrFields.address);
        try {
          entry = await api.updateDriverScanEntryDetails(token, entry.id, {
            address: cleanAddress,
            clientName: ocrFields.clientName ?? undefined,
          });
        } catch (err) {
          console.warn('[ocr] update details failed:', err);
          entry = {
            ...entry,
            address: cleanAddress,
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

      // Mostrar siempre sin "Ref:" aunque venga viejo en DB.
      if (entry.address?.trim()) {
        entry = { ...entry, address: stripAddressReference(entry.address) };
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
    [token, showPersonalResult]
  );

  const scanOptions = useCallback(() => {
    if (!assignment || assignment.mode === 'auto') {
      return { assignAutomatic: true as const };
    }
    return { sellerId: assignment.sellerId };
  }, [assignment]);

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
      if (!token || !code || !assignment || busyRef.current || pendingAddressEntry || ocrReading) return;
      if (scan.type !== 'qr') return;
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
          setLastResult(`Leyendo dirección de la etiqueta…\n#${formatScanCodeLabel(code)}`);
          const ocr = await captureLabelFields();
          await savePersonal(code, location, ocr, scanOptions());
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
    [token, assignment, captureLabelFields, pendingAddressEntry, ocrReading, savePersonal, scanOptions]
  );

  const registerWithoutQr = useCallback(async () => {
    if (!token || !assignment || busyRef.current || pendingAddressEntry || ocrReading) return;
    busyRef.current = true;
    setProcessing(true);
    setOcrReading(true);
    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.7,
        shutterSound: false,
      });
      if (!photo?.uri) throw new Error('No se pudo sacar la foto de la etiqueta.');
      const ocr = await recognizeLabelFromPhoto(photo.uri);
      const location = await currentLocation();
      const code = `FOTO-${Date.now().toString(36)}`;
      setLastResult('Guardando foto de la etiqueta…');
      await savePersonal(code, location, ocr, { ...scanOptions(), photoUri: photo.uri });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar la foto.';
      setLastResult(null);
      Alert.alert('Etiqueta', message);
    } finally {
      setOcrReading(false);
      setProcessing(false);
      busyRef.current = false;
    }
  }, [token, assignment, pendingAddressEntry, ocrReading, savePersonal, scanOptions]);

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

  if (chooserOpen || !assignment) {
    const assignmentLabel =
      assignment?.mode === 'seller' ? assignment.sellerName : assignment?.mode === 'auto' ? 'Automático' : null;
    return (
      <View style={[styles.chooser, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.chooserHeader}>
          <Pressable onPress={() => (assignment ? setChooserOpen(false) : navigation.goBack())} hitSlop={12}>
            <Text style={styles.chooserBack}>{assignment ? 'Volver a escanear' : 'Cerrar'}</Text>
          </Pressable>
          <Text style={typography.displayTitle(22)}>Antes de escanear</Text>
          <Text style={styles.chooserLead}>
            Elegí el vendedor de estas etiquetas, o dejá que se asigne automático cuando el QR lo identifica.
          </Text>
        </View>
        <Pressable
          style={[styles.autoCard, assignment?.mode === 'auto' && styles.autoCardOn]}
          onPress={() => {
            setAssignment({ mode: 'auto' });
            setChooserOpen(false);
          }}
        >
          <Text style={styles.autoTitle}>Asignar automático</Text>
          <Text style={styles.autoHint}>
            Si el QR es de Mercado Libre y el vendedor está en la agencia, se lo asigna solo. Si no hay QR, se guarda la foto.
          </Text>
        </Pressable>
        <Text style={styles.chooserSection}>O elegí un vendedor</Text>
        {!sellersReady ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
        ) : (
          <FlatList
            data={sellers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.chooserList}
            ListEmptyComponent={
              <Text style={styles.chooserEmpty}>
                No hay vendedores. El administrador puede crearlos en la web, sin tienda online.
                Mientras tanto podés usar la asignación automática.
              </Text>
            }
            renderItem={({ item }) => {
              const selected = assignment?.mode === 'seller' && assignment.sellerId === item.id;
              return (
                <Pressable
                  style={[styles.sellerRow, selected && styles.sellerRowOn]}
                  onPress={() => {
                    setAssignment({ mode: 'seller', sellerId: item.id, sellerName: item.name });
                    setChooserOpen(false);
                  }}
                >
                  <Text style={styles.sellerName}>{item.name}</Text>
                  {selected ? <Text style={styles.sellerOn}>Elegido</Text> : null}
                </Pressable>
              );
            }}
          />
        )}
        {assignmentLabel ? (
          <Text style={styles.chooserCurrent}>Ahora: {assignmentLabel}</Text>
        ) : null}
      </View>
    );
  }

  const modeLabel = assignment.mode === 'auto' ? 'Automático' : assignment.sellerName;

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
            : (scan) => {
                if (scan.type !== 'qr') return;
                void handleScan(scan);
              }
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
        <Pressable style={styles.modeChip} onPress={() => setChooserOpen(true)}>
          <Text style={styles.modeChipText} numberOfLines={1}>
            {modeLabel}
          </Text>
        </Pressable>
        <View style={styles.closeBtn} />
      </View>

      <View style={styles.frame} pointerEvents="none">
        <View style={styles.frameBox} />
        <Text style={styles.frameHint}>
          {ocrReading ? 'Leyendo la etiqueta…' : 'QR automático. Si no hay QR, sacá la foto.'}
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
            {assignment.mode === 'auto'
              ? 'El vendedor se asigna solo si el QR lo identifica. Sin QR, usá el botón de foto.'
              : `Estas etiquetas quedan para ${assignment.sellerName}.`}
          </Text>
        )}

        <Pressable
          style={[styles.shutter, (processing || ocrReading) && { opacity: 0.5 }]}
          disabled={processing || ocrReading}
          onPress={() => void registerWithoutQr()}
        >
          <Text style={styles.shutterText}>Foto si no hay QR</Text>
        </Pressable>

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
  chooser: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  chooserHeader: { gap: spacing.sm, marginBottom: spacing.lg },
  chooserBack: { color: colors.accent, fontWeight: '700', marginBottom: spacing.sm },
  chooserLead: { color: colors.textFaint, fontSize: 14, lineHeight: 20 },
  autoCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius?.lg ?? 16,
    padding: spacing.md,
    gap: 4,
  },
  autoCardOn: { borderColor: colors.accent },
  autoTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  autoHint: { color: colors.textFaint, fontSize: 13, lineHeight: 18 },
  chooserSection: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  chooserList: { paddingBottom: spacing.xl },
  chooserEmpty: { color: colors.textFaint, fontSize: 14, lineHeight: 20, paddingVertical: spacing.lg },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  sellerRowOn: { borderWidth: 1, borderColor: colors.accent },
  sellerName: { color: colors.text, fontSize: 16, fontWeight: '600', flex: 1 },
  sellerOn: { color: colors.accent, fontWeight: '700', fontSize: 12 },
  chooserCurrent: { color: colors.textFaint, textAlign: 'center', marginTop: spacing.sm },
  modeChip: {
    maxWidth: 220,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  modeChipText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  shutter: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  shutterText: { color: '#fff', fontWeight: '700', fontSize: 15 },
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
