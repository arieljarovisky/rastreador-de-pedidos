import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { useAgencyOrdersContext } from '../../context/AgencyOrdersContext';
import { api } from '../../api';
import { AgencyPalette, fonts, spacing } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { TAB_BAR_CLEARANCE } from '../../constants/layout';
import AgencyTopBar from '../../components/agency/AgencyTopBar';
import PostaIcon from '../../components/icons/PostaIcons';
import { computeAgencyPanelCounts } from '../../utils/agencyPanel';
import { AgencyStackParamList, AgencyTabParamList } from '../../navigation/types';

export default function AgencyDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { palette: t } = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const navigation = useNavigation<NativeStackNavigationProp<AgencyStackParamList>>();
  const { user, token } = useAuth();
  const { orders, repartidores, loading, refreshing, refresh } = useAgencyOrdersContext();
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  const counts = useMemo(() => computeAgencyPanelCounts(orders), [orders]);
  const gpsOn = useMemo(
    () => repartidores.filter((r) => r.currentLocation).length,
    [repartidores]
  );

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

  const goTab = (tab: keyof AgencyTabParamList, params?: object) => {
    navigation.navigate('MainTabs', { screen: tab, params } as never);
  };

  const goPedidosWithFilter = (filter?: string) => {
    goTab('Orders', { screen: 'AgencyOrders', params: { filter } });
  };

  const barTotal = Math.max(counts.total, 1);
  const wOk = (counts.delivered / barTotal) * 100;
  const wSoon = (counts.inCourse / barTotal) * 100;
  const wLate = (counts.late / barTotal) * 100;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <AgencyTopBar
        agencyName={user?.agencyName ?? user?.name ?? 'Agencia'}
        notificationCount={unreadNotifs}
        onNotifications={() => navigation.navigate('AgencyNotifications')}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: TAB_BAR_CLEARANCE + insets.bottom + spacing.lg },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={t.sello}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>Entregas de hoy</Text>

        <View style={styles.hero}>
          <View style={styles.heroRow}>
            <Text style={styles.heroBig}>{counts.delivered}</Text>
            <Text style={styles.heroOf}>
              de <Text style={styles.heroOfBold}>{counts.total}</Text>
            </Text>
            <Text style={styles.heroLeft}>faltan {counts.pending}</Text>
          </View>
          <View style={styles.bar}>
            {wOk > 0 ? (
              <View style={[styles.barSeg, { width: `${wOk}%`, backgroundColor: t.verde }]} />
            ) : null}
            {wSoon > 0 ? (
              <View style={[styles.barSeg, { width: `${wSoon}%`, backgroundColor: t.ambar }]} />
            ) : null}
            {wLate > 0 ? (
              <View style={[styles.barSeg, { width: `${wLate}%`, backgroundColor: t.rojo }]} />
            ) : null}
          </View>
          <View style={styles.leg}>
            <View style={styles.legItem}>
              <View style={[styles.legDot, { backgroundColor: t.verde }]} />
              <Text style={styles.legText}>{counts.delivered} entregadas</Text>
            </View>
            <View style={styles.legItem}>
              <View style={[styles.legDot, { backgroundColor: t.ambar }]} />
              <Text style={styles.legText}>{counts.inCourse} en curso</Text>
            </View>
            <View style={styles.legItem}>
              <View style={[styles.legDot, { backgroundColor: t.rojo }]} />
              <Text style={styles.legText}>{counts.late} vencidas</Text>
            </View>
          </View>
        </View>

        {counts.late === 0 ? (
          <View style={[styles.alert, styles.alertCalm]}>
            <View style={styles.alertHead}>
              <PostaIcon name="check" size={18} color={t.verde} strokeWidth={2} />
              <Text style={[styles.alertTitle, { color: t.verde }]}>
                Ningún pedido pasó el plazo
              </Text>
            </View>
            <Text style={[styles.alertBody, styles.alertBodyCalm]}>
              Quedan {counts.pending} entregas dentro de término.
            </Text>
          </View>
        ) : (
          <View style={styles.alert}>
            <View style={styles.alertHead}>
              <PostaIcon name="alert" size={18} color={t.rojo} strokeWidth={2} />
              <Text style={styles.alertTitle}>
                {counts.late} pedido{counts.late === 1 ? '' : 's'} pasaron el plazo
              </Text>
            </View>
            <Text style={styles.alertBody}>
              {counts.sinAsignar} siguen sin repartidor asignado
            </Text>
            <View style={styles.alertActs}>
              <Pressable
                style={({ pressed }) => [styles.btn, styles.btnSolid, pressed && styles.pressed]}
                onPress={() => goPedidosWithFilter('sinasignar')}
              >
                <Text style={styles.btnSolidText}>Asignar repartidor</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
                onPress={() => goPedidosWithFilter('vencidos')}
              >
                <Text style={styles.btnText}>Ver los {counts.late}</Text>
              </Pressable>
            </View>
          </View>
        )}

        <Text style={styles.eyebrow}>Dónde está cada pedido</Text>
        <View style={styles.flow}>
          <FlowStep
            value={counts.almacen}
            label="Almacén"
            onPress={() => goPedidosWithFilter('almacen')}
          />
          <Text style={styles.arrow}>›</Text>
          <FlowStep
            value={counts.despacho}
            label="Despacho"
            onPress={() => goPedidosWithFilter('despacho')}
          />
          <Text style={styles.arrow}>›</Text>
          <FlowStep
            value={counts.ruta}
            label="En ruta"
            onPress={() => goPedidosWithFilter('ruta')}
          />
        </View>

        <Pressable
          style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
          onPress={() => goTab('Map')}
        >
          <View style={styles.ico}>
            <PostaIcon name="map" size={19} color={t.sello} strokeWidth={1.7} />
          </View>
          <View style={styles.tileText}>
            <Text style={styles.tileTitle}>Mapa en vivo</Text>
            <Text style={styles.tileSub}>
              {gpsOn} de {repartidores.length} repartidores con GPS
            </Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
          onPress={() => goTab('Settings')}
        >
          <View style={styles.ico}>
            <PostaIcon name="building" size={19} color={t.sello} strokeWidth={1.7} />
          </View>
          <View style={styles.tileText}>
            <Text style={styles.tileTitle}>Cierre del día</Text>
            <Text style={styles.tileSub}>Equipo, pagos y configuración de la agencia</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>

        {loading ? <Text style={styles.loading}>Actualizando…</Text> : null}
      </ScrollView>
    </View>
  );
}

