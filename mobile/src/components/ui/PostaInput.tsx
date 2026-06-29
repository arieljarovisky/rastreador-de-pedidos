import React from 'react';
import { StyleSheet, TextInput, TextInputProps } from 'react-native';
import { colors, fonts, paper, radius } from '../../theme';

interface Props extends TextInputProps {
  variant?: 'dark' | 'paper';
}

/** Campo de texto — .posta-input en la web */
export default function PostaInput({ variant = 'dark', style, ...props }: Props) {
  const isPaper = variant === 'paper';
  return (
    <TextInput
      placeholderTextColor={isPaper ? paper.faint : colors.textFaint}
      style={[
        styles.input,
        isPaper ? styles.paper : styles.dark,
        style,
      ]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: radius.posta,
    paddingHorizontal: 16,
    height: 50,
    fontSize: 16,
    fontFamily: fonts.body,
    letterSpacing: -0.15,
  },
  dark: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
    color: colors.text,
  },
  paper: {
    backgroundColor: paper.inputBg,
    borderColor: paper.edge,
    color: paper.ink,
  },
});
