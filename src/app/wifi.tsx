import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { type WifiSecurity, wifiPayload } from '@/qr/payload';
import { Field, Input, QrScreen } from '@/qr/QrScreen';
import { useTheme } from '@/theme';

const SECURITY: { value: WifiSecurity; label: string }[] = [
  { value: 'WPA', label: 'WPA/WPA2' },
  { value: 'WEP', label: 'WEP' },
  { value: 'nopass', label: 'None' },
];

export default function WifiTab() {
  const c = useTheme();
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [security, setSecurity] = useState<WifiSecurity>('WPA');
  const [showPassword, setShowPassword] = useState(false);

  return (
    <QrScreen
      title="Wi-Fi QR"
      payload={wifiPayload(ssid, password, security)}
      hint="Enter the network name and password."
      caption={`Joins Wi-Fi “${ssid}”`}>
      <Field label="Network name">
        <Input
          value={ssid}
          onChangeText={setSsid}
          placeholder="My Home Wi-Fi"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Field>

      <Field label="Security">
        <View style={[styles.segment, { backgroundColor: c.bg, borderColor: c.border }]}>
          {SECURITY.map((s) => {
            const active = s.value === security;
            return (
              <Pressable
                key={s.value}
                onPress={() => setSecurity(s.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[styles.segmentItem, active && { backgroundColor: c.accent }]}>
                <Text style={[styles.segmentLabel, { color: active ? c.onAccent : c.text }]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      {security !== 'nopass' && (
        <Field label="Password">
          <View>
            <Input
              value={password}
              onChangeText={setPassword}
              placeholder="Wi-Fi password"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.passwordInput}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              hitSlop={8}
              style={styles.eye}>
              <Icon name={showPassword ? 'visibility_off' : 'visibility'} size={22} color={c.muted} />
            </Pressable>
          </View>
        </Field>
      )}
    </QrScreen>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 4, gap: 4 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10 },
  segmentLabel: { fontFamily: 'Bricolage-700-16', fontSize: 13 },
  passwordInput: { paddingRight: 48 },
  eye: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
});
