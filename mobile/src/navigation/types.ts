import { MarketplacePlatform } from '../types';
import { NavigatorScreenParams } from '@react-navigation/native';

export type RepartidorHomeStackParamList = {
  Orders: undefined;
};

export type RepartidorProfileStackParamList = {
  RepartidorProfile: undefined;
};

export type RepartidorTabParamList = {
  Home: NavigatorScreenParams<RepartidorHomeStackParamList>;
  Profile: NavigatorScreenParams<RepartidorProfileStackParamList>;
};

export type RepartidorStackParamList = {
  MainTabs: NavigatorScreenParams<RepartidorTabParamList>;
  OrderDetail: { orderId: string };
  ScanLabel: undefined;
};

export type SellerHomeStackParamList = {
  SellerDashboard: undefined;
  SellerOrders: undefined;
};

export type SellerCreateStackParamList = {
  CreateOrder: undefined;
};

export type SellerSettingsStackParamList = {
  SellerSettings: undefined;
};

export type SellerTabParamList = {
  Home: NavigatorScreenParams<SellerHomeStackParamList>;
  Create: NavigatorScreenParams<SellerCreateStackParamList>;
  Settings: NavigatorScreenParams<SellerSettingsStackParamList>;
};

export type SellerStackParamList = {
  MainTabs: NavigatorScreenParams<SellerTabParamList>;
  SellerOrderDetail: { orderId: string };
  ImportShipments: { platform: MarketplacePlatform };
  Notifications: undefined;
  SellerShippingAccount: undefined;
};

export type AgencyHomeStackParamList = {
  AgencyDashboard: undefined;
};

export type AgencyOrdersStackParamList = {
  AgencyOrders: { filter?: string } | undefined;
};

export type AgencyMapStackParamList = {
  AgencyMap: undefined;
};

export type AgencySettingsStackParamList = {
  AgencySettings: undefined;
};

export type AgencyTabParamList = {
  Home: NavigatorScreenParams<AgencyHomeStackParamList>;
  Orders: NavigatorScreenParams<AgencyOrdersStackParamList>;
  Map: NavigatorScreenParams<AgencyMapStackParamList>;
  Settings: NavigatorScreenParams<AgencySettingsStackParamList>;
};

export type AgencyStackParamList = {
  MainTabs: NavigatorScreenParams<AgencyTabParamList>;
  AgencyOrderDetail: { orderId: string };
  AgencyNotifications: undefined;
};
