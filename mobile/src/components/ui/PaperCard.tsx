import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { paper, paperCardShadow, radius } from '../../theme';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Tarjeta papel — .paper-card en login web */
export default function PaperCard({ children, style }: Props) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: paper.panel,
    borderColor: paper.ink,
    borderWidth: 1.4,
    borderRadius: radius.posta,
    ...paperCardShadow(),
  },
});
