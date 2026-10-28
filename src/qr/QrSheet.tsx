import { BottomSheet } from '@expo/ui/community/bottom-sheet';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Button } from '@/qr/Button';
import { QrCode, type QrMatrix } from '@/qr/QrCode';
import { useTheme } from '@/theme';

const MAX_QR = 340;
const PAD = 20;
const FRAME_PAD = 12;

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

/**
 * Bottom sheet with the code at full size, dismissed by dragging it down.
 *
 * This is the gorhom-shaped API from `@expo/ui`, not the plain `BottomSheet` export: only this one
 * sets `fitToContents` on Android, which drops the half-screen resting state. Without that the
 * M3 sheet opens at the halfway point and cuts the actions off, because the code is taller than
 * half the screen.
 */
export function QrSheet({ open, matrix, caption, onClose, onShare, onDownload, sharing, downloading }: Props) {
  const c = useTheme();
  const { width } = useWindowDimensions();

  if (!matrix) return null;

  const qr = Math.min(width - 2 * (PAD + FRAME_PAD), MAX_QR);

  return (
    <BottomSheet
      index={open ? 0 : -1}
      onDismiss={onClose}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: c.surface, paddingHorizontal: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
      <View style={styles.content}>
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
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { alignSelf: 'stretch', gap: 14, alignItems: 'center', paddingHorizontal: PAD, paddingTop: 4, paddingBottom: 24 },
  title: { fontFamily: 'Bricolage-800-40', fontSize: 20, lineHeight: 26, letterSpacing: -0.3, alignSelf: 'flex-start' },
  qrFrame: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: FRAME_PAD },
  caption: { fontSize: 13, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
  flex: { flex: 1 },
});
