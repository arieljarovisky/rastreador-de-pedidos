import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors, spacing } from '../../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

/** Contenedor para pestañas de listas (Orders, filtros, etc.) */
export default function ListTabBar({ children, style }: Props) {
  return <View style={[styles.bar, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
});
