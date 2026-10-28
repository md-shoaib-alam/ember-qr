import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { Alert, Platform, type ViewInstance } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { type QrMatrix, qrToPngDataUrl } from '@/qr/QrCode';

const isWeb = Platform.OS === 'web';

/** Share and save for every screen that shows a code; `shotRef` goes on the view to capture. */
export function useQrExport() {
  const shotRef = useRef<ViewInstance>(null);
  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);

  function webDownload(matrix: QrMatrix) {
    const link = document.createElement('a');
    link.href = qrToPngDataUrl(matrix);
    link.download = 'ember-qr.png';
    link.click();
  }

  function capture() {
    return captureRef(shotRef, { format: 'png', quality: 1, width: 1024, height: 1024 });
  }

  async function share(matrix: QrMatrix | null) {
    if (!matrix) return;
    setSharing(true);
    try {
      if (isWeb) {
        webDownload(matrix);
      } else {
        const uri = await capture();
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share QR code' });
      }
    } catch (e) {
      Alert.alert('Could not share', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSharing(false);
    }
  }

  async function download(matrix: QrMatrix | null) {
    if (!matrix) return;
    if (isWeb) {
      webDownload(matrix);
      return;
    }
    setSaving(true);
    try {
      const uri = await capture();
      // Loaded lazily so the web bundle never touches the native module.
      const { Asset, requestPermissionsAsync } = await import('expo-media-library');
      try {
        await Asset.create(uri);
      } catch {
        // Only saving, so ask for write-only access rather than the whole photo library.
        const perm = await requestPermissionsAsync(true);
        if (!perm.granted) throw new Error('Photo access is needed to save the QR code.');
        await Asset.create(uri);
      }
      Alert.alert('Saved', 'The QR code is in your gallery.');
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return { shotRef, sharing, saving, share, download };
}
