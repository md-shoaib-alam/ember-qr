import { useIsFocused } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { type ReactNode, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { Icon } from '@/components/Icon';
import { SunMoonToggle } from '@/components/SunMoonToggle';
import { encodeQr, QrCode, qrToPngDataUrl } from '@/qr/QrCode';
import { useTheme } from '@/theme';

const QR_SIZE = 220;
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
  const [sharing, setSharing] = useState(false);
  const shotRef = useRef<ViewInstance>(null);
  const matrix = payload ? encodeQr(payload) : null;

  async function share() {
    if (!matrix) return;
    setSharing(true);
    try {
      if (isWeb) {
        const link = document.createElement('a');
        link.href = qrToPngDataUrl(matrix);
        link.download = 'ember-qr.png';
        link.click();
      } else {
        const uri = await captureRef(shotRef, { format: 'png', quality: 1, width: 1024, height: 1024 });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share QR code' });
      }
    } catch (e) {
      Alert.alert('Could not share', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSharing(false);
    }
  }

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
                <View ref={shotRef} collapsable={false} style={styles.qrFrame}>
                  <QrCode matrix={matrix} size={QR_SIZE} />
                </View>
                <Text style={[styles.caption, { color: c.muted }]} numberOfLines={1}>
                  {caption ?? payload}
                </Text>
                <Pressable
                  onPress={share}
                  disabled={sharing}
                  style={({ pressed }) => [styles.button, { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 }]}>
                  {sharing ? (
                    <ActivityIndicator color={c.onAccent} />
                  ) : (
                    <>
                      <Icon name={isWeb ? 'download' : 'ios_share'} size={22} color={c.onAccent} />
                      <Text style={[styles.buttonLabel, { color: c.onAccent }]}>
                        {isWeb ? 'Download PNG' : 'Share QR code'}
                      </Text>
                    </>
                  )}
                </Pressable>
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
  content: { padding: 20, paddingBottom: 32, gap: 16, width: '100%', maxWidth: 520, alignSelf: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontFamily: 'Bricolage-800-40', fontSize: 24, lineHeight: 30, letterSpacing: -0.4, flex: 1 },

  card: { borderRadius: 24, borderWidth: 1, padding: 16, gap: 14 },
  qrCard: { alignItems: 'center' },
  qrFrame: { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden' },
  caption: { fontSize: 13, maxWidth: '100%' },

  button: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 16,
  },
  buttonLabel: { fontFamily: 'Bricolage-700-16', fontSize: 16 },

  placeholder: {
    alignSelf: 'stretch',
    height: QR_SIZE + 40,
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
