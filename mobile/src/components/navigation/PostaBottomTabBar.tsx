import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PostaIcon, { PostaIconName } from '../icons/PostaIcons';
import { colors, fonts, roleAccents, shadows, spacing } from '../../theme';
import { TAB_BAR_HEIGHT } from '../../constants/layout';
import { useTheme } from '../../context/ThemeContext';

export interface PostaTabItemConfig {
  icon: PostaIconName;
  label: string;
}

interface Props extends BottomTabBarProps {
  centerIndex?: number;
  centerIcon?: PostaIconName;
  centerLabel?: string;
  tabs: Record<string, PostaTabItemConfig>;
  /** Color de acento del rol (FAB activo, tab seleccionado) */
  accentColor?: string;
  /** dark = roles oscuros; agency = panel de agencia (respeta modo claro/oscuro) */
  variant?: 'dark' | 'agency';
}

export default function PostaBottomTabBar({
  state,
  descriptors,
  navigation,
  centerIndex,
  centerIcon = 'scan',
  centerLabel = 'Escanear',
  tabs,
  accentColor = roleAccents.repartidor,
  variant = 'dark',
}: Props) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, spacing.sm);
  const { palette } = useTheme();
  const agencyMode = variant === 'agency';
  const barBg = agencyMode ? palette.card : colors.surface;
  const barBorder = agencyMode ? palette.line : colors.border;
  const inactive = agencyMode ? palette.ink3 : colors.textFaint;
  const fabBorder = agencyMode ? palette.card : colors.surface;

  return (
    <View style={[styles.wrapper, { paddingBottom: bottomPad, backgroundColor: barBg, borderTopColor: barBorder }]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const config = tabs[route.name];
          const isFocused = state.index === index;
          const isCenter = centerIndex != null && index === centerIndex;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          if (isCenter) {
            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel ?? centerLabel}
                onPress={onPress}
                onLongPress={onLongPress}
                style={({ pressed }) => [styles.centerSlot, pressed && styles.pressed]}
              >
                <View
                  style={[
                    styles.centerBtn,
                    { backgroundColor: accentColor, borderColor: fabBorder },
                    isFocused && styles.centerBtnActive,
                    shadows.fab,
                  ]}
                >
                  <PostaIcon name={centerIcon} size={26} color="#F6F0E4" strokeWidth={2} />
                </View>
                <Text style={[styles.centerLabel, { color: inactive }, isFocused && { color: accentColor }]}>
                  {centerLabel}
                </Text>
              </Pressable>
            );
          }

          if (!config) return null;

          const tint = isFocused ? accentColor : inactive;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? config.label}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [
                styles.tab,
                isFocused && !agencyMode && { backgroundColor: `${accentColor}12` },
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.iconWrap, isFocused && !agencyMode && { backgroundColor: `${accentColor}18` }]}>
                <PostaIcon
                  name={config.icon}
                  size={21}
                  color={tint}
                  strokeWidth={isFocused ? 2 : 1.7}
                />
              </View>
              <Text style={[styles.label, { color: tint }, isFocused && styles.labelActive]}>
                {config.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const CENTER_SIZE = 56;

const styles = StyleSheet.create({
  wrapper: {
    borderTopWidth: 1,
    ...shadows.sm,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: TAB_BAR_HEIGHT,
    paddingHorizontal: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingBottom: 8,
    paddingTop: 4,
    minHeight: TAB_BAR_HEIGHT,
    borderRadius: 10,
    marginHorizontal: 2,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
    marginTop: -20,
  },
  centerBtn: {
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    borderRadius: CENTER_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
  },
  centerBtnActive: {
    transform: [{ scale: 1.04 }],
  },
  centerLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 11,
  },
  labelActive: {
    fontFamily: fonts.bodyMedium,
    fontWeight: '500',
  },
  pressed: { opacity: 0.82 },
});
