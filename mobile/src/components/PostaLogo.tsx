import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

interface PostaLogoProps {
  size?: number;
  showWordmark?: boolean;
}

export default function PostaLogo({ size = 48, showWordmark = true }: PostaLogoProps) {
  const markSize = size;
  const fontSize = size * 0.52;

  return (
    <View style={styles.row}>
      <View style={[styles.mark, { width: markSize, height: markSize, borderRadius: markSize * 0.22 }]}>
        <Text style={[styles.letter, { fontSize }]}>P</Text>
      </View>
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
  mark: {
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    color: '#F6F0E4',
    fontWeight: '800',
    marginTop: -2,
  },
  wordmark: {
    color: colors.text,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
});
