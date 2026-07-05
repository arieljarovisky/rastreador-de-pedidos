import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import PostaLogo from '../PostaLogo';
import { colors, spacing, typography } from '../../theme';

interface SplashScreenProps {
  message?: string;
  /** Mientras cargan las fuentes, el wordmark usa fallback del sistema */
  fontsReady?: boolean;
}

export default function SplashScreen({
  message = 'Preparando ruta…',
  fontsReady = true,
}: SplashScreenProps) {
  const fade = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.88)).current;
  const glowA = useRef(new Animated.Value(0.35)).current;
  const glowB = useRef(new Animated.Value(0.25)).current;
  const barShift = useRef(new Animated.Value(0)).current;
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 7,
        tension: 42,
        useNativeDriver: true,
      }),
    ]).start();

    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(logoScale, {
          toValue: 1.04,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    breathe.start();

    const glowLoop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(glowA, { toValue: 0.55, duration: 2200, useNativeDriver: true }),
          Animated.timing(glowA, { toValue: 0.3, duration: 2200, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(glowB, { toValue: 0.45, duration: 1800, useNativeDriver: true }),
          Animated.timing(glowB, { toValue: 0.2, duration: 1800, useNativeDriver: true }),
        ]),
      ])
    );
    glowLoop.start();

    const barLoop = Animated.loop(
      Animated.timing(barShift, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );
    barLoop.start();

    const dotLoops = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 320, useNativeDriver: true }),
          Animated.delay(480 - i * 160),
        ])
      )
    );
    dotLoops.forEach((loop) => loop.start());

    return () => {
      breathe.stop();
      glowLoop.stop();
      barLoop.stop();
      dotLoops.forEach((loop) => loop.stop());
    };
  }, [barShift, dots, fade, glowA, glowB, logoScale]);

  const barTranslate = barShift.interpolate({
    inputRange: [0, 1],
    outputRange: [-72, 72],
  });

  return (
    <View style={styles.root}>
      <View style={styles.grid} pointerEvents="none">
        {Array.from({ length: 6 }).map((_, row) => (
          <View key={`r${row}`} style={styles.gridRow}>
            {Array.from({ length: 5 }).map((__, col) => (
              <View key={`c${col}`} style={styles.gridDot} />
            ))}
          </View>
        ))}
      </View>

      <Animated.View style={[styles.glowTop, { opacity: glowA }]} />
      <Animated.View style={[styles.glowBottom, { opacity: glowB }]} />

      <Animated.View style={[styles.content, { opacity: fade }]}>
        <Animated.View style={{ transform: [{ scale: logoScale }] }}>
          <View style={styles.logoHalo}>
            <PostaLogo size={64} showWordmark={fontsReady} variant="dark" />
          </View>
        </Animated.View>

        <Text
          style={[
            styles.tagline,
            fontsReady ? typography.monoLabel(colors.textFaint) : styles.taglineFallback,
          ]}
        >
          Hoja de ruta · CABA y GBA
        </Text>

        <View style={styles.loaderTrack}>
          <Animated.View
            style={[
              styles.loaderBar,
              { transform: [{ translateX: barTranslate }] },
            ]}
          />
        </View>

        <View style={styles.statusRow}>
          <Text
            style={[
              styles.statusText,
              fontsReady ? typography.monoLabel(colors.textMuted) : styles.statusFallback,
            ]}
          >
            {message.replace(/…$|\.{3}$/, '')}
          </Text>
          <View style={styles.dots}>
            {dots.map((dot, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  {
                    opacity: dot.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.35, 1],
                    }),
                    transform: [
                      {
                        translateY: dot.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -3],
                        }),
                      },
                    ],
                  },
                ]}
              />
            ))}
          </View>
        </View>
      </Animated.View>

      <View style={styles.footer} pointerEvents="none">
        <View style={styles.footerLine} />
        <Text style={[styles.footerText, fontsReady ? typography.monoLabel(colors.textFaint) : styles.taglineFallback]}>
          Posta Envíos
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-evenly',
    paddingVertical: 48,
    opacity: 0.35,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingHorizontal: 24,
  },
  gridDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.borderSoft,
    opacity: 0.45,
  },
  glowTop: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.accent,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -100,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.stamp,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    zIndex: 2,
  },
  logoHalo: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(28, 24, 20, 0.72)',
  },
  tagline: {
    marginTop: spacing.lg,
    letterSpacing: 1.2,
  },
  taglineFallback: {
    marginTop: spacing.lg,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
  loaderTrack: {
    marginTop: spacing.xxl,
    width: 144,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  loaderBar: {
    width: 72,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.stamp,
  },
  statusRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  statusText: {
    letterSpacing: 0.6,
  },
  statusFallback: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    paddingBottom: 1,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.stamp,
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
    gap: spacing.sm,
    zIndex: 2,
  },
  footerLine: {
    width: 32,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.borderSoft,
    opacity: 0.6,
  },
  footerText: {
    letterSpacing: 1.4,
  },
});
