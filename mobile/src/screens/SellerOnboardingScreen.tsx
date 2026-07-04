import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import {
  ML_SELLER_CATEGORIES,
  SELLER_MONTHLY_ORDER_OPTIONS,
  type SellerMonthlyOrders,
} from '../config/sellerRegistration';
import { api } from '../api';
import AgencyMarketplaceList from '../components/AgencyMarketplaceList';
import Button from '../components/Button';
import PostaLogo from '../components/PostaLogo';
import PaperCard from '../components/ui/PaperCard';
import MonoLabel from '../components/ui/MonoLabel';
import { colors, paper, spacing, typography } from '../theme';

export default function SellerOnboardingScreen() {
  const { user, token, completeSellerProfile, updatePreferredAgency, refreshUser } = useAuth();
  const [step, setStep] = useState(1);
  const [monthlyOrders, setMonthlyOrders] = useState<SellerMonthlyOrders | ''>('');
  const [sellerCategories, setSellerCategories] = useState<string[]>([]);
  const [agencies, setAgencies] = useState<Awaited<ReturnType<typeof api.listMarketplaceAgencies>>>([]);
  const [agenciesLoading, setAgenciesLoading] = useState(true);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(null);
  const [savingAgency, setSavingAgency] = useState<string | 'clear' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!token) return;
    setAgenciesLoading(true);
    api
      .listMarketplaceAgencies(token)
      .then(setAgencies)
      .catch(() => setAgencies([]))
      .finally(() => setAgenciesLoading(false));
  }, [token]);

  const toggleCategory = (category: string) => {
    setSellerCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const finishOnboarding = useCallback(async () => {
    if (!monthlyOrders) return;
    setSubmitting(true);
    setError(null);
    try {
      await completeSellerProfile({ monthlyOrders, sellerCategories });
      if (selectedAgencyId) {
        await updatePreferredAgency(selectedAgencyId);
      }
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar el perfil.');
    } finally {
      setSubmitting(false);
    }
  }, [completeSellerProfile, monthlyOrders, refreshUser, selectedAgencyId, sellerCategories, updatePreferredAgency]);

  const handleSelectAgency = async (agencyId: string | null) => {
    setSavingAgency(agencyId ?? 'clear');
    try {
      setSelectedAgencyId(agencyId);
    } finally {
      setSavingAgency(null);
    }
  };

  const step1Valid = Boolean(monthlyOrders) && sellerCategories.length > 0;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <PostaLogo size={40} variant="paper" />
          <Text style={styles.welcome}>Hola, {user?.name ?? 'vendedor'}</Text>
          <Text style={styles.subtitle}>Completá tu perfil para empezar a despachar</Text>
        </View>

        <PaperCard style={styles.card}>
          <View style={styles.stepsRow}>
            {['Tu operación', 'Agencia'].map((label, i) => {
              const n = i + 1;
              const active = step === n;
              const done = step > n;
              return (
                <View key={label} style={styles.stepItem}>
                  <View style={[styles.stepDot, active && styles.stepDotActive, done && styles.stepDotDone]}>
                    <Text style={[styles.stepDotText, (active || done) && styles.stepDotTextActive]}>
                      {done ? '✓' : n}
                    </Text>
                  </View>
                  <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{label}</Text>
                </View>
              );
            })}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {step === 1 ? (
            <View style={styles.section}>
              <MonoLabel color={paper.muted}>¿Cuántos pedidos enviás por mes?</MonoLabel>
              <View style={styles.optionsGrid}>
                {SELLER_MONTHLY_ORDER_OPTIONS.map((opt) => {
                  const selected = monthlyOrders === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.optionChip, selected && styles.optionChipSelected]}
                      onPress={() => setMonthlyOrders(opt.value)}
                    >
                      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <MonoLabel color={paper.muted} style={styles.sectionGap}>
                Categorías de Mercado Libre ({sellerCategories.length})
              </MonoLabel>
              <View style={styles.categoriesBox}>
                {ML_SELLER_CATEGORIES.map((category) => {
                  const checked = sellerCategories.includes(category);
                  return (
                    <Pressable
                      key={category}
                      style={[styles.categoryRow, checked && styles.categoryRowSelected]}
                      onPress={() => toggleCategory(category)}
                    >
                      <Text style={[styles.categoryText, checked && styles.categoryTextSelected]}>{category}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : agenciesLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.xl }} />
          ) : (
            <View style={styles.section}>
              <Text style={styles.hint}>
                Elegí la agencia que despachará tus envíos. Podés omitir este paso y elegirla después.
              </Text>
              <AgencyMarketplaceList
                agencies={agencies}
                selectedAgencyId={selectedAgencyId}
                saving={savingAgency}
                onSelect={handleSelectAgency}
              />
            </View>
          )}

          <View style={styles.actions}>
            {step > 1 ? (
              <Button label="Atrás" variant="ghost" onPress={() => setStep(1)} disabled={submitting} paperTheme />
            ) : null}
            {step === 2 ? (
              <Button
                label="Omitir agencia"
                variant="ghost"
                onPress={() => void finishOnboarding()}
                disabled={submitting}
                paperTheme
              />
            ) : null}
            <Button
              label={step === 1 ? 'Continuar' : 'Finalizar'}
              onPress={() => {
                if (step === 1) {
                  if (step1Valid) setStep(2);
                  return;
                }
                void finishOnboarding();
              }}
              disabled={submitting || (step === 1 && !step1Valid)}
              loading={submitting}
              paperTheme
            />
          </View>
        </PaperCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { paddingHorizontal: spacing.lg },
  brand: { alignItems: 'center', marginBottom: spacing.lg, gap: spacing.xs },
  welcome: { ...typography.displaySection(16, paper.ink), marginTop: spacing.sm },
  subtitle: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  card: { padding: spacing.lg },
  stepsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg },
  stepItem: { alignItems: 'center', flex: 1 },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepDotActive: { borderColor: colors.accent, backgroundColor: colors.accentBg },
  stepDotDone: { borderColor: colors.accent, backgroundColor: colors.accent },
  stepDotText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  stepDotTextActive: { color: colors.accent },
  stepLabel: { color: colors.textFaint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  stepLabelActive: { color: colors.text },
  error: { color: colors.red, fontSize: 13, marginBottom: spacing.md },
  section: { gap: spacing.sm },
  sectionGap: { marginTop: spacing.md },
  optionsGrid: { gap: spacing.sm, marginTop: spacing.sm },
  optionChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
  },
  optionChipSelected: { borderColor: colors.accent, backgroundColor: colors.accentBg },
  optionText: { color: colors.textMuted, fontSize: 13 },
  optionTextSelected: { color: colors.text, fontWeight: '600' },
  categoriesBox: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  categoryRow: {
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    marginBottom: 4,
  },
  categoryRowSelected: { backgroundColor: colors.accentBg },
  categoryText: { color: colors.textMuted, fontSize: 12 },
  categoryTextSelected: { color: colors.text, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginBottom: spacing.sm },
  actions: { marginTop: spacing.lg, gap: spacing.sm },
});
