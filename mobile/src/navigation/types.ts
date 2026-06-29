import { MarketplacePlatform } from '../types';

export type RepartidorStackParamList = {
  Orders: undefined;
  OrderDetail: { orderId: string };
  ScanLabel: undefined;
};

export type SellerStackParamList = {
  SellerOrders: undefined;
  SellerOrderDetail: { orderId: string };
  CreateOrder: undefined;
  SellerSettings: undefined;
  ImportShipments: { platform: MarketplacePlatform };
  Notifications: undefined;
};

/** @deprecated Usar RepartidorStackParamList o SellerStackParamList */
export type RootStackParamList = RepartidorStackParamList;
