import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PostaIcon from '../icons/PostaIcons';
import { colors, fonts, radius, spacing, typography } from '../../theme';

export interface SellerOption {
  id: string;
  name: string;
}

interface Props {
  visible: boolean;
  sellers: SellerOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export default function SellerPickerSheet({
  visible,
  sellers,
  selectedId,
  onSelect,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sellers;
    return sellers.filter((s) => s.name.toLowerCase().includes(q));
  }, [sellers, query]);

  const handleSelect = (id: string) => {
    onSelect(id);
    setQuery('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>Elegir vendedor</Text>
        <Text style={styles.subtitle}>¿De qué vendedor es este envío?</Text>

        <View style={styles.searchWrap}>
          <PostaIcon name="store" size={16} color={colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar vendedor…"
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Text style={styles.clearBtn}>×</Text>
            </Pressable>
          ) : null}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          style={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {sellers.length === 0
                ? 'No hay vendedores. Creá vendedores desde la web de Posta.'
                : 'Sin resultados para tu búsqueda.'}
            </Text>
          }
          renderItem={({ item }) => {
            const selected = item.id === selectedId;
            return (
              <Pressable
                onPress={() => handleSelect(item.id)}
                style={[styles.row, selected && styles.rowSelected]}
              >
                <View style={[styles.avatar, selected && styles.avatarSelected]}>
                  <Text style={[styles.avatarText, selected && { color: colors.accent }]}>
                    {item.name.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.rowName, selected && styles.rowNameSelected]} numberOfLines={1}>
                  {item.name}
                </Text>
                {selected ? (
                  <PostaIcon name="check" size={18} color={colors.accent} strokeWidth={2.5} />
                ) : null}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '72%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSoft,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.displaySection(18, colors.text),
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body(13, colors.textMuted),
    marginBottom: spacing.lg,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    height: 44,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  rowSelected: {
    backgroundColor: colors.accentBg,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSelected: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentBg,
  },
  avatarText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  rowName: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.text,
  },
  rowNameSelected: {
    fontFamily: fonts.bodySemiBold,
    color: colors.accent,
  },
  empty: {
    textAlign: 'center',
    color: colors.textFaint,
    fontSize: 14,
    paddingVertical: spacing.xl,
    lineHeight: 20,
  },
  clearBtn: {
    fontSize: 22,
    color: colors.textMuted,
    lineHeight: 24,
    paddingHorizontal: 4,
  },
});
