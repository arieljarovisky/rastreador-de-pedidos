import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import RepartidorNavigator from './RepartidorNavigator';
import SellerNavigator from './SellerNavigator';
import AgencyNavigator from './AgencyNavigator';
import PushNotificationsBridge from '../components/PushNotificationsBridge';
import SplashScreen from '../components/ui/SplashScreen';
import { isAgencyAdminRole, isRepartidorRole, isSellerRole } from '../types';
import { colors } from '../theme';

const AuthStack = createNativeStackNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.blue,
  },
};

export default function RootNavigator() {
  const { user, token, loading } = useAuth();

  if (loading) {
    return <SplashScreen message="Verificando sesión…" />;
  }

  return (
    <NavigationContainer theme={navTheme}>
      {token && user ? <PushNotificationsBridge /> : null}
      {!token || !user ? (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Login" component={LoginScreen} />
        </AuthStack.Navigator>
      ) : isAgencyAdminRole(user.role) ? (
        <AgencyNavigator />
      ) : isSellerRole(user.role) ? (
        <SellerNavigator />
      ) : isRepartidorRole(user.role) ? (
        <RepartidorNavigator />
      ) : null}
    </NavigationContainer>
  );
}
