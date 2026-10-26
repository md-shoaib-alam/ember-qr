import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/qr/Button';
import { QrCode, type QrMatrix } from '@/qr/QrCode';
import { useTheme } from '@/theme';

const MAX_QR = 340;
const BACKDROP = 0.45;

type Props = {
  open: boolean;
  matrix: QrMatrix | null;
  caption: string;
  onClose: () => void;
  onShare: () => void;
  onDownload: () => void;
  sharing?: boolean;
  downloading?: boolean;
};

/** Bottom sheet with the code at full size. */
export function QrSheet({ open, matrix, caption, onClose, onShare, onDownload, sharing, downloading }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  if (!matrix) return null;

  // The sheet pads 20 and the white frame another 12, so the code can use the rest of the width.
  const qr = Math.min(width - 80, MAX_QR);

  // animationType="slide" rides the platform's window animation, so opening and closing cost no JS
  // frames and follow the system animation scale (which is also what reduce-motion changes).
  return (
    <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        </View>
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { backgroundColor: c.surface, paddingBottom: insets.bottom + 20 },
          ]}>
          <View style={[styles.grabber, { backgroundColor: c.border }]} />
          <Text role="heading" style={[styles.title, { color: c.text }]}>
            Your QR code
          </Text>
          <View style={styles.qrFrame}>
            <QrCode matrix={matrix} size={qr} />
          </View>
          <Text style={[styles.caption, { color: c.muted }]} numberOfLines={2}>
            {caption}
          </Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button label="Share" icon="ios_share" onPress={onShare} busy={sharing} />
            </View>
            <View style={styles.flex}>
              <Button label="Download" icon="download" variant="secondary" onPress={onDownload} busy={downloading} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: '#000000', opacity: BACKDROP },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 20,
    gap: 14,
    alignItems: 'center',
    maxHeight: '88%',
  },
  grabber: { width: 40, height: 4, borderRadius: 2 },
  title: { fontFamily: 'Bricolage-800-40', fontSize: 20, lineHeight: 26, letterSpacing: -0.3, alignSelf: 'flex-start' },
  qrFrame: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 12 },
  caption: { fontSize: 13, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
  flex: { flex: 1 },
});
