import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OrdersProvider } from '../context/OrdersContext';
import OrdersScreen from '../screens/OrdersScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import ScanLabelScreen from '../screens/ScanLabelScreen';
import RepartidorProfileScreen from '../screens/RepartidorProfileScreen';
import { RepartidorStackParamList } from './types';
import { colors, fonts } from '../theme';

const Stack = createNativeStackNavigator<RepartidorStackParamList>();

export default function RepartidorNavigator() {
  return (
    <OrdersProvider>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '600', fontFamily: fonts.displaySemi },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen
          name="Orders"
          component={OrdersScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="OrderDetail"
          component={OrderDetailScreen}
          options={{ title: 'Detalle del envío' }}
        />
        <Stack.Screen
          name="ScanLabel"
          component={ScanLabelScreen}
          options={{ title: 'Escanear etiqueta ML' }}
        />
        <Stack.Screen
          name="RepartidorProfile"
          component={RepartidorProfileScreen}
          options={{ title: 'Mi perfil' }}
        />
      </Stack.Navigator>
    </OrdersProvider>
  );
}
