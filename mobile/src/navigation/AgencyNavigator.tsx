import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AgencyOrdersProvider } from '../context/AgencyOrdersContext';
import AgencyOrdersScreen from '../screens/agency/AgencyOrdersScreen';
import AgencyDashboardScreen from '../screens/agency/AgencyDashboardScreen';
import AgencyOrderDetailScreen from '../screens/agency/AgencyOrderDetailScreen';
import AgencyScanScreen from '../screens/agency/AgencyScanScreen';
import AgencySettingsScreen from '../screens/agency/AgencySettingsScreen';
import AgencyNotificationsScreen from '../screens/agency/AgencyNotificationsScreen';
import PostaBottomTabBar from '../components/navigation/PostaBottomTabBar';
import {
  AgencyHomeStackParamList,
  AgencyScanStackParamList,
  AgencySettingsStackParamList,
  AgencyStackParamList,
  AgencyTabParamList,
} from './types';
import { colors, fonts } from '../theme';

const Tab = createBottomTabNavigator<AgencyTabParamList>();
const Stack = createNativeStackNavigator<AgencyStackParamList>();
const HomeStack = createNativeStackNavigator<AgencyHomeStackParamList>();
const ScanStack = createNativeStackNavigator<AgencyScanStackParamList>();
const SettingsStack = createNativeStackNavigator<AgencySettingsStackParamList>();

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '600' as const, fontFamily: fonts.displaySemi },
  contentStyle: { backgroundColor: colors.bg },
};

function AgencyHomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
      <HomeStack.Screen
        name="AgencyDashboard"
        component={AgencyDashboardScreen}
        options={{ headerShown: false }}
      />
      <HomeStack.Screen
        name="AgencyOrders"
        component={AgencyOrdersScreen}
        options={{ headerShown: false }}
      />
    </HomeStack.Navigator>
  );
}

function AgencyScanNavigator() {
  return (
    <ScanStack.Navigator screenOptions={stackScreenOptions}>
      <ScanStack.Screen
        name="AgencyScan"
        component={AgencyScanScreen}
        options={{ headerShown: false }}
      />
    </ScanStack.Navigator>
  );
}

function AgencySettingsNavigator() {
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
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <PostaBottomTabBar
          {...props}
          centerIndex={1}
          centerIcon="scan"
          centerLabel="Escanear"
          tabs={{
            Home: { icon: 'live', label: 'Panel' },
            Scan: { icon: 'scan', label: 'Escanear' },
            Settings: { icon: 'settings', label: 'Agencia' },
          }}
        />
      )}
    >
      <Tab.Screen name="Home" component={AgencyHomeNavigator} />
      <Tab.Screen name="Scan" component={AgencyScanNavigator} />
      <Tab.Screen name="Settings" component={AgencySettingsNavigator} />
    </Tab.Navigator>
  );
}

export default function AgencyNavigator() {
  return (
    <AgencyOrdersProvider>
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
