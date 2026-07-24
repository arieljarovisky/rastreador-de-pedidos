import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { useAgencyOrdersContext } from '../../context/AgencyOrdersContext';
import { AgencyPalette, fonts, spacing } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import AgencyTopBar from '../../components/agency/AgencyTopBar';
import PostaIcon from '../../components/icons/PostaIcons';
import PostaMap from '../../components/PostaMap';
import { buildSellerFleetMarkers } from '../../utils/fleetMap';
import { TAB_BAR_CLEARANCE } from '../../constants/layout';
import { api } from '../../api';
import { AgencyStackParamList } from '../../navigation/types';
import { User } from '../../types';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function RiderRow({
  rider,
  carga,
}: {
  rider: User;
  carga: number;
}) {
  const { palette: t } = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const gps = Boolean(rider.currentLocation);
  return (
    <View style={styles.rider}>
      <View style={styles.av}>
        <Text style={styles.avText}>{initials(rider.name)}</Text>
      </View>
      <View style={styles.riderText}>
        <Text style={styles.riderName}>{rider.name}</Text>
        <Text style={styles.riderMeta}>
          {carga} pedido{carga === 1 ? '' : 's'} en mano
        </Text>
      </View>
      <View style={[styles.tag, gps ? styles.tagOk : styles.tagFlat]}>
        <Text style={[styles.tagText, gps ? styles.tagOkText : styles.tagFlatText]}>
          {gps ? 'GPS activo' : 'Sin señal'}
        </Text>
      </View>
    </View>
  );
}

export default function AgencyMapScreen() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { palette: t } = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const navigation = useNavigation<NativeStackNavigationProp<AgencyStackParamList>>();
  const { user, token } = useAuth();
  const { orders, repartidores, refreshing, refresh } = useAgencyOrdersContext();
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [listExpanded, setListExpanded] = useState(true);

  const loadNotifs = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getNotifications(token);
      setUnreadNotifs(data.filter((n) => !n.read).length);
    } catch {
      // ignore
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void loadNotifs();
    }, [loadNotifs])
  );

  const fleetMarkers = useMemo(
    () => buildSellerFleetMarkers(orders, repartidores),
    [orders, repartidores]
  );

  const cargaByRider = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      if (!o.repartidorId || o.archived) continue;
      if (o.status === 'delivered' || o.status === 'cancelled') continue;
      map.set(o.repartidorId, (map.get(o.repartidorId) ?? 0) + 1);
    }
    return map;
  }, [orders]);

  const enCalle = useMemo(
    () =>
      repartidores
        .filter((r) => (cargaByRider.get(r.id) ?? 0) > 0 || r.currentLocation)
        .sort((a, b) => (cargaByRider.get(b.id) ?? 0) - (cargaByRider.get(a.id) ?? 0)),
    [repartidores, cargaByRider]
  );

  /** Lista colapsable: mapa usa el resto de la pantalla y no pelea con el refresh. */
  const listMaxHeight = Math.min(320, Math.round(windowHeight * 0.38));
  const bottomPad = TAB_BAR_CLEARANCE + insets.bottom;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <AgencyTopBar
        agencyName={user?.agencyName ?? user?.name ?? 'Agencia'}
        notificationCount={unreadNotifs}
        onNotifications={() => navigation.navigate('AgencyNotifications')}
      />

      <View style={styles.mapArea}>
        <PostaMap
          markers={fleetMarkers}
          style={styles.map}
          emptyLabel="Los repartidores aparecen cuando reportan GPS."
        />
        <Pressable
          style={styles.refreshFab}
          onPress={() => void refresh()}
          accessibilityLabel="Actualizar mapa"
        >
          <PostaIcon name="live" size={16} color={t.sello} strokeWidth={1.8} />
        </Pressable>
      </View>

      <View style={[styles.sheet, { paddingBottom: bottomPad }]}>
        <Pressable
          style={styles.sheetHeader}
          onPress={() => setListExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={listExpanded ? 'Achicar lista' : 'Agrandar lista'}
        >
          <View style={styles.grab} />
          <View style={styles.sheetTitleRow}>
            <Text style={styles.eyebrow}>
              Repartidores en calle · {enCalle.length}
            </Text>
            <PostaIcon
              name={listExpanded ? 'chevronDown' : 'chevronUp'}
              size={16}
              color={t.ink3}
            />
          </View>
        </Pressable>

        {listExpanded ? (
          <FlatList
            data={enCalle}
            keyExtractor={(r) => r.id}
            style={{ maxHeight: listMaxHeight }}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={t.sello}
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Nadie en calle</Text>
                <Text style={styles.emptyBody}>
                  Cuando haya repartidores con pedidos o GPS vas a verlos acá.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <RiderRow rider={item} carga={cargaByRider.get(item.id) ?? 0} />
            )}
          />
        ) : null}
      </View>
    </View>
  );
}

function createStyles(t: AgencyPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.paper },
    mapArea: {
      flex: 1,
      position: 'relative',
      backgroundColor: t.flat,
      borderBottomWidth: 1,
      borderBottomColor: t.line,
    },
    map: { flex: 1 },
    refreshFab: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheet: {
      backgroundColor: t.card,
      borderTopWidth: 1,
      borderTopColor: t.line,
    },
    sheetHeader: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 10,
    },
    grab: {
      alignSelf: 'center',
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: t.line2,
      marginBottom: 10,
    },
    sheetTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    eyebrow: {
      fontFamily: fonts.monoRegular,
      fontSize: 10.5,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: t.ink3,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: spacing.sm,
    },
    rider: {
      width: '100%',
      backgroundColor: t.paper,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      marginBottom: 8,
    },
    av: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: t.flat,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avText: {
      fontFamily: fonts.bodySemiBold,
      fontSize: 12,
      fontWeight: '600',
      color: t.ink2,
    },
    riderText: { flex: 1 },
    riderName: {
      fontFamily: fonts.bodyMedium,
      fontWeight: '500',
      fontSize: 14,
      color: t.ink,
    },
    riderMeta: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: t.ink2,
      marginTop: 1,
    },
    tag: {
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 6,
    },
    tagOk: { backgroundColor: t.verdeBg },
    tagFlat: { backgroundColor: t.flat },
    tagText: {
      fontFamily: fonts.bodyMedium,
      fontSize: 11.5,
      fontWeight: '500',
    },
    tagOkText: { color: t.verde },
    tagFlatText: { color: t.ink2 },
    empty: {
      alignItems: 'center',
      paddingVertical: 28,
      paddingHorizontal: 24,
    },
    emptyTitle: {
      fontFamily: fonts.displaySemi,
      fontWeight: '600',
      fontSize: 16,
      color: t.ink,
      marginBottom: 5,
    },
    emptyBody: {
      fontFamily: fonts.body,
      fontSize: 13.5,
      color: t.ink2,
      textAlign: 'center',
    },
  });
}
