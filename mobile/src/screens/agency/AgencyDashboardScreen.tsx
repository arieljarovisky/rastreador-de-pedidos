import React, { useCallback, useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CompositeScreenProps } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useAgencyOrdersContext } from '../../context/AgencyOrdersContext';
import DeliveryDashboardPanel from '../../components/DeliveryDashboardPanel';
import { api } from '../../api';
import { AgencyHomeStackParamList, AgencyStackParamList } from '../../navigation/types';

type Props = CompositeScreenProps<
  NativeStackScreenProps<AgencyHomeStackParamList, 'AgencyDashboard'>,
  NativeStackScreenProps<AgencyStackParamList>
>;

export default function AgencyDashboardScreen({ navigation }: Props) {
  const { user, logout, token } = useAuth();
  const { orders, repartidores, loading, refreshing, connected, refresh } =
    useAgencyOrdersContext();
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
      eyebrow="Posta Agencia"
      title="Panel del día"
      subtitle={user?.agencyName ?? undefined}
      connected={connected}
      accentColor="#5C87EB"
      orders={orders}
      repartidores={repartidores}
      isAgency
      loading={loading}
      refreshing={refreshing}
      unreadNotifs={unreadNotifs}
      onRefresh={() => void refresh()}
      onNotifications={() => navigation.navigate('AgencyNotifications')}
      onLogout={logout}
      onOrderPress={(orderId) => navigation.navigate('AgencyOrderDetail', { orderId })}
      onGoToOrders={() => navigation.navigate('AgencyOrders')}
    />
  );
}
