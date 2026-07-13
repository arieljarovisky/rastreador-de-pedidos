import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OrdersProvider } from '../context/OrdersContext';
import { useMandatoryLocation } from '../hooks/useMandatoryLocation';
import OrdersScreen from '../screens/OrdersScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import ScanLabelScreen from '../screens/ScanLabelScreen';
import RepartidorProfileScreen from '../screens/RepartidorProfileScreen';
import LocationRequiredScreen from '../screens/LocationRequiredScreen';
import PostaBottomTabBar from '../components/navigation/PostaBottomTabBar';
import {
  RepartidorHomeStackParamList,
  RepartidorProfileStackParamList,
  RepartidorStackParamList,
  RepartidorTabParamList,
} from './types';
import { colors, fonts, roleAccents } from '../theme';

const Tab = createBottomTabNavigator<RepartidorTabParamList>();
const Stack = createNativeStackNavigator<RepartidorStackParamList>();
const HomeStack = createNativeStackNavigator<RepartidorHomeStackParamList>();
const ProfileStack = createNativeStackNavigator<RepartidorProfileStackParamList>();

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '600' as const, fontFamily: fonts.displaySemi },
  contentStyle: { backgroundColor: colors.bg },
};

function RepartidorHomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
      <HomeStack.Screen
        name="Orders"
        component={OrdersScreen}
        options={{ headerShown: false }}
      />
    </HomeStack.Navigator>
  );
}

function RepartidorProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={stackScreenOptions}>
      <ProfileStack.Screen
        name="RepartidorProfile"
        component={RepartidorProfileScreen}
        options={{ headerShown: false }}
      />
    </ProfileStack.Navigator>
  );
}

function RepartidorTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <PostaBottomTabBar
          {...props}
          accentColor={roleAccents.repartidor}
          tabs={{
            Home: { icon: 'package', label: 'Envíos' },
            Profile: { icon: 'user', label: 'Perfil' },
          }}
        />
      )}
    >
      <Tab.Screen name="Home" component={RepartidorHomeNavigator} />
      <Tab.Screen name="Profile" component={RepartidorProfileNavigator} />
    </Tab.Navigator>
  );
}

function RepartidorAppStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen
        name="MainTabs"
        component={RepartidorTabs}
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
        options={{ headerShown: false, animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}

export default function RepartidorNavigator() {
  const { status, canAskAgain, retry, openSettings } = useMandatoryLocation();

  if (status === 'checking') {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={colors.blue} />
      </View>
    );
  }

  if (status === 'denied') {
    return (
      <LocationRequiredScreen
        canAskAgain={canAskAgain}
        onRetry={retry}
        onOpenSettings={openSettings}
      />
    );
  }

  return (
    <OrdersProvider>
      <RepartidorAppStack />
    </OrdersProvider>
  );
}
