import React, { useMemo, useState } from 'react';
import {
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
  SELLER_REGISTER_STEPS,
  type SellerMonthlyOrders,
} from '../config/sellerRegistration';
import { paper, spacing, typography } from '../theme';
import Button from '../components/Button';
import PostaLogo from '../components/PostaLogo';
import PaperCard from '../components/ui/PaperCard';
import MonoLabel from '../components/ui/MonoLabel';
import PostaInput from '../components/ui/PostaInput';

type AuthMode = 'login' | 'register';

export default function LoginScreen() {
  const { login, registerSeller, error, loading } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [registerStep, setRegisterStep] = useState(1);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [monthlyOrders, setMonthlyOrders] = useState<SellerMonthlyOrders | ''>('');
  const [sellerCategories, setSellerCategories] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const insets = useSafeAreaInsets();

  const resetRegister = () => {
    setRegisterStep(1);
    setName('');
    setCity('');
    setProvince('');
    setMonthlyOrders('');
    setSellerCategories([]);
    setUsername('');
    setPassword('');
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    if (next === 'login') {
      setUsername('');
      setPassword('');
    } else {
      resetRegister();
    }
  };

  const canAdvance = (): boolean => {
    if (mode === 'login') return Boolean(username.trim() && password);
    if (registerStep === 1) return Boolean(name.trim());
    if (registerStep === 2) return Boolean(monthlyOrders) && sellerCategories.length > 0;
    return Boolean(username.trim() && password);
  };

  const handlePrimary = async () => {
    if (!canAdvance()) return;
    if (mode === 'login') {
      setSubmitting(true);
      try {
        await login(username.trim(), password);
      } catch {
        // error from context
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (registerStep < 3) {
      setRegisterStep((s) => s + 1);
      return;
    }
    if (!monthlyOrders) return;
    setSubmitting(true);
    try {
      await registerSeller({
        username: username.trim(),
        password,
        name: name.trim(),
        city: city.trim() || undefined,
        province: province.trim() || undefined,
        monthlyOrders,
        sellerCategories,
      });
    } catch {
      // error from context
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCategory = (category: string) => {
    setSellerCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const primaryLabel = useMemo(() => {
    if (mode === 'login') return 'Ingresar';
    if (registerStep < 3) return 'Continuar';
    return 'Crear cuenta';
  }, [mode, registerStep]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <PostaLogo size={44} variant="paper" />
          <MonoLabel color={paper.muted} style={styles.tagline}>
            Marketplace de envíos · Argentina
          </MonoLabel>
        </View>

        <PaperCard style={styles.form}>
          <View style={styles.tabs}>
            <Pressable
              style={[styles.tab, mode === 'login' && styles.tabActive]}
              onPress={() => switchMode('login')}
            >
              <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Ingresar</Text>
            </Pressable>
            <Pressable
              style={[styles.tab, mode === 'register' && styles.tabActive]}
              onPress={() => switchMode('register')}
            >
              <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>Vendedor</Text>
            </Pressable>
          </View>

          {mode === 'register' && (
            <View style={styles.stepsRow}>
              {SELLER_REGISTER_STEPS.map((label, i) => {
                const step = i + 1;
                const active = registerStep === step;
                const done = registerStep > step;
                return (
                  <View key={label} style={styles.stepItem}>
                    <View style={[styles.stepDot, active && styles.stepDotActive, done && styles.stepDotDone]}>
                      <Text style={[styles.stepDotText, (active || done) && styles.stepDotTextActive]}>
                        {done ? '✓' : step}
                      </Text>
                    </View>
                    <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{label}</Text>
                  </View>
                );
              })}
            </View>
          )}

          <Text style={typography.displaySection(14, paper.ink)}>
            {mode === 'login'
              ? 'Iniciar sesión'
              : registerStep === 1
                ? 'Datos de tu tienda'
                : registerStep === 2
                  ? 'Volumen y categorías'
                  : 'Usuario y contraseña'}
          </Text>

          {mode === 'login' ? (
            <>
              <MonoLabel color={paper.muted} style={styles.fieldLabel}>
                Usuario
              </MonoLabel>
              <PostaInput
                variant="paper"
                value={username}
                onChangeText={setUsername}
                placeholder="Ej: mitienda"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <MonoLabel color={paper.muted} style={[styles.fieldLabel, { marginTop: spacing.lg }]}>
                Contraseña
              </MonoLabel>
              <PostaInput
                variant="paper"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
                onSubmitEditing={handlePrimary}
              />
            </>
          ) : registerStep === 1 ? (
            <>
              <MonoLabel color={paper.muted} style={styles.fieldLabel}>
                Nombre / tienda *
              </MonoLabel>
              <PostaInput variant="paper" value={name} onChangeText={setName} placeholder="Ej: Mi Tienda Online" />
              <MonoLabel color={paper.muted} style={[styles.fieldLabel, { marginTop: spacing.lg }]}>
                Ciudad (opcional)
              </MonoLabel>
              <PostaInput variant="paper" value={city} onChangeText={setCity} placeholder="Ej: Córdoba" />
              <MonoLabel color={paper.muted} style={[styles.fieldLabel, { marginTop: spacing.lg }]}>
                Provincia (opcional)
              </MonoLabel>
              <PostaInput variant="paper" value={province} onChangeText={setProvince} placeholder="Ej: Córdoba" />
            </>
          ) : registerStep === 2 ? (
            <>
              <MonoLabel color={paper.muted} style={styles.fieldLabel}>
                Pedidos por mes *
              </MonoLabel>
              <View style={styles.chipsWrap}>
                {SELLER_MONTHLY_ORDER_OPTIONS.map((opt) => {
                  const selected = monthlyOrders === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setMonthlyOrders(opt.value)}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <MonoLabel color={paper.muted} style={[styles.fieldLabel, { marginTop: spacing.lg }]}>
                Categorías Mercado Libre * ({sellerCategories.length})
              </MonoLabel>
              <View style={styles.categoriesBox}>
                {ML_SELLER_CATEGORIES.map((cat) => {
                  const checked = sellerCategories.includes(cat);
                  return (
                    <Pressable
                      key={cat}
                      style={[styles.categoryRow, checked && styles.categoryRowSelected]}
                      onPress={() => toggleCategory(cat)}
                    >
                      <Text style={[styles.categoryText, checked && styles.categoryTextSelected]}>{cat}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : (
            <>
              <MonoLabel color={paper.muted} style={styles.fieldLabel}>
                Usuario
              </MonoLabel>
              <PostaInput
                variant="paper"
                value={username}
                onChangeText={setUsername}
                placeholder="Ej: mitienda"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <MonoLabel color={paper.muted} style={[styles.fieldLabel, { marginTop: spacing.lg }]}>
                Contraseña
              </MonoLabel>
              <PostaInput
                variant="paper"
                value={password}
                onChangeText={setPassword}
                placeholder="Mínimo 6 caracteres"
                secureTextEntry
                onSubmitEditing={handlePrimary}
              />
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actionsRow}>
            {mode === 'register' && registerStep > 1 && (
              <Button
                label="Atrás"
                variant="ghost"
                onPress={() => setRegisterStep((s) => s - 1)}
                style={{ flex: 1 }}
              />
            )}
            <Button
              label={primaryLabel}
              onPress={handlePrimary}
              loading={submitting || loading}
              disabled={!canAdvance()}
              paperTheme
              style={{ flex: 2, marginTop: spacing.xl }}
            />
          </View>
        </PaperCard>

        <Text style={[typography.body(12, paper.faint), styles.footerHint]}>
          App móvil Posta para vendedores y repartidores.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: paper.bg },
  container: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
  },
  brand: { alignItems: 'center', marginBottom: 28, gap: 8 },
  tagline: { marginTop: 4 },
  form: {
    padding: spacing.xl,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: paper.panel2,
    borderRadius: 6,
    padding: 2,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 4,
  },
  tabActive: {
    backgroundColor: paper.panel,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '700',
    color: paper.muted,
    textTransform: 'uppercase',
  },
  tabTextActive: {
    color: paper.ink,
  },
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  stepItem: { alignItems: 'center', flex: 1 },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: paper.edge,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepDotActive: { borderColor: paper.accent, backgroundColor: paper.accentBg },
  stepDotDone: { borderColor: paper.accent, backgroundColor: paper.accent },
  stepDotText: { fontSize: 11, fontWeight: '700', color: paper.muted },
  stepDotTextActive: { color: paper.accent },
  stepLabel: { fontSize: 9, color: paper.faint, textTransform: 'uppercase', fontWeight: '700' },
  stepLabelActive: { color: paper.accent },
  fieldLabel: { marginBottom: spacing.sm },
  chipsWrap: { gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: paper.edge,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: paper.panel2,
  },
  chipSelected: {
    borderColor: paper.accent,
    backgroundColor: paper.accentBg,
  },
  chipText: { fontSize: 13, color: paper.muted },
  chipTextSelected: { color: paper.ink, fontWeight: '600' },
  categoriesBox: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: paper.edge,
    borderRadius: 8,
    overflow: 'hidden',
  },
  categoryRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: paper.edge,
  },
  categoryRowSelected: { backgroundColor: paper.accentBg },
  categoryText: { fontSize: 12, color: paper.muted },
  categoryTextSelected: { color: paper.ink, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-end' },
  error: {
    color: paper.danger,
    fontSize: 13,
    marginTop: spacing.lg,
    lineHeight: 18,
  },
  footerHint: {
    textAlign: 'center',
    marginTop: spacing.xl,
    lineHeight: 18,
  },
});
