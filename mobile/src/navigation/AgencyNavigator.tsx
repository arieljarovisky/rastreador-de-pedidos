import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AgencyOrdersProvider } from '../context/AgencyOrdersContext';
import AgencyOrdersScreen from '../screens/agency/AgencyOrdersScreen';
import AgencyOrderDetailScreen from '../screens/agency/AgencyOrderDetailScreen';
import AgencyScanScreen from '../screens/agency/AgencyScanScreen';
import AgencySettingsScreen from '../screens/agency/AgencySettingsScreen';
import AgencyNotificationsScreen from '../screens/agency/AgencyNotificationsScreen';
import { AgencyStackParamList } from './types';
import { colors, fonts } from '../theme';

const Stack = createNativeStackNavigator<AgencyStackParamList>();

export default function AgencyNavigator() {
  return (
    <AgencyOrdersProvider>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '600', fontFamily: fonts.displaySemi },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen
          name="AgencyOrders"
          component={AgencyOrdersScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AgencyOrderDetail"
          component={AgencyOrderDetailScreen}
          options={{ title: 'Detalle del envío' }}
        />
        <Stack.Screen
          name="AgencyScan"
          component={AgencyScanScreen}
          options={{ title: 'Escanear etiqueta ML' }}
        />
        <Stack.Screen
          name="AgencySettings"
          component={AgencySettingsScreen}
          options={{ title: 'Agencia' }}
        />
        <Stack.Screen
          name="AgencyNotifications"
          component={AgencyNotificationsScreen}
          options={{ title: 'Notificaciones' }}
        />
      </Stack.Navigator>
    </AgencyOrdersProvider>
  );
}
