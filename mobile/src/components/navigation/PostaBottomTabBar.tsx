import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PostaIcon, { PostaIconName } from '../icons/PostaIcons';
import { colors, fonts, spacing } from '../../theme';

export interface PostaTabItemConfig {
  icon: PostaIconName;
  label: string;
}

interface Props extends BottomTabBarProps {
  centerIndex: number;
  centerIcon?: PostaIconName;
  centerLabel?: string;
  tabs: Record<string, PostaTabItemConfig>;
}

export default function PostaBottomTabBar({
  state,
  descriptors,
  navigation,
  centerIndex,
  centerIcon = 'scan',
  centerLabel = 'Escanear',
  tabs,
}: Props) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, spacing.sm);

  return (
    <View style={[styles.wrapper, { paddingBottom: bottomPad }]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const config = tabs[route.name];
          const isFocused = state.index === index;
          const isCenter = index === centerIndex;

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
                <View style={[styles.centerBtn, isFocused && styles.centerBtnActive]}>
                  <PostaIcon name={centerIcon} size={26} color="#F6F0E4" strokeWidth={2} />
                </View>
                <Text style={[styles.centerLabel, isFocused && styles.labelActive]}>
                  {centerLabel}
                </Text>
              </Pressable>
            );
          }

          if (!config) return null;

          const tint = isFocused ? colors.accent : colors.textFaint;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? config.label}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
            >
              <PostaIcon name={config.icon} size={22} color={tint} strokeWidth={isFocused ? 2 : 1.75} />
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

const BAR_HEIGHT = 58;
const CENTER_SIZE = 56;

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.bg,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: BAR_HEIGHT,
    paddingHorizontal: spacing.md,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingBottom: 6,
    minHeight: BAR_HEIGHT,
  },
  centerSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 2,
    marginTop: -22,
  },
  centerBtn: {
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    borderRadius: CENTER_SIZE / 2,
    backgroundColor: colors.stamp,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 10,
  },
  centerBtnActive: {
    backgroundColor: '#F04A22',
  },
  centerLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.textFaint,
    marginTop: 4,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  labelActive: {
    color: colors.accent,
  },
  pressed: { opacity: 0.88 },
});
