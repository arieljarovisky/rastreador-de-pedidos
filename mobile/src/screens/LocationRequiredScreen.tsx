import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import PostaLogo from '../components/PostaLogo';
import MonoLabel from '../components/ui/MonoLabel';
import { colors, fonts, spacing, typography } from '../theme';

interface Props {
  canAskAgain: boolean;
  onRetry: () => Promise<void>;
  onOpenSettings: () => void;
}

export default function LocationRequiredScreen({
  canAskAgain,
  onRetry,
  onOpenSettings,
}: Props) {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.brand}>
        <PostaLogo size={40} />
        <MonoLabel color={colors.textFaint}>Posta Repartidor</MonoLabel>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Ubicación obligatoria</Text>
        <Text style={styles.body}>
          Para trabajar como repartidor, Posta necesita acceso a tu ubicación{' '}
          <Text style={styles.emphasis}>todo el tiempo</Text>. Logística y tus clientes dependen
          de ese seguimiento en vivo, con o sin pedido activo.
        </Text>
        <Text style={styles.body}>
          {canAskAgain
            ? 'Concedé el permiso cuando el sistema lo solicite. En Android elegí “Permitir todo el tiempo”; en iPhone, “Siempre”.'
            : 'El permiso fue denegado. Abrí la configuración del celular, entrá a Posta y activá la ubicación en “Siempre” o “Todo el tiempo”.'}
        </Text>
      </View>

      <View style={styles.actions}>
        {canAskAgain ? (
          <Button
            label={retrying ? 'Verificando…' : 'Conceder ubicación'}
            onPress={() => void handleRetry()}
            loading={retrying}
          />
        ) : (
          <Button label="Abrir configuración" onPress={onOpenSettings} />
        )}
        {canAskAgain ? (
          <Button label="Abrir configuración" variant="ghost" onPress={onOpenSettings} />
        ) : (
          <Button
            label="Reintentar"
            variant="ghost"
            onPress={() => void handleRetry()}
            loading={retrying}
          />
        )}
        <Button label="Cerrar sesión" variant="danger" onPress={() => void logout()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    justifyContent: 'space-between',
  },
  brand: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    ...typography.displaySection(18, colors.text),
  },
  body: {
    ...typography.body(14, colors.textMuted),
    lineHeight: 21,
  },
  emphasis: {
    color: colors.amber,
    fontFamily: fonts.bodySemiBold,
  },
  actions: {
    gap: spacing.sm,
  },
});
