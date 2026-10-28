import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type PanResponderInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/qr/Button';
import { QrCode, type QrMatrix } from '@/qr/QrCode';
import { useTheme } from '@/theme';

const MAX_QR = 340;
const BACKDROP = 0.45;
// Past this much travel, letting go dismisses instead of springing back.
const DISMISS_PX = 90;

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

/** Bottom sheet with the code at full size, dismissed by dragging it down. */
export function QrSheet({ open, matrix, caption, onClose, onShare, onDownload, sharing, downloading }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [drag] = useState(() => new Animated.Value(0));
  // The PanResponder is built once, so the callback it settles with has to come from a ref.
  const closeRef = useRef(onClose);
  // How far the sheet is actually pulled. On Android the gesture can end through `terminate`
  // instead of `release`, and the gesture state at that point does not carry the travel, so the
  // dismissal is decided from the distance the sheet was moved rather than from `gestureState`.
  const moved = useRef(0);
  const [pan, setPan] = useState<PanResponderInstance | null>(null);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    function settle(fling: boolean) {
      const far = fling || moved.current > DISMISS_PX;
      moved.current = 0;
      if (far) {
        // The Modal's own slide-out is the dismissal animation, so nothing has to wait for a JS
        // animation to report completion — that callback is what never arrived on Android.
        closeRef.current();
        return;
      }
      Animated.spring(drag, { toValue: 0, useNativeDriver: false, bounciness: 0 }).start();
    }
    // Built in an effect, not during render, so the handlers can read the refs above safely.
    setPan(
      PanResponder.create({
        // A drag has to clear a small threshold before it takes the touch, so taps still reach the
        // buttons and the grabber.
        onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => {
          moved.current = Math.max(0, g.dy);
          drag.setValue(moved.current);
        },
        onPanResponderRelease: (_, g) => settle(g.vy > 0.7),
        onPanResponderTerminate: () => settle(false),
      }),
    );
  }, [drag]);

  // A drag-dismiss parks the sheet below the screen, so the next open starts from rest.
  useEffect(() => {
    if (open) {
      moved.current = 0;
      drag.setValue(0);
    }
  }, [open, drag]);

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
        <Animated.View
          {...(pan?.panHandlers ?? {})}
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: c.surface,
              paddingBottom: insets.bottom + 20,
              transform: [{ translateY: drag }],
            },
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
        </Animated.View>
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
