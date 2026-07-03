import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SellerOrdersProvider } from '../context/SellerOrdersContext';
import SellerOrdersScreen from '../screens/seller/SellerOrdersScreen';
import SellerDashboardScreen from '../screens/seller/SellerDashboardScreen';
import SellerOrderDetailScreen from '../screens/seller/SellerOrderDetailScreen';
import CreateOrderScreen from '../screens/seller/CreateOrderScreen';
import SellerSettingsScreen from '../screens/seller/SellerSettingsScreen';
import ImportShipmentsScreen from '../screens/seller/ImportShipmentsScreen';
import NotificationsScreen from '../screens/seller/NotificationsScreen';
import PostaBottomTabBar from '../components/navigation/PostaBottomTabBar';
import {
  SellerCreateStackParamList,
  SellerHomeStackParamList,
  SellerSettingsStackParamList,
  SellerStackParamList,
  SellerTabParamList,
} from './types';
import { colors, fonts } from '../theme';

const Tab = createBottomTabNavigator<SellerTabParamList>();
const Stack = createNativeStackNavigator<SellerStackParamList>();
const HomeStack = createNativeStackNavigator<SellerHomeStackParamList>();
const CreateStack = createNativeStackNavigator<SellerCreateStackParamList>();
const SettingsStack = createNativeStackNavigator<SellerSettingsStackParamList>();

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '600' as const, fontFamily: fonts.displaySemi },
  contentStyle: { backgroundColor: colors.bg },
};

function SellerHomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
      <HomeStack.Screen
        name="SellerDashboard"
        component={SellerDashboardScreen}
        options={{ headerShown: false }}
      />
      <HomeStack.Screen
        name="SellerOrders"
        component={SellerOrdersScreen}
        options={{ headerShown: false }}
      />
    </HomeStack.Navigator>
  );
}

function SellerCreateNavigator() {
  return (
    <CreateStack.Navigator screenOptions={stackScreenOptions}>
      <CreateStack.Screen
        name="CreateOrder"
        component={CreateOrderScreen}
        options={{ headerShown: false }}
      />
    </CreateStack.Navigator>
  );
}

function SellerSettingsNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={stackScreenOptions}>
      <SettingsStack.Screen
        name="SellerSettings"
        component={SellerSettingsScreen}
        options={{ headerShown: false }}
      />
    </SettingsStack.Navigator>
  );
}

function SellerTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <PostaBottomTabBar
          {...props}
          centerIndex={1}
          centerIcon="plus"
          centerLabel="Nuevo"
          tabs={{
            Home: { icon: 'live', label: 'Panel' },
            Create: { icon: 'plus', label: 'Nuevo' },
            Settings: { icon: 'settings', label: 'Ajustes' },
          }}
        />
      )}
    >
      <Tab.Screen name="Home" component={SellerHomeNavigator} />
      <Tab.Screen name="Create" component={SellerCreateNavigator} />
      <Tab.Screen name="Settings" component={SellerSettingsNavigator} />
    </Tab.Navigator>
  );
}

export default function SellerNavigator() {
  return (
    <SellerOrdersProvider>
      <Stack.Navigator screenOptions={stackScreenOptions}>
        <Stack.Screen
          name="MainTabs"
          component={SellerTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="SellerOrderDetail"
          component={SellerOrderDetailScreen}
          options={{ title: 'Detalle del envío' }}
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
