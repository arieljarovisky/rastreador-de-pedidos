import React, { useState } from 'react';
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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const insets = useSafeAreaInsets();

  const handleSubmit = async () => {
    if (!username.trim() || !password) return;
    if (mode === 'register' && !name.trim()) return;
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(username.trim(), password);
      } else {
        await registerSeller({
          username: username.trim(),
          password,
          name: name.trim(),
          city: city.trim() || undefined,
          province: province.trim() || undefined,
        });
      }
    } catch {
      // el error se muestra desde el contexto
    } finally {
      setSubmitting(false);
    }
  };

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
              onPress={() => setMode('login')}
            >
              <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Ingresar</Text>
            </Pressable>
            <Pressable
              style={[styles.tab, mode === 'register' && styles.tabActive]}
              onPress={() => setMode('register')}
            >
              <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>Vendedor</Text>
            </Pressable>
          </View>

          <Text style={typography.displaySection(14, paper.ink)}>
            {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta de vendedor'}
          </Text>
          <MonoLabel color={paper.muted} style={styles.accessLabel}>
            {mode === 'login' ? 'Acceso operadores' : 'Registro independiente'}
          </MonoLabel>

          <Text style={[typography.body(12, paper.muted), styles.hintInForm]}>
            {mode === 'login'
              ? 'Agencia, vendedor o repartidor: usá tus credenciales.'
              : 'Registrate, conectá tu ecommerce y elegí la agencia que enviará tus pedidos.'}
          </Text>

          {mode === 'register' && (
            <>
              <MonoLabel color={paper.muted} style={styles.fieldLabel}>
                Nombre / tienda *
              </MonoLabel>
              <PostaInput
                variant="paper"
                value={name}
                onChangeText={setName}
                placeholder="Ej: Mi Tienda Online"
              />
            </>
          )}

          <MonoLabel color={paper.muted} style={[styles.fieldLabel, { marginTop: spacing.lg }]}>
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
            onSubmitEditing={handleSubmit}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label={mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
            onPress={handleSubmit}
            loading={submitting || loading}
            disabled={!username.trim() || !password || (mode === 'register' && !name.trim())}
            paperTheme
            style={{ marginTop: spacing.xl }}
          />
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
  accessLabel: { marginTop: 4, marginBottom: spacing.md },
  hintInForm: { lineHeight: 18, marginBottom: spacing.lg },
  fieldLabel: { marginBottom: spacing.sm },
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
