import { MarketplacePlatform } from '../types';
import { NavigatorScreenParams } from '@react-navigation/native';

export type RepartidorHomeStackParamList = {
  Orders: { fromScanSession?: boolean } | undefined;
};

export type RepartidorScanStackParamList = {
  ScanLabel: undefined;
};

export type RepartidorProfileStackParamList = {
  RepartidorProfile: undefined;
};

export type RepartidorTabParamList = {
  Home: NavigatorScreenParams<RepartidorHomeStackParamList>;
  Scan: NavigatorScreenParams<RepartidorScanStackParamList>;
  Profile: NavigatorScreenParams<RepartidorProfileStackParamList>;
};

export type RepartidorStackParamList = {
  MainTabs: NavigatorScreenParams<RepartidorTabParamList>;
  OrderDetail: { orderId: string };
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
};

export type AgencyHomeStackParamList = {
  AgencyDashboard: undefined;
  AgencyOrders: undefined;
};

export type AgencyScanStackParamList = {
  AgencyScan: undefined;
};

export type AgencySettingsStackParamList = {
  AgencySettings: undefined;
};

export type AgencyTabParamList = {
  Home: NavigatorScreenParams<AgencyHomeStackParamList>;
  Scan: NavigatorScreenParams<AgencyScanStackParamList>;
  Settings: NavigatorScreenParams<AgencySettingsStackParamList>;
};

export type AgencyStackParamList = {
  MainTabs: NavigatorScreenParams<AgencyTabParamList>;
  AgencyOrderDetail: { orderId: string };
  AgencyNotifications: undefined;
};

/** @deprecated Usar RepartidorScanStackParamList */
export type RootStackParamList = RepartidorScanStackParamList;
