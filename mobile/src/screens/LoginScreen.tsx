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
import { paper, roleAccents, spacing, typography } from '../theme';
import Button from '../components/Button';
import PostaLogo from '../components/PostaLogo';
import PostaIcon from '../components/icons/PostaIcons';
import PaperCard from '../components/ui/PaperCard';
import MonoLabel from '../components/ui/MonoLabel';
import PostaInput from '../components/ui/PostaInput';

const ROLES = [
  { icon: 'motorcycle' as const, label: 'Repartidor', color: roleAccents.repartidor },
  { icon: 'store' as const, label: 'Vendedor', color: roleAccents.seller },
  { icon: 'live' as const, label: 'Logística', color: roleAccents.agency },
];

export default function LoginScreen() {
  const { login, error, errorCode, loading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const insets = useSafeAreaInsets();

  const sessionConflict = errorCode === 'SESSION_ALREADY_ACTIVE';

  const handleSubmit = async (replaceSession = false) => {
    if (!username.trim() || !password) return;
    setSubmitting(true);
    try {
      await login(username.trim(), password, replaceSession ? { replaceSession: true } : undefined);
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
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <PostaLogo size={48} variant="paper" />
          <MonoLabel color={paper.muted} style={styles.tagline}>
            Hoja de ruta · CABA y GBA
          </MonoLabel>
        </View>

        <View style={styles.roleRow}>
          {ROLES.map((role) => (
            <View key={role.label} style={styles.roleChip}>
              <View style={[styles.roleIcon, { backgroundColor: `${role.color}18` }]}>
                <PostaIcon name={role.icon} size={16} color={role.color} />
              </View>
              <Text style={styles.roleLabel}>{role.label}</Text>
            </View>
          ))}
        </View>

        <PaperCard style={styles.form}>
          <Text style={typography.displaySection(16, paper.ink)}>Iniciar sesión</Text>
          <MonoLabel color={paper.muted} style={styles.accessLabel}>
            Acceso operadores
          </MonoLabel>

          <Text style={[typography.body(12, paper.muted), styles.hintInForm]}>
            Usá las credenciales que te dio tu operador logístico. La app se adapta a tu rol
            automáticamente.
          </Text>

          <MonoLabel color={paper.muted} style={styles.fieldLabel}>
            Correo o usuario
          </MonoLabel>
          <PostaInput
            variant="paper"
            value={username}
            onChangeText={setUsername}
            placeholder="Ej: repartidor@mail.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
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
            onSubmitEditing={() => void handleSubmit()}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label="Ingresar"
            onPress={() => void handleSubmit()}
            loading={submitting || loading}
            disabled={!username.trim() || !password}
            paperTheme
            style={{ marginTop: spacing.xl }}
          />

          {sessionConflict ? (
            <Button
              label="Cerrar sesión en el otro dispositivo e ingresar"
              onPress={() => void handleSubmit(true)}
              variant="secondary"
              loading={submitting || loading}
              disabled={!username.trim() || !password}
              paperTheme
              style={{ marginTop: spacing.md }}
            />
          ) : null}
        </PaperCard>

        <Text style={[typography.body(12, paper.faint), styles.footerHint]}>
          Posta · App móvil para repartidores, vendedores y logística.
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
  brand: { alignItems: 'center', marginBottom: spacing.xl, gap: 8 },
  tagline: { marginTop: 4 },
  roleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  roleChip: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
    maxWidth: 90,
  },
  roleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: paper.edge,
  },
  roleLabel: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: paper.muted,
    textAlign: 'center',
  },
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
