import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOrdersContext } from '../context/OrdersContext';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme';
import Button from '../components/Button';

type Props = NativeStackScreenProps<RootStackParamList, 'ScanLabel'>;

type ScanMode = 'camera' | 'manual';

export default function ScanLabelScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { scanMercadoLibreLabel } = useOrdersContext();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<ScanMode>('camera');
  const [manualCode, setManualCode] = useState('');
  const [importing, setImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState(true);
  const cooldownUntil = useRef(0);

  const runImport = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed || importing || Date.now() < cooldownUntil.current) return;

      setImporting(true);
      setStatusMessage(null);
      try {
        const result = await scanMercadoLibreLabel(trimmed);
        setStatusOk(true);
        const locNote = result.order.history?.some((h) => h.lat != null) ? ' · ubicación registrada' : '';
        const flexNote = result.mlFlexMessage
          ? result.mlFlexRegistered
            ? ` · ${result.mlFlexMessage}`
            : ` · Flex: ${result.mlFlexMessage}`
          : '';
        setStatusMessage(
          result.alreadyImported
            ? `Re-escaneado: ${result.order.id} · ${result.order.clientName}${locNote}${flexNote}`
            : `Importado: ${result.order.id} · ${result.order.clientName} (${result.sellerName})${locNote}${flexNote}`
        );
        cooldownUntil.current = Date.now() + 3500;
        setManualCode('');
        setTimeout(() => {
          navigation.replace('OrderDetail', { orderId: result.order.id });
        }, 800);
      } catch (err) {
        setStatusOk(false);
        setStatusMessage(err instanceof Error ? err.message : 'No se pudo importar el envío.');
      } finally {
        setImporting(false);
      }
    },
    [importing, navigation, scanMercadoLibreLabel]
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
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!permission.granted && mode === 'camera') {
    return (
      <View style={[styles.container, styles.center, { padding: spacing.xl }]}>
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
      <View style={[styles.modeTabs, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => setMode('camera')}
          style={[styles.modeTab, mode === 'camera' && styles.modeTabActive]}
        >
          <Text style={[styles.modeTabText, mode === 'camera' && styles.modeTabTextActive]}>
            Cámara
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setMode('manual')}
          style={[styles.modeTab, mode === 'manual' && styles.modeTabActive]}
        >
          <Text style={[styles.modeTabText, mode === 'manual' && styles.modeTabTextActive]}>
            Manual
          </Text>
        </Pressable>
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
          <View style={styles.cameraOverlay}>
            <Text style={styles.hint}>Apuntá al código de la etiqueta Flex</Text>
            {importing && (
              <View style={styles.importingRow}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.importingText}>Procesando…</Text>
              </View>
            )}
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
          <Text style={[styles.statusText, { color: statusOk ? colors.green : colors.red }]}>
            {statusMessage}
          </Text>
        </View>
      ) : null}

      <Text style={[styles.footerNote, { paddingBottom: insets.bottom + spacing.md }]}>
        Cada escaneo queda en la bitácora del pedido con tu nombre y ubicación.
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  modeTabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  modeTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeTabActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentBg,
  },
  modeTabText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  modeTabTextActive: { color: colors.accent },
  cameraWrap: {
    flex: 1,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    minHeight: 280,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  hint: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 50,
    color: colors.text,
    fontSize: 16,
  },
  statusBar: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  statusText: { fontSize: 13, lineHeight: 18 },
  footerNote: {
    color: colors.textFaint,
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
  permTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  permText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
