import { useIsFocused } from 'expo-router';
import { type ReactNode, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { SunMoonToggle } from '@/components/SunMoonToggle';
import { Button } from '@/qr/Button';
import { encodeQr, QrCode } from '@/qr/QrCode';
import { QrSheet } from '@/qr/QrSheet';
import { useQrExport } from '@/qr/useQrExport';
import { useTheme } from '@/theme';

const CONTENT_MAX = 520;
const CONTENT_PAD = 20;
const CARD_PAD = 16;
const CARD_BORDER = 1;
// A 21-module code at the old fixed 220 left ~50dp of empty card on each side. The code now spans
// the card's content width instead, up to this cap.
const QR_MAX = 340;
const PLACEHOLDER_HEIGHT = 260;
const isWeb = Platform.OS === 'web';

type Props = {
  title: string;
  payload: string | null;
  hint: string;
  caption?: string;
  children: ReactNode;
};

export function QrScreen({ title, payload, hint, caption, children }: Props) {
  const c = useTheme();
  const focused = useIsFocused();
  const { width } = useWindowDimensions();
  // The card's content width, so the code spans it instead of floating in its own margin.
  const qrSize = Math.min(
    Math.min(width, CONTENT_MAX) - 2 * (CONTENT_PAD + CARD_PAD + CARD_BORDER),
    QR_MAX,
  );
  const { shotRef, sharing, saving, share, download } = useQrExport();
  const [sheet, setSheet] = useState(false);
  // Encoding walks every module and rebuilds ~hundreds of views, so it must not ride every render.
  const matrix = useMemo(() => (payload ? encodeQr(payload) : null), [payload]);
  const note = caption ?? payload ?? '';

  return (
    // Web keeps inactive tabs painted underneath, which shows through the transparent scene.
    <SafeAreaView style={[styles.screen, isWeb && !focused && styles.hidden]} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text role="heading" style={[styles.title, { color: c.text }]}>
              {title}
            </Text>
            <SunMoonToggle size={40} />
          </View>

          <View style={[styles.card, styles.qrCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            {matrix ? (
              <>
                <Pressable
                  role="button"
                  onPress={() => setSheet(true)}
                  accessibilityLabel="Open QR code larger"
                  style={({ pressed }) => [styles.qrFrame, { opacity: pressed ? 0.9 : 1 }]}>
                  <View ref={shotRef} collapsable={false}>
                    <QrCode matrix={matrix} size={qrSize} />
                  </View>
                </Pressable>
                <Text style={[styles.caption, { color: c.muted }]} numberOfLines={1}>
                  {note}
                </Text>
                <View style={{ width: qrSize }}>
                  <Button
                    onPress={() => share(matrix)}
                    busy={sharing}
                    icon={isWeb ? 'download' : 'ios_share'}
                    label={isWeb ? 'Download PNG' : 'Share QR code'}
                  />
                </View>
              </>
            ) : (
              <View style={[styles.placeholder, { borderColor: c.border, backgroundColor: c.bg }]}>
                <View style={[styles.placeholderIcon, { backgroundColor: c.accentSoft }]}>
                  <Icon name="qr_code_2" size={40} color={c.accent} />
                </View>
                <Text style={[styles.placeholderText, { color: c.muted }]}>
                  {payload ? 'Too long for one QR code. Please shorten it.' : hint}
                </Text>
              </View>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>

      <QrSheet
        open={sheet}
        matrix={matrix}
        caption={note}
        onClose={() => setSheet(false)}
        onShare={() => share(matrix)}
        onDownload={() => download(matrix)}
        sharing={sharing}
        downloading={saving}
      />
    </SafeAreaView>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  const c = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: c.muted }]}>{label}</Text>
      {children}
    </View>
  );
}

export function Input(props: TextInputProps) {
  const c = useTheme();
  return (
    <TextInput
      placeholderTextColor={c.muted}
      {...props}
      style={[
        styles.input,
        { backgroundColor: c.bg, borderColor: c.border, color: c.text, outlineColor: c.accent },
        props.style,
      ]}
    />
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
  qrCard: { alignItems: 'center' },
  qrFrame: { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden' },
  caption: { fontSize: 13, maxWidth: '100%' },

  placeholder: {
    alignSelf: 'stretch',
    height: PLACEHOLDER_HEIGHT,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  placeholderIcon: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { fontFamily: 'Bricolage-600-16', fontSize: 15, textAlign: 'center' },

  field: { gap: 6 },
  label: { fontFamily: 'Bricolage-700-16', fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
});
