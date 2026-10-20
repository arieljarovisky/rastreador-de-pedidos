import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import PostaIcon from './icons/PostaIcons';
import { colors, fonts, radius, spacing } from '../theme';
import type { Order } from '../types';
import {
  buildPdfHtml,
  fetchShippingLabel,
  labelAction,
  labelCaption,
  loadPdfJsSources,
} from '../utils/shippingLabel';

interface Props {
  order: Order;
  token: string | null;
}

type Phase =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'image'; uri: string }
  | { status: 'pdf'; html: string }
  | { status: 'error'; message: string };

export default function ShippingLabelButton({ order, token }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        accessibilityRole="button"
        accessibilityLabel={labelAction(order).replace(' →', '')}
      >
        <PostaIcon name="tag" size={14} color={colors.accent} />
        <View style={styles.textCol}>
          <Text style={styles.caption}>{labelCaption(order)}</Text>
          <Text style={styles.link}>{labelAction(order)}</Text>
        </View>
      </Pressable>
      <ShippingLabelViewer
        visible={open}
        orderId={order.id}
        token={token}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function ShippingLabelViewer({
  visible,
  orderId,
  token,
  onClose,
}: {
  visible: boolean;
  orderId: string;
  token: string | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>({ status: 'idle' });

  useEffect(() => {
    if (!visible) {
      setPhase({ status: 'idle' });
      return;
    }
    if (!token) {
      setPhase({ status: 'error', message: 'Iniciá sesión de nuevo para ver la etiqueta.' });
      return;
    }

    let cancelled = false;
    setPhase({ status: 'loading' });

    (async () => {
      try {
        const file = await fetchShippingLabel(token, orderId);
        if (cancelled) return;
        if (file.kind === 'image') {
          setPhase({ status: 'image', uri: `data:${file.mime};base64,${file.base64}` });
          return;
        }
        const sources = await loadPdfJsSources();
        if (cancelled) return;
        setPhase({ status: 'pdf', html: buildPdfHtml(file.base64, sources) });
      } catch (err) {
        if (cancelled) return;
        setPhase({
          status: 'error',
          message: err instanceof Error ? err.message : 'No se pudo obtener la etiqueta de envío.',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, orderId, token, attempt]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { type?: string; message?: string };
      if (msg.type === 'error') {
        setPhase({
          status: 'error',
          message: msg.message || 'No se pudo mostrar la etiqueta.',
        });
      }
    } catch {
      // mensaje ajeno al visor
    }
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.viewer, { paddingTop: insets.top }]}>
        <View style={styles.viewerBar}>
          <Text style={styles.viewerTitle}>Etiqueta de envío</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
            <Text style={styles.closeText}>Cerrar</Text>
          </Pressable>
        </View>

        {phase.status === 'loading' || phase.status === 'idle' ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.hint}>Abriendo etiqueta…</Text>
          </View>
        ) : null}

        {phase.status === 'error' ? (
          <View style={styles.center}>
            <Text style={styles.error}>{phase.message}</Text>
            <Pressable onPress={() => setAttempt((n) => n + 1)} style={styles.retry}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}

        {phase.status === 'image' ? (
          <Image source={{ uri: phase.uri }} style={styles.photo} resizeMode="contain" />
        ) : null}

        {phase.status === 'pdf' ? (
          <WebView
            originWhitelist={['*']}
            source={{ html: phase.html }}
            style={styles.web}
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            scalesPageToFit
            showsVerticalScrollIndicator
            onMessage={onMessage}
            onError={() =>
              setPhase({ status: 'error', message: 'No se pudo mostrar la etiqueta.' })
            }
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  cardPressed: { opacity: 0.82 },
  textCol: { flex: 1 },
  caption: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  link: {
    color: colors.accent,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    marginTop: 4,
  },
  viewer: { flex: 1, backgroundColor: '#1c1814' },
  viewerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  viewerTitle: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
  },
  close: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  closeText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 14 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  hint: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 14 },
  error: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  retry: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  retryText: { color: colors.ctaInk, fontFamily: fonts.bodySemiBold, fontSize: 14 },
  photo: { flex: 1, width: '100%' },
  web: { flex: 1, backgroundColor: '#1c1814' },
});
