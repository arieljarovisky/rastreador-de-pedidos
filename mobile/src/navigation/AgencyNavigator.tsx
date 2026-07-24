import React, { useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AgencyOrdersProvider } from '../context/AgencyOrdersContext';
import { useTheme } from '../context/ThemeContext';
import AgencyOrdersScreen from '../screens/agency/AgencyOrdersScreen';
import AgencyDashboardScreen from '../screens/agency/AgencyDashboardScreen';
import AgencyMapScreen from '../screens/agency/AgencyMapScreen';
import AgencyOrderDetailScreen from '../screens/agency/AgencyOrderDetailScreen';
import AgencySettingsScreen from '../screens/agency/AgencySettingsScreen';
import AgencyNotificationsScreen from '../screens/agency/AgencyNotificationsScreen';
import PostaBottomTabBar from '../components/navigation/PostaBottomTabBar';
import {
  AgencyHomeStackParamList,
  AgencyMapStackParamList,
  AgencyOrdersStackParamList,
  AgencySettingsStackParamList,
  AgencyStackParamList,
  AgencyTabParamList,
} from './types';
import { fonts } from '../theme';

const Tab = createBottomTabNavigator<AgencyTabParamList>();
const Stack = createNativeStackNavigator<AgencyStackParamList>();
const HomeStack = createNativeStackNavigator<AgencyHomeStackParamList>();
const OrdersStack = createNativeStackNavigator<AgencyOrdersStackParamList>();
const MapStack = createNativeStackNavigator<AgencyMapStackParamList>();
const SettingsStack = createNativeStackNavigator<AgencySettingsStackParamList>();

function useAgencyStackOptions() {
  const { palette: t } = useTheme();
  return useMemo(
    () => ({
      headerStyle: { backgroundColor: t.card },
      headerTintColor: t.ink,
      headerTitleStyle: { fontWeight: '600' as const, fontFamily: fonts.displaySemi },
      contentStyle: { backgroundColor: t.paper },
    }),
    [t]
  );
}

function AgencyHomeNavigator() {
  const stackScreenOptions = useAgencyStackOptions();
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
      <HomeStack.Screen
        name="AgencyDashboard"
        component={AgencyDashboardScreen}
        options={{ headerShown: false }}
      />
    </HomeStack.Navigator>
  );
}

function AgencyOrdersNavigator() {
  const stackScreenOptions = useAgencyStackOptions();
  return (
    <OrdersStack.Navigator screenOptions={stackScreenOptions}>
      <OrdersStack.Screen
        name="AgencyOrders"
        component={AgencyOrdersScreen}
        options={{ headerShown: false }}
      />
    </OrdersStack.Navigator>
  );
}

function AgencyMapNavigator() {
  const stackScreenOptions = useAgencyStackOptions();
  return (
    <MapStack.Navigator screenOptions={stackScreenOptions}>
      <MapStack.Screen
        name="AgencyMap"
        component={AgencyMapScreen}
        options={{ headerShown: false }}
      />
    </MapStack.Navigator>
  );
}

function AgencySettingsNavigator() {
  const stackScreenOptions = useAgencyStackOptions();
  return (
    <SettingsStack.Navigator screenOptions={stackScreenOptions}>
      <SettingsStack.Screen
        name="AgencySettings"
        component={AgencySettingsScreen}
        options={{ headerShown: false }}
      />
    </SettingsStack.Navigator>
  );
}

function AgencyTabs() {
  const { palette: t } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <PostaBottomTabBar
          {...props}
          accentColor={t.sello}
          variant="agency"
          tabs={{
            Home: { icon: 'panel', label: 'Panel' },
            Orders: { icon: 'package', label: 'Pedidos' },
            Map: { icon: 'map', label: 'Mapa' },
            Settings: { icon: 'building', label: 'Agencia' },
          }}
        />
      )}
    >
      <Tab.Screen name="Home" component={AgencyHomeNavigator} />
      <Tab.Screen name="Orders" component={AgencyOrdersNavigator} />
      <Tab.Screen name="Map" component={AgencyMapNavigator} />
      <Tab.Screen name="Settings" component={AgencySettingsNavigator} />
    </Tab.Navigator>
  );
}

export default function AgencyNavigator() {
  const stackScreenOptions = useAgencyStackOptions();
  const { mode } = useTheme();

  return (
    <AgencyOrdersProvider>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack.Navigator screenOptions={stackScreenOptions}>
        <Stack.Screen
          name="MainTabs"
          component={AgencyTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AgencyOrderDetail"
          component={AgencyOrderDetailScreen}
          options={{ title: 'Detalle del envío' }}
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
