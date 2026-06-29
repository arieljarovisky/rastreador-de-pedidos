import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SellerOrdersProvider } from '../context/SellerOrdersContext';
import SellerOrdersScreen from '../screens/seller/SellerOrdersScreen';
import SellerOrderDetailScreen from '../screens/seller/SellerOrderDetailScreen';
import CreateOrderScreen from '../screens/seller/CreateOrderScreen';
import SellerSettingsScreen from '../screens/seller/SellerSettingsScreen';
import ImportShipmentsScreen from '../screens/seller/ImportShipmentsScreen';
import NotificationsScreen from '../screens/seller/NotificationsScreen';
import { SellerStackParamList } from './types';
import { colors, fonts } from '../theme';

const Stack = createNativeStackNavigator<SellerStackParamList>();

export default function SellerNavigator() {
  return (
    <SellerOrdersProvider>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '600', fontFamily: fonts.displaySemi },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen
          name="SellerOrders"
          component={SellerOrdersScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="SellerOrderDetail"
          component={SellerOrderDetailScreen}
          options={{ title: 'Detalle del envío' }}
        />
        <Stack.Screen
          name="CreateOrder"
          component={CreateOrderScreen}
          options={{ title: 'Nuevo envío' }}
        />
        <Stack.Screen
          name="SellerSettings"
          component={SellerSettingsScreen}
          options={{ title: 'Configuración' }}
        />
        <Stack.Screen
          name="ImportShipments"
          component={ImportShipmentsScreen}
          options={{ title: 'Importar envíos' }}
        />
        <Stack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{ title: 'Notificaciones' }}
        />
      </Stack.Navigator>
    </SellerOrdersProvider>
  );
}
