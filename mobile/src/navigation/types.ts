import { MarketplacePlatform } from '../types';

export type RepartidorStackParamList = {
  Orders: undefined;
  OrderDetail: { orderId: string };
  ScanLabel: undefined;
  RepartidorProfile: undefined;
};

export type SellerStackParamList = {
  SellerOrders: undefined;
  SellerOrderDetail: { orderId: string };
  CreateOrder: undefined;
  SellerSettings: undefined;
  ImportShipments: { platform: MarketplacePlatform };
  Notifications: undefined;
};

export type AgencyStackParamList = {
  AgencyOrders: undefined;
  AgencyOrderDetail: { orderId: string };
  AgencyScan: undefined;
  AgencySettings: undefined;
  AgencyNotifications: undefined;
};

/** @deprecated Usar RepartidorStackParamList, SellerStackParamList o AgencyStackParamList */
export type RootStackParamList = RepartidorStackParamList;
