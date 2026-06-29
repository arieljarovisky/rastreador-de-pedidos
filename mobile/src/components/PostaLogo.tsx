import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { colors, fonts, paper, typography } from '../theme';

interface PostaLogoProps {
  size?: number;
  showWordmark?: boolean;
  /** dark = dashboards; paper = login */
  variant?: 'dark' | 'paper';
}

export default function PostaLogo({
  size = 48,
  showWordmark = true,
  variant = 'dark',
}: PostaLogoProps) {
  const ink = variant === 'paper' ? paper.ink : colors.text;
  const stamp = variant === 'paper' ? paper.stamp : colors.stamp;

  return (
    <View style={styles.row}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Circle cx="13" cy="32" r="5" fill={ink} />
        <Line x1="18" y1="32" x2="28" y2="32" stroke={ink} strokeWidth="3.4" strokeLinecap="round" />
        <Circle cx="33" cy="32" r="6" fill="none" stroke={ink} strokeWidth="3.4" />
        <Line x1="39" y1="32" x2="46" y2="32" stroke={stamp} strokeWidth="3.4" strokeLinecap="round" />
        <Path d="M45 26 L55 32 L45 38 Z" fill={stamp} />
      </Svg>
      {showWordmark && (
        <Text
          style={[
            typography.displayTitle(Math.max(14, size * 0.5), ink),
            styles.wordmark,
          ]}
        >
          Posta
        </Text>
      )}
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
    fontFamily: fonts.display,
  },
});
