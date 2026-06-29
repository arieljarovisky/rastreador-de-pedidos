import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';
import { AppNotification } from '../../types';
import { colors, radius, spacing } from '../../theme';
import { AgencyStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AgencyStackParamList, 'AgencyNotifications'>;

export default function AgencyNotificationsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const data = await api.getNotifications(token);
    setItems(data);
    const unread = data.some((n) => !n.read);
    if (unread) {
      await api.markNotificationsRead(token);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load()
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, [load])
  );

  const refresh = async () => {
    setRefreshing(true);
    await load().finally(() => setRefreshing(false));
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[
        styles.list,
        { paddingBottom: insets.bottom + spacing.xl },
      ]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
      }
      ListEmptyComponent={
        <Text style={styles.empty}>No tenés notificaciones por ahora.</Text>
      }
      renderItem={({ item }) => (
        <View style={[styles.card, !item.read && styles.unread]}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.body}>{item.body}</Text>
          <Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text>
          {item.orderId ? (
            <Text
              style={styles.link}
              onPress={() =>
                navigation.navigate('AgencyOrderDetail', { orderId: item.orderId! })
              }
            >
              Ver pedido {item.orderId} ›
            </Text>
          ) : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { padding: spacing.xl, flexGrow: 1 },
  empty: {
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: 60,
    fontSize: 14,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  unread: { borderColor: colors.accent },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  body: { color: colors.textMuted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  time: { color: colors.textFaint, fontSize: 11, marginTop: spacing.sm },
  link: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
});
