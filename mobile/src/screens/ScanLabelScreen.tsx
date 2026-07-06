import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CompositeScreenProps } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOrdersContext } from '../context/OrdersContext';
import { ApiError } from '../api';
import { RepartidorScanStackParamList, RepartidorStackParamList } from '../navigation/types';
import { colors, fonts, radius, roleAccents, spacing, typography } from '../theme';
import { TAB_BAR_CLEARANCE } from '../constants/layout';
import Button from '../components/Button';
import PostaIcon from '../components/icons/PostaIcons';
import SegmentedControl from '../components/ui/SegmentedControl';

type Props = CompositeScreenProps<
  NativeStackScreenProps<RepartidorScanStackParamList, 'ScanLabel'>,
  NativeStackScreenProps<RepartidorStackParamList>
>;

type ScanMode = 'camera' | 'manual';

export default function ScanLabelScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const accent = roleAccents.repartidor;
  const { scanMercadoLibreLabel } = useOrdersContext();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<ScanMode>('camera');
  const [manualCode, setManualCode] = useState('');
  const [importing, setImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState(true);
  const [scanCount, setScanCount] = useState(0);
  const cooldownUntil = useRef(0);

  const finishScanning = useCallback(() => {
    const tabNav = navigation.getParent();
    tabNav?.navigate('Home', {
      screen: 'Orders',
      params: { fromScanSession: true },
    });
  }, [navigation]);

  const runImport = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed || importing || Date.now() < cooldownUntil.current) return;

      setImporting(true);
      setStatusMessage(null);
      try {
        const result = await scanMercadoLibreLabel(trimmed);
        setStatusOk(true);
        setScanCount((n) => n + 1);
        const locNote = result.order.history?.some((h) => h.lat != null) ? ' · ubicación registrada' : '';
        const flexNote = result.mlFlexMessage
          ? result.mlFlexRegistered
            ? ` · ${result.mlFlexMessage}`
            : ` · Flex: ${result.mlFlexMessage}`
          : '';
        setStatusMessage(
          result.alreadyImported
            ? `Re-escaneado: ${result.order.id} · ${result.order.clientName}${locNote}${flexNote}`
            : `Importado y asignado: ${result.order.id} · ${result.order.clientName} (${result.sellerName})${locNote}${flexNote}`
        );
        cooldownUntil.current = Date.now() + 3500;
        setManualCode('');
      } catch (err) {
        setStatusOk(false);
        if (err instanceof ApiError && err.code === 'SESSION_INVALID') {
          setStatusMessage('Tu sesión expiró. Cerrá sesión e ingresá de nuevo.');
        } else {
          setStatusMessage(err instanceof Error ? err.message : 'No se pudo importar el envío.');
        }
      } finally {
        setImporting(false);
      }
    },
    [importing, scanMercadoLibreLabel]
  );

  const handleBarcode = useCallback(
    ({ data }: { data: string }) => {
      void runImport(data);
    },
    [runImport]
  );

  if (!permission) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={accent} />
      </View>
    );
  }

  if (!permission.granted && mode === 'camera') {
    return (
      <View style={[styles.container, styles.center, styles.permPane, { paddingTop: insets.top }]}>
        <View style={[styles.permIcon, { backgroundColor: `${accent}18` }]}>
          <PostaIcon name="camera" size={32} color={accent} />
        </View>
        <Text style={styles.permTitle}>Permiso de cámara</Text>
        <Text style={styles.permText}>
          Necesitamos acceso a la cámara para escanear etiquetas de Mercado Libre.
        </Text>
        <Button label="Permitir cámara" onPress={requestPermission} style={{ marginTop: spacing.lg }} />
        <Button
          label="Ingresar código manual"
          variant="ghost"
          onPress={() => setMode('manual')}
          style={{ marginTop: spacing.md }}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.screenTitle}>Escanear etiqueta</Text>
        <Text style={styles.screenSub}>Importá envíos ML Flex al instante</Text>
        <SegmentedControl
          options={[
            { value: 'camera' as const, label: 'Cámara', icon: 'camera' },
            { value: 'manual' as const, label: 'Manual', icon: 'tag' },
          ]}
          value={mode}
          onChange={setMode}
          accentColor={accent}
        />
      </View>

      {mode === 'camera' ? (
        <View style={styles.cameraWrap}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['code128', 'code39', 'ean13', 'qr'],
            }}
            onBarcodeScanned={importing ? undefined : handleBarcode}
          />
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.cornerTL, { borderColor: accent }]} />
            <View style={[styles.corner, styles.cornerTR, { borderColor: accent }]} />
            <View style={[styles.corner, styles.cornerBL, { borderColor: accent }]} />
            <View style={[styles.corner, styles.cornerBR, { borderColor: accent }]} />
          </View>
          <View style={styles.cameraOverlay}>
            <Text style={styles.hint}>Apuntá al código de la etiqueta Flex</Text>
            {importing ? (
              <View style={styles.importingRow}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.importingText}>Procesando…</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.manualBox}>
          <Text style={styles.manualLabel}>Código de la etiqueta</Text>
          <TextInput
            value={manualCode}
            onChangeText={setManualCode}
            placeholder="Pegá o escribí el código"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
            editable={!importing}
          />
          <Button
            label={importing ? 'Procesando…' : 'Importar envío'}
            onPress={() => void runImport(manualCode)}
            loading={importing}
            disabled={!manualCode.trim()}
          />
        </View>
      )}

      {statusMessage ? (
        <View
          style={[
            styles.statusBar,
            { backgroundColor: statusOk ? colors.greenBg : colors.redBg },
          ]}
        >
          <PostaIcon
            name={statusOk ? 'checkCircle' : 'circle'}
            size={16}
            color={statusOk ? colors.green : colors.red}
          />
          <Text style={[styles.statusText, { color: statusOk ? colors.green : colors.red }]}>
            {statusMessage}
          </Text>
        </View>
      ) : null}

      <View style={[styles.finishBar, { paddingBottom: TAB_BAR_CLEARANCE + spacing.sm }]}>
        {scanCount > 0 ? (
          <Text style={styles.scanCount}>
            {scanCount} paquete{scanCount === 1 ? '' : 's'} escaneado{scanCount === 1 ? '' : 's'}
          </Text>
        ) : (
          <Text style={styles.finishHint}>Escaneá todas las etiquetas y tocá terminar cuando listo.</Text>
        )}
        <Button
          label={scanCount > 0 ? 'Terminar escaneo' : 'Ver mis envíos'}
          onPress={finishScanning}
          disabled={importing}
          style={styles.finishBtn}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const FRAME = 220;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  screenTitle: { ...typography.displaySection(18, colors.text) },
  screenSub: { ...typography.body(13, colors.textMuted), marginBottom: spacing.xs },
  cameraWrap: {
    flex: 1,
    margin: spacing.lg,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#000',
    minHeight: 280,
  },
  scanFrame: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderWidth: 3,
  },
  cornerTL: { top: '50%', left: '50%', marginTop: -FRAME / 2, marginLeft: -FRAME / 2, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 8 },
  cornerTR: { top: '50%', right: '50%', marginTop: -FRAME / 2, marginRight: -FRAME / 2, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 8 },
  cornerBL: { bottom: '50%', left: '50%', marginBottom: -FRAME / 2, marginLeft: -FRAME / 2, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: '50%', right: '50%', marginBottom: -FRAME / 2, marginRight: -FRAME / 2, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 8 },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  hint: {
    color: '#fff',
    fontSize: 14,
    fontFamily: fonts.bodySemiBold,
    textAlign: 'center',
  },
  importingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.md,
  },
  importingText: { color: '#fff', fontSize: 13 },
  manualBox: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.md,
  },
  manualLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    minHeight: 50,
    color: colors.text,
    fontSize: 16,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  statusText: { flex: 1, fontSize: 13, lineHeight: 18 },
  finishBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  scanCount: {
    ...typography.body(13, colors.text),
    textAlign: 'center',
    fontFamily: fonts.bodySemiBold,
  },
  finishHint: {
    ...typography.body(12, colors.textMuted),
    textAlign: 'center',
    lineHeight: 17,
  },
  finishBtn: { width: '100%' },
  permPane: { padding: spacing.xl },
  permIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  permTitle: { ...typography.displaySection(18, colors.text), textAlign: 'center', marginBottom: spacing.sm },
  permText: { ...typography.body(14, colors.textMuted), textAlign: 'center', lineHeight: 20 },
});
