import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
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

export default function LoginScreen() {
  const { login, error, loading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const insets = useSafeAreaInsets();

  const handleSubmit = async () => {
    if (!username.trim() || !password) return;
    setSubmitting(true);
    try {
      await login(username.trim(), password);
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
            Hoja de ruta · CABA y GBA
          </MonoLabel>
        </View>

        <PaperCard style={styles.form}>
          <Text style={typography.displaySection(14, paper.ink)}>Iniciar sesión</Text>
          <MonoLabel color={paper.muted} style={styles.accessLabel}>
            Acceso operadores
          </MonoLabel>

          <Text style={[typography.body(12, paper.muted), styles.hintInForm]}>
            Agencia, vendedor o repartidor: usá las credenciales que te dio tu operador logístico.
          </Text>

          <MonoLabel color={paper.muted} style={styles.fieldLabel}>
            Usuario
          </MonoLabel>
          <PostaInput
            variant="paper"
            value={username}
            onChangeText={setUsername}
            placeholder="Ej: carlos"
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
            label="Ingresar"
            onPress={handleSubmit}
            loading={submitting || loading}
            disabled={!username.trim() || !password}
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
