import { type BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { SunMoonToggle } from '@/components/SunMoonToggle';
import { tap } from '@/haptics';
import { Button } from '@/qr/Button';
import { encodeQr, QrCode } from '@/qr/QrCode';
import { Field, Input } from '@/qr/QrScreen';
import { useQrExport } from '@/qr/useQrExport';
import { useTheme } from '@/theme';

const CONTENT_MAX = 520;
const CONTENT_PAD = 20;
const CARD_PAD = 16;
const CARD_BORDER = 1;
const QR_MAX = 340;
const CAM_MAX = 300;
const isWeb = Platform.OS === 'web';

/** Camera scanner in the middle of the tab bar: read a code, edit its text, draw a fresh one. */
export default function ScanTab() {
  const c = useTheme();
  const focused = useIsFocused();
  const { width } = useWindowDimensions();
  const inner = Math.min(width, CONTENT_MAX) - 2 * (CONTENT_PAD + CARD_PAD + CARD_BORDER);
  const qrSize = Math.min(inner, QR_MAX);
  const camHeight = Math.min(inner, CAM_MAX);

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [built, setBuilt] = useState<string | null>(null);
  // The native scanner fires several times per second; the first hit latches until "Scan again".
  const armed = useRef(true);
  const { shotRef, sharing, saving, share, download } = useQrExport();
  const matrix = useMemo(() => (built ? encodeQr(built) : null), [built]);

  function handleScan(result: BarcodeScanningResult) {
    if (!armed.current) return;
    armed.current = false;
    tap('soft');
    setScanned(result.data);
    setDraft(result.data);
  }

  function rescan() {
    armed.current = true;
    setScanned(null);
    setDraft('');
    setBuilt(null);
  }

  function generate() {
    const text = draft.trim();
    if (text) setBuilt(text);
  }

  return (
    <SafeAreaView style={[styles.screen, isWeb && !focused && styles.hidden]} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text role="heading" style={[styles.title, { color: c.text }]}>
              Scan QR
            </Text>
            <SunMoonToggle size={40} />
          </View>

          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[styles.camera, { height: camHeight, backgroundColor: c.bg, borderColor: c.border }]}>
              {permission?.granted ? (
                // The preview holds the camera, so it only exists while this tab is on screen.
                focused && (
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={scanned === null ? handleScan : undefined}
                  />
                )
              ) : (
                <View style={styles.cameraOff}>
                  {permission === null ? (
                    <ActivityIndicator color={c.accent} />
                  ) : (
                    <>
                      <View style={[styles.cameraIcon, { backgroundColor: c.accentSoft }]}>
                        <Icon name="photo_camera" size={32} color={c.accent} />
                      </View>
                      <Text style={[styles.cameraText, { color: c.muted }]}>
                        {permission.canAskAgain
                          ? 'Camera access is needed to scan a code.'
                          : 'Allow camera access in Settings to scan a code.'}
                      </Text>
                      {permission.canAskAgain && (
                        <View style={styles.cameraButton}>
                          <Button label="Allow camera" icon="photo_camera" onPress={requestPermission} />
                        </View>
                      )}
                    </>
                  )}
                </View>
              )}
            </View>

            <Text style={[styles.hint, { color: c.muted }]}>
              {scanned === null ? 'Point the camera at a QR code.' : 'Scanned. Edit the text, then generate a new code.'}
            </Text>

            {scanned !== null && (
              <>
                <Field label="Scanned text">
                  <Input
                    value={draft}
                    onChangeText={setDraft}
                    multiline
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.textArea}
                  />
                </Field>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Button label="Scan again" icon="refresh" variant="secondary" onPress={rescan} />
                  </View>
                  <View style={styles.flex}>
                    <Button label="Generate QR" icon="qr_code_2" onPress={generate} disabled={!draft.trim()} />
                  </View>
                </View>
              </>
            )}
          </View>

          {built !== null && (
            <View style={[styles.card, styles.qrCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              {matrix ? (
                <>
                  <View ref={shotRef} collapsable={false} style={styles.qrFrame}>
                    <QrCode matrix={matrix} size={qrSize} />
                  </View>
                  <Text style={[styles.caption, { color: c.muted }]} numberOfLines={1}>
                    {built}
                  </Text>
                  {isWeb ? (
                    // Both web actions are a file download, so one button does the job and fits the row.
                    <View style={{ width: qrSize }}>
                      <Button onPress={() => share(matrix)} busy={sharing} icon="download" label="Download PNG" />
                    </View>
                  ) : (
                    <View style={[styles.row, { width: qrSize }]}>
                      <View style={styles.flex}>
                        <Button onPress={() => share(matrix)} busy={sharing} icon="ios_share" label="Share" />
                      </View>
                      <View style={styles.flex}>
                        <Button
                          onPress={() => download(matrix)}
                          busy={saving}
                          icon="download"
                          variant="secondary"
                          label="Save"
                        />
                      </View>
                    </View>
                  )}
                </>
              ) : (
                <Text style={[styles.cameraText, { color: c.muted }]}>
                  Too long for one QR code. Please shorten it.
                </Text>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  hidden: { display: 'none' },
  content: {
    padding: CONTENT_PAD,
    paddingBottom: 32,
    gap: 16,
    width: '100%',
    maxWidth: CONTENT_MAX,
    alignSelf: 'center',
  },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontFamily: 'Bricolage-800-40', fontSize: 24, lineHeight: 30, letterSpacing: -0.4, flex: 1 },

  card: { borderRadius: 24, borderWidth: CARD_BORDER, padding: CARD_PAD, gap: 14 },
  camera: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  cameraOff: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  cameraIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cameraText: { fontFamily: 'Bricolage-600-16', fontSize: 15, textAlign: 'center' },
  cameraButton: { alignSelf: 'stretch' },
  hint: { fontSize: 13, textAlign: 'center' },

  textArea: { minHeight: 88, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },

  qrCard: { alignItems: 'center' },
  qrFrame: { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden' },
  caption: { fontSize: 13, maxWidth: '100%' },
});
