import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CompositeScreenProps } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAgencyOrdersContext } from '../../context/AgencyOrdersContext';
import { AgencyScanStackParamList, AgencyStackParamList } from '../../navigation/types';
import { colors, fonts, radius, roleAccents, spacing, typography } from '../../theme';
import { TAB_BAR_CLEARANCE } from '../../constants/layout';
import Button from '../../components/Button';
import PostaIcon from '../../components/icons/PostaIcons';
import SegmentedControl from '../../components/ui/SegmentedControl';
import SellerPickerSheet from '../../components/ui/SellerPickerSheet';

type Props = CompositeScreenProps<
  NativeStackScreenProps<AgencyScanStackParamList, 'AgencyScan'>,
  NativeStackScreenProps<AgencyStackParamList>
>;
type ScanMode = 'camera' | 'manual';

export default function AgencyScanScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const accent = roleAccents.agency;
  const { sellers, scanMercadoLibreLabel } = useAgencyOrdersContext();
  const [permission, requestPermission] = useCameraPermissions();
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!selectedSellerId && sellers[0]?.id) {
      setSelectedSellerId(sellers[0].id);
    }
  }, [sellers, selectedSellerId]);

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
      if (!selectedSellerId) {
        setPickerOpen(true);
        return;
      }

      setImporting(true);
      setStatusMessage(null);
      try {
        const result = await scanMercadoLibreLabel(trimmed, selectedSellerId);
        setStatusOk(true);
        const flexNote = result.mlFlexMessage
          ? result.mlFlexRegistered
            ? ` · ${result.mlFlexMessage}`
            : ` · Flex: ${result.mlFlexMessage}`
          : '';
        setStatusMessage(
          result.alreadyImported
            ? `Re-escaneado: ${result.order.id} · ${result.order.clientName}${flexNote}`
            : `Importado: ${result.order.id} · ${result.order.clientName} (${result.sellerName})${flexNote}`
        );
        cooldownUntil.current = Date.now() + 3500;
        setManualCode('');
        setTimeout(() => {
          navigation.replace('AgencyOrderDetail', { orderId: result.order.id });
        }, 800);
      } catch (err) {
        setStatusOk(false);
        setStatusMessage(err instanceof Error ? err.message : 'No se pudo importar el envío.');
      } finally {
        setImporting(false);
      }
    },
    [importing, navigation, scanMercadoLibreLabel, selectedSellerId]
  );

  const handleBarcode = useCallback(
    ({ data }: { data: string }) => {
      void runImport(data);
    },
    [runImport]
  );

  const selectedSeller = sellers.find((s) => s.id === selectedSellerId);

  if (!permission) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={accent} />
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

        <Pressable
          onPress={() => {
            if (sellers.length === 0) {
              Alert.alert('Sin vendedores', 'Creá vendedores desde la web de Posta.');
              return;
            }
            setPickerOpen(true);
          }}
          style={({ pressed }) => [styles.sellerPick, pressed && styles.pressed]}
        >
          <View style={styles.sellerPickLeft}>
            <View style={styles.sellerIcon}>
              <PostaIcon name="store" size={16} color={accent} />
            </View>
            <View style={styles.sellerTextWrap}>
              <Text style={styles.sellerLabel}>Vendedor</Text>
              <Text style={styles.sellerName} numberOfLines={1}>
                {selectedSeller?.name ?? 'Seleccionar vendedor…'}
              </Text>
            </View>
          </View>
          <PostaIcon name="chevronDown" size={16} color={colors.textMuted} />
        </Pressable>

        <SegmentedControl
          options={[
            { value: 'camera' as const, label: 'Cámara', icon: 'camera' },
            { value: 'manual' as const, label: 'Manual', icon: 'tag' },
          ]}
          value={mode}
          onChange={setMode}
          accentColor={accent}
          style={styles.segmented}
        />
      </View>

      {mode === 'camera' ? (
        !permission.granted ? (
          <View style={[styles.center, styles.permPane]}>
            <View style={styles.permIcon}>
              <PostaIcon name="camera" size={32} color={accent} />
            </View>
            <Text style={styles.permTitle}>Permiso de cámara</Text>
            <Text style={styles.permText}>
              Necesitamos acceso a la cámara para escanear etiquetas de Mercado Libre.
            </Text>
            <Button label="Permitir cámara" onPress={requestPermission} style={{ marginTop: spacing.lg }} />
          </View>
        ) : (
          <View style={styles.cameraWrap}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13'] }}
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
                  <Text style={styles.importingText}>Importando…</Text>
                </View>
              ) : null}
            </View>
          </View>
        )
      ) : (
        <ScrollView contentContainerStyle={styles.manualPane} keyboardShouldPersistTaps="handled">
          <Text style={styles.manualLabel}>Código de etiqueta ML Flex</Text>
          <TextInput
            value={manualCode}
            onChangeText={setManualCode}
            placeholder="Pegá o escribí el código"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Button
            label={importing ? 'Importando…' : 'Importar envío'}
            onPress={() => void runImport(manualCode)}
            loading={importing}
            disabled={!manualCode.trim()}
          />
        </ScrollView>
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

      <Text style={[styles.footerNote, { paddingBottom: TAB_BAR_CLEARANCE + spacing.md }]}>
        Cada escaneo queda registrado en la bitácora del pedido.
      </Text>

      <SellerPickerSheet
        visible={pickerOpen}
        sellers={sellers}
        selectedId={selectedSellerId}
        onSelect={setSelectedSellerId}
        onClose={() => setPickerOpen(false)}
      />
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
  },
  screenTitle: {
    ...typography.displaySection(18, colors.text),
    marginBottom: spacing.md,
  },
  sellerPick: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    marginBottom: spacing.md,
  },
  sellerPickLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sellerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.accentBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerTextWrap: { flex: 1 },
  sellerLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sellerName: {
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.bodySemiBold,
    marginTop: 2,
  },
  segmented: { marginTop: 0 },
  pressed: { opacity: 0.88 },
  cameraWrap: {
    flex: 1,
    margin: spacing.lg,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#000',
    minHeight: 280,
  },
  camera: { flex: 1 },
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
  manualPane: { padding: spacing.xl, gap: spacing.md },
  manualLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: 16,
    backgroundColor: colors.surface,
    minHeight: 50,
  },
  permPane: { padding: spacing.xl },
  permIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  permTitle: { ...typography.displaySection(18, colors.text), textAlign: 'center' },
  permText: { ...typography.body(14, colors.textMuted), textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  statusText: { flex: 1, fontSize: 13, lineHeight: 18 },
  footerNote: {
    color: colors.textFaint,
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
});
