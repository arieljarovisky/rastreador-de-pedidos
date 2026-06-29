import React from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';
import { colors, typography } from '../../theme';

interface Props {
  children: React.ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
}

/** Etiqueta mono mayúscula — .mono-label en la web */
export default function MonoLabel({ children, color = colors.textMuted, style }: Props) {
  return <Text style={[typography.monoLabel(color), style]}>{children}</Text>;
}
