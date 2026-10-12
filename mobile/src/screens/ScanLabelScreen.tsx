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

type LabelFields = {
  address: string | null;
  clientName: string | null;
  clientPhone?: string | null;
};

function addressLooksUsable(address: string | null | undefined): boolean {
  const text = address?.trim() ?? '';
  return text.length >= 6 && /\d/.test(text);
}

function pickLabelFields(local: LabelFields, ai: LabelFields | null): LabelFields {
  if (!ai) return local;
  const aiAddress = ai.address?.trim() || null;
  const localAddress = local.address?.trim() || null;
  return {
    address: addressLooksUsable(aiAddress)
      ? aiAddress
      : addressLooksUsable(localAddress)
        ? localAddress
        : aiAddress || localAddress,
    clientName: ai.clientName?.trim() || local.clientName,
    clientPhone: ai.clientPhone?.trim() || local.clientPhone || null,
  };
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
  const [capturing, setCapturing] = useState(false);
  const [inFlight, setInFlight] = useState(0);
  const [capturePhase, setCapturePhase] = useState<'idle' | 'photo'>('idle');
  const [captureMode, setCaptureMode] = useState(false);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [sellersReady, setSellersReady] = useState(false);
  const [assignment, setAssignment] = useState<ScanAssignment | null>(null);
  const [chooserOpen, setChooserOpen] = useState(true);
  const lastCodeRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const capturingRef = useRef(false);
  const pendingRef = useRef<DriverScanEntry | null>(null);
  const addressQueueRef = useRef<DriverScanEntry[]>([]);
  const jobQueueRef = useRef<Array<() => Promise<void>>>([]);
  const runningRef = useRef(0);
  const inFlightRef = useRef(0);
  const promoteRef = useRef<() => void>(() => {});
  const drainRef = useRef<() => void>(() => {});
  const cameraRef = useRef<CameraView>(null);
  const captureWaiter = useRef<{
    resolve: (uri: string) => void;
    reject: (err: Error) => void;
  } | null>(null);

  useEffect(() => {
    if (!captureMode || !captureWaiter.current) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const waiter = captureWaiter.current;
        if (!waiter || cancelled) return;
        const shoot = async () => {
          const photo = await cameraRef.current?.takePictureAsync({
            quality: 0.55,
            skipProcessing: true,
          });
          if (!photo?.uri) throw new Error('NO_PHOTO');
          return photo.uri;
        };
        try {
          waiter.resolve(await shoot());
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 600));
          if (cancelled || captureWaiter.current !== waiter) return;
          try {
            waiter.resolve(await shoot());
          } catch {
            waiter.reject(
              new Error('No se pudo sacar la foto. Alejá un poco el celular e intentá de nuevo.')
            );
          }
        } finally {
          if (captureWaiter.current === waiter) captureWaiter.current = null;
          setCaptureMode(false);
        }
      })();
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [captureMode]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const syncInFlight = useCallback(() => {
    const pending = runningRef.current + jobQueueRef.current.length;
    inFlightRef.current = pending;
    if (mountedRef.current) setInFlight(pending);
    return pending;
  }, []);

  const takeStill = useCallback(
    () =>
      new Promise<string>((resolve, reject) => {
        captureWaiter.current = { resolve, reject };
        setCapturePhase('photo');
        setCaptureMode(true);
      }),
    []
  );

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
    if (!mountedRef.current) return;
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

  promoteRef.current = () => {
    if (!mountedRef.current || pendingRef.current || capturingRef.current || inFlightRef.current > 0) {
      return;
    }
    const next = addressQueueRef.current.shift();
    if (!next) return;
    pendingRef.current = next;
    setAddressDraft('');
    setPendingAddressEntry(next);
  };

  drainRef.current = () => {
    while (runningRef.current < 2 && jobQueueRef.current.length > 0) {
      const job = jobQueueRef.current.shift();
      if (!job) break;
      runningRef.current += 1;
      syncInFlight();
      void job()
        .catch((err) => {
          console.warn('[label-job]', err);
          if (!mountedRef.current) return;
          const message = err instanceof Error ? err.message : 'No se pudo registrar la etiqueta.';
          Alert.alert('Etiqueta', message);
        })
        .finally(() => {
          runningRef.current = Math.max(0, runningRef.current - 1);
          const left = syncInFlight();
          if (left === 0) promoteRef.current();
          else drainRef.current();
        });
    }
  };

  const enqueueLabelJob = useCallback(
    (job: () => Promise<void>) => {
      jobQueueRef.current.push(job);
      syncInFlight();
      drainRef.current();
    },
    [syncInFlight]
  );

  const releaseAddressPrompt = useCallback(() => {
    pendingRef.current = null;
    setPendingAddressEntry(null);
    setAddressDraft('');
    promoteRef.current();
  }, []);

  /** OCR local y, si no alcanza, la IA. No toca la cámara. */
  const readLabelFields = useCallback(
    async (uri: string): Promise<LabelFields> => {
      const local = await recognizeLabelFromPhoto(uri);
      if (addressLooksUsable(local.address) || !token) return local;
      try {
        const ai = await api.readShippingLabel(token, uri);
        return pickLabelFields(local, ai);
      } catch (err) {
        console.warn('[label-ai] lectura falló:', err);
        return local;
      }
    },
    [token]
  );

  const savePersonal = useCallback(
    async (
      code: string,
      location: { lat: number; lng: number } | undefined,
      ocrFields: LabelFields,
      options: {
        sellerId?: string;
        assignAutomatic?: boolean;
        photoUri?: string;
        deferAddressPrompt?: boolean;
      }
    ) => {
      if (!token) throw new Error('Sesión inválida');

      let entry = await api.createDriverScanEntry(token, code, {
        lat: location?.lat,
        lng: location?.lng,
        address: ocrFields.address ? stripAddressReference(ocrFields.address) : undefined,
        clientName: ocrFields.clientName ?? undefined,
        clientPhone: ocrFields.clientPhone ?? undefined,
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
            clientPhone: ocrFields.clientPhone ?? undefined,
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

      if (!mountedRef.current) return;

      // Si el repartidor sigue sacando fotos, la dirección faltante se pide al final.
      if (!entryHasAddress(entry)) {
        if (options.deferAddressPrompt) {
          addressQueueRef.current.push(entry);
          return;
        }
        pendingRef.current = entry;
        setAddressDraft('');
        setPendingAddressEntry(entry);
        return;
      }
      if (!options.deferAddressPrompt) {
        pendingRef.current = null;
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
      releaseAddressPrompt();
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
  }, [token, pendingAddressEntry, addressDraft, releaseAddressPrompt]);

  const handleScan = useCallback(
    async (scan: BarcodeScanningResult) => {
      const code = scan.data?.trim();
      if (!token || !code || !assignment || busyRef.current || capturingRef.current || pendingRef.current) {
        return;
      }
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
          capturingRef.current = true;
          setCapturing(true);
          try {
            const uri = await takeStill();
            const options = scanOptions();
            enqueueLabelJob(async () => {
              const fields = await readLabelFields(uri);
              await savePersonal(code, location, fields, { ...options, deferAddressPrompt: true });
            });
          } finally {
            capturingRef.current = false;
            setCapturing(false);
            setCapturePhase('idle');
          }
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
        setCapturePhase('idle');
        busyRef.current = false;
        if (inFlightRef.current === 0) promoteRef.current();
      }
    },
    [token, assignment, takeStill, enqueueLabelJob, readLabelFields, savePersonal, scanOptions]
  );

  const registerWithoutQr = useCallback(async () => {
    if (!token || !assignment || capturingRef.current || pendingRef.current || busyRef.current) return;
    capturingRef.current = true;
    setCapturing(true);
    try {
      const photoUri = await takeStill();
      const shotToken = token;
      const options = scanOptions();
      enqueueLabelJob(async () => {
        try {
          const [local, ai] = await Promise.all([
            recognizeLabelFromPhoto(photoUri),
            api.readShippingLabel(shotToken, photoUri).catch((err) => {
              console.warn('[label-ai] lectura falló:', err);
              return null;
            }),
          ]);
          const fields = pickLabelFields(local, ai);
          const location = await currentLocation();
          const code = `FOTO-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          await savePersonal(code, location, fields, {
            ...options,
            photoUri,
            deferAddressPrompt: true,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'No se pudo guardar la foto.';
          if (mountedRef.current) Alert.alert('Etiqueta', message);
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar la foto.';
      Alert.alert('Etiqueta', message);
    } finally {
      capturingRef.current = false;
      setCapturing(false);
      setCapturePhase('idle');
      if (inFlightRef.current === 0) promoteRef.current();
    }
  }, [token, assignment, savePersonal, scanOptions, takeStill, enqueueLabelJob]);

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
        mode="picture"
        barcodeScannerSettings={
          captureMode ? undefined : { barcodeTypes: ['qr', 'code128', 'datamatrix'] }
        }
        onBarcodeScanned={
          captureMode || capturing || processing || pendingAddressEntry
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
        onRequestClose={() => releaseAddressPrompt()}
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
                onPress={() => releaseAddressPrompt()}
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
          {capturing
            ? 'Sacando la foto…'
            : inFlight > 0
              ? 'Podés sacar la siguiente.'
              : 'Apuntá al QR. Si no tiene, usá el botón de foto.'}
        </Text>
      </View>

      <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + spacing.lg }]} pointerEvents="box-none">
        {capturing || inFlight > 0 ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.statusText}>
              {capturing
                ? inFlight > 0
                  ? `Sacando la foto… · ${inFlight} en lectura`
                  : 'Sacando la foto…'
                : `Leyendo ${inFlight} ${inFlight === 1 ? 'etiqueta' : 'etiquetas'}…`}
            </Text>
          </View>
        ) : null}
        {lastResult ? (
          <View style={styles.statusRow}>
            <PostaIcon name="checkCircle" size={20} color={colors.green ?? '#4caf50'} />
            <Text style={styles.statusText} numberOfLines={3}>
              {lastResult}
            </Text>
          </View>
        ) : capturing || inFlight > 0 ? null : (
          <Text style={styles.statusText}>
            {assignment.mode === 'auto'
              ? 'Si no aparece un QR, tocá el botón de abajo y sacale una foto.'
              : `Sin QR, sacale una foto. Queda para ${assignment.sellerName}.`}
          </Text>
        )}

        <Pressable
          style={[styles.shutterWrap, (capturing || Boolean(pendingAddressEntry)) && { opacity: 0.5 }]}
          disabled={capturing || Boolean(pendingAddressEntry)}
          onPress={() => void registerWithoutQr()}
          accessibilityRole="button"
          accessibilityLabel="Sacar foto de la etiqueta"
        >
          <View style={styles.shutterRing}>
            <View style={styles.shutterCore}>
              <PostaIcon name="camera" size={28} color="#1a1612" />
            </View>
          </View>
          <Text style={styles.shutterText}>Sacar foto</Text>
        </Pressable>

        {scannedCount > 0 && !capturing ? (
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
    zIndex: 3,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
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
  shutterWrap: { alignItems: 'center', gap: 8, paddingVertical: 4 },
  shutterRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  shutterCore: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
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
