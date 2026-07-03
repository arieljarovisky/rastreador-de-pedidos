import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import PostaIcon, { PostaIconName } from '../icons/PostaIcons';
import { colors, fonts } from '../../theme';

interface Props {
  icon: PostaIconName;
  label: string;
  color?: string;
  iconBg?: string;
  style?: ViewStyle;
}

/** Fila compacta icono SVG + texto (reemplaza emojis en cards). */
export default function IconLabelRow({
  icon,
  label,
  color = colors.textMuted,
  iconBg,
  style,
}: Props) {
  return (
    <View style={[styles.row, style]}>
      <View style={[styles.iconWrap, iconBg ? { backgroundColor: iconBg } : null]}>
        <PostaIcon name={icon} size={13} color={color} strokeWidth={1.6} />
      </View>
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  iconWrap: {
    width: 20,
    height: 20,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
  },
});
