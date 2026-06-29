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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAgencyOrdersContext } from '../../context/AgencyOrdersContext';
import { AgencyStackParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme';
import Button from '../../components/Button';

type Props = NativeStackScreenProps<AgencyStackParamList, 'AgencyScan'>;
type ScanMode = 'camera' | 'manual';

export default function AgencyScanScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { sellers, scanMercadoLibreLabel } = useAgencyOrdersContext();
  const [permission, requestPermission] = useCameraPermissions();
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);

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

  const pickSeller = () => {
    if (sellers.length === 0) {
      Alert.alert('Sin vendedores', 'Creá vendedores desde la web de Posta.');
      return;
    }
    Alert.alert(
      'Vendedor',
      '¿De qué vendedor es este envío?',
      sellers.map((s) => ({
        text: s.name,
        onPress: () => setSelectedSellerId(s.id),
      }))
    );
  };

  const runImport = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed || importing || Date.now() < cooldownUntil.current) return;
      if (!selectedSellerId) {
        Alert.alert('Elegí un vendedor', 'Seleccioná el vendedor antes de escanear.');
        return;
      }

      setImporting(true);
      setStatusMessage(null);
      try {
        const result = await scanMercadoLibreLabel(trimmed, selectedSellerId);
        setStatusOk(true);
        setStatusMessage(
          result.alreadyImported
            ? `Re-escaneado: ${result.order.id} · ${result.order.clientName}`
            : `Importado: ${result.order.id} · ${result.order.clientName} (${result.sellerName})`
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
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.sellerBar}>
        <Text style={styles.sellerLabel}>Vendedor</Text>
        <Pressable onPress={pickSeller} style={styles.sellerPick}>
          <Text style={styles.sellerName}>
            {selectedSeller?.name ?? 'Seleccionar vendedor…'}
          </Text>
          <Text style={styles.sellerChevron}>▼</Text>
        </Pressable>
      </View>

      <View style={styles.modeTabs}>
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
        !permission.granted ? (
          <View style={[styles.center, { padding: spacing.xl }]}>
            <Text style={styles.permTitle}>Permiso de cámara</Text>
            <Text style={styles.permText}>
              Necesitamos acceso a la cámara para escanear etiquetas de Mercado Libre.
            </Text>
            <Button
              label="Permitir cámara"
              onPress={requestPermission}
              style={{ marginTop: spacing.lg }}
            />
          </View>
        ) : (
          <View style={styles.cameraWrap}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13'] }}
              onBarcodeScanned={importing ? undefined : handleBarcode}
            />
            {importing && (
              <View style={styles.overlay}>
                <ActivityIndicator color="#fff" size="large" />
              </View>
            )}
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
          <Text style={[styles.statusText, { color: statusOk ? colors.green : colors.red }]}>
            {statusMessage}
          </Text>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sellerBar: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  sellerLabel: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 10,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  sellerPick: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  sellerName: { color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 },
  sellerChevron: { color: colors.textMuted, fontSize: 12 },
  modeTabs: {
    flexDirection: 'row',
    margin: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  modeTab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  modeTabActive: { backgroundColor: colors.surface },
  modeTabText: { color: colors.textMuted, fontSize: 13 },
  modeTabTextActive: { color: colors.text, fontWeight: '600' },
  cameraWrap: { flex: 1, marginHorizontal: spacing.lg, borderRadius: radius.lg, overflow: 'hidden' },
  camera: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualPane: { padding: spacing.xl },
  manualLabel: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: 15,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
  },
  permTitle: { color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  permText: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 },
  statusBar: { padding: spacing.md, margin: spacing.lg, borderRadius: radius.md },
  statusText: { fontSize: 13, textAlign: 'center' },
});
