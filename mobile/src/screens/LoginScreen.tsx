import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { colors, radius, spacing } from '../theme';
import Button from '../components/Button';
import PostaLogo from '../components/PostaLogo';

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
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <PostaLogo size={52} />
          <Text style={styles.subtitle}>App de Repartidores</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Usuario</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="Ej: carlos"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />

          <Text style={[styles.label, { marginTop: spacing.lg }]}>Contraseña</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.textFaint}
            secureTextEntry
            style={styles.input}
            onSubmitEditing={handleSubmit}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label="Ingresar"
            onPress={handleSubmit}
            loading={submitting || loading}
            disabled={!username.trim() || !password}
            style={{ marginTop: spacing.xl }}
          />
        </View>

        <Text style={styles.hint}>
          Iniciá sesión con la cuenta de repartidor que te dio tu agencia.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
  },
  brand: { alignItems: 'center', marginBottom: 48, gap: 6 },
  subtitle: {
    color: colors.blue,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  form: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.borderSoft,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 50,
    color: colors.text,
    fontSize: 16,
  },
  error: {
    color: colors.red,
    fontSize: 13,
    marginTop: spacing.lg,
  },
  hint: {
    color: colors.textFaint,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.xl,
    lineHeight: 18,
  },
});
