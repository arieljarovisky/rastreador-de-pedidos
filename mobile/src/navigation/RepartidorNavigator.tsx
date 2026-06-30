import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OrdersProvider } from '../context/OrdersContext';
import { useMandatoryLocation } from '../hooks/useMandatoryLocation';
import OrdersScreen from '../screens/OrdersScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import ScanLabelScreen from '../screens/ScanLabelScreen';
import RepartidorProfileScreen from '../screens/RepartidorProfileScreen';
import LocationRequiredScreen from '../screens/LocationRequiredScreen';
import { RepartidorStackParamList } from './types';
import { colors, fonts } from '../theme';

const Stack = createNativeStackNavigator<RepartidorStackParamList>();

function RepartidorAppStack() {
  return (
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
