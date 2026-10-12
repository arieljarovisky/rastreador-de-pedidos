import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../../theme';

interface Props {
  visible: boolean;
  uri: string | null;
  token: string | null;
  onClose: () => void;
}

export default function LabelPhotoViewer({ visible, uri, token, onClose }: Props) {
  const insets = useSafeAreaInsets();
  if (!uri || !token) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Image
          source={{ uri, headers: { Authorization: `Bearer ${token}` } }}
          style={styles.photo}
          resizeMode="contain"
        />
        <Pressable
          style={[styles.close, { top: insets.top + spacing.md }]}
          onPress={onClose}
          hitSlop={12}
        >
          <Text style={styles.closeText}>Cerrar</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  close: {
    position: 'absolute',
    right: spacing.lg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  closeText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
});
