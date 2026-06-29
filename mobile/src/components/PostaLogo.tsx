import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { colors } from '../theme';

interface PostaLogoProps {
  size?: number;
  showWordmark?: boolean;
}

/** Logo de ruta Posta (puntos + flecha), igual que la web */
export default function PostaLogo({ size = 48, showWordmark = true }: PostaLogoProps) {
  const ink = '#E9EDF4';
  const stamp = colors.accent;

  return (
    <View style={styles.row}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Circle cx="13" cy="32" r="5" fill={ink} />
        <Line x1="18" y1="32" x2="28" y2="32" stroke={ink} strokeWidth="3.4" strokeLinecap="round" />
        <Circle cx="33" cy="32" r="6" fill="none" stroke={ink} strokeWidth="3.4" />
        <Line x1="39" y1="32" x2="46" y2="32" stroke={stamp} strokeWidth="3.4" strokeLinecap="round" />
        <Path d="M45 26 L55 32 L45 38 Z" fill={stamp} />
      </Svg>
      {showWordmark && <Text style={[styles.wordmark, { fontSize: size * 0.46 }]}>Posta</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordmark: {
    color: colors.text,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
});