function FlowStep({
  value,
  label,
  onPress,
}: {
  value: number;
  label: string;
  onPress: () => void;
}) {
  const { palette: t } = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return (
    <Pressable style={({ pressed }) => [styles.step, pressed && styles.pressed]} onPress={onPress}>
      <Text style={styles.stepValue}>{value}</Text>
      <Text style={styles.stepLabel}>{label}</Text>
    </Pressable>
  );
}

function createStyles(t: AgencyPalette) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: t.paper },
  scroll: { paddingHorizontal: 16, paddingTop: 18 },
  eyebrow: {
    fontFamily: fonts.monoRegular,
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: t.ink3,
    marginBottom: 10,
  },
  hero: {
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.line,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    marginBottom: 14,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 9,
    marginBottom: 13,
  },
  heroBig: {
    fontFamily: fonts.displaySemi,
    fontWeight: '600',
    fontSize: 46,
    lineHeight: 46,
    letterSpacing: -0.8,
    color: t.ink,
  },
  heroOf: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: t.ink2,
  },
  heroOfBold: { color: t.ink },
  heroLeft: {
    marginLeft: 'auto',
    fontFamily: fonts.body,
    fontSize: 13,
    color: t.ink2,
  },
  bar: {
    flexDirection: 'row',
    height: 9,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: t.barTrack,
  },
  barSeg: { height: '100%' },
  leg: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 15,
    marginTop: 9,
  },
  legItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: t.ink2,
  },
  legDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  alert: {
    backgroundColor: t.rojoBg,
    borderRadius: 14,
    padding: 15,
    marginBottom: 14,
  },
  alertCalm: { backgroundColor: t.verdeBg },
  alertHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginBottom: 3,
  },
  alertTitle: {
    flex: 1,
    fontFamily: fonts.displaySemi,
    fontWeight: '600',
    fontSize: 14.5,
    color: t.rojo,
  },
  alertBody: {
    marginLeft: 27,
    marginBottom: 13,
    fontFamily: fonts.body,
    fontSize: 13,
    color: t.alertBody,
  },
  alertBodyCalm: {
    color: t.alertCalmBody,
    marginBottom: 0,
  },
  alertActs: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1,
    height: 40,
    borderRadius: t.r,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSolid: {
    backgroundColor: t.sello,
    borderColor: t.sello,
  },
  btnText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13.5,
    fontWeight: '500',
    color: t.ink,
  },
  btnSolidText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13.5,
    fontWeight: '500',
    color: t.markText,
  },
  flow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 14,
  },
  step: {
    flex: 1,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.line,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  stepValue: {
    fontFamily: fonts.displaySemi,
    fontWeight: '600',
    fontSize: 22,
    lineHeight: 24,
    color: t.ink,
  },
  stepLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: t.ink2,
    marginTop: 3,
  },
  arrow: {
    color: t.line2,
    fontSize: 13,
    fontFamily: fonts.body,
  },
  tile: {
    width: '100%',
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.line,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  ico: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: t.selloBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: { flex: 1 },
  tileTitle: {
    fontFamily: fonts.displaySemi,
    fontWeight: '600',
    fontSize: 14.5,
    color: t.ink,
  },
  tileSub: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: t.ink2,
    marginTop: 1,
  },
  chev: {
    color: t.ink3,
    fontSize: 18,
    fontFamily: fonts.body,
  },
  pressed: { opacity: 0.92 },
  loading: {
    textAlign: 'center',
    color: t.ink3,
    fontSize: 12,
    marginTop: 8,
    fontFamily: fonts.body,
  },
});
}
