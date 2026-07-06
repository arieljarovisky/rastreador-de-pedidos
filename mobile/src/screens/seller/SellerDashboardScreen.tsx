import React, { useCallback, useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CompositeScreenProps } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useSellerOrdersContext } from '../../context/SellerOrdersContext';
import DeliveryDashboardPanel from '../../components/DeliveryDashboardPanel';
import { api } from '../../api';
import { colors } from '../../theme';
import { SellerHomeStackParamList, SellerStackParamList } from '../../navigation/types';

type Props = CompositeScreenProps<
  NativeStackScreenProps<SellerHomeStackParamList, 'SellerDashboard'>,
  NativeStackScreenProps<SellerStackParamList>
>;

export default function SellerDashboardScreen({ navigation }: Props) {
  const { user, logout, token } = useAuth();
  const { orders, repartidores, loading, refreshing, connected, refresh } =
    useSellerOrdersContext();
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  const loadNotifs = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getNotifications(token);
      setUnreadNotifs(data.filter((n) => !n.read).length);
    } catch {
      // ignore
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void loadNotifs();
    }, [loadNotifs])
  );

  return (
    <DeliveryDashboardPanel
      eyebrow="Posta Envios"
      title="Panel del día"
      subtitle={user?.name}
      connected={connected}
      accentColor={roleAccents.seller}
      orders={orders}
      repartidores={repartidores}
      loading={loading}
      refreshing={refreshing}
      unreadNotifs={unreadNotifs}
      onRefresh={() => void refresh()}
      onNotifications={() => navigation.navigate('Notifications')}
      onLogout={logout}
      onOrderPress={(orderId) => navigation.navigate('SellerOrderDetail', { orderId })}
      onGoToOrders={() => navigation.navigate('SellerOrders')}
    />
  );
}
