import { useState } from 'react';
import { Keyboard } from 'react-native';

import { HourlyAlertsToggle } from '@/components/HourlyAlertsToggle';
import { Button } from '@/qr/Button';
import { textPayload } from '@/qr/payload';
import { Field, Input, QrScreen } from '@/qr/QrScreen';

export default function TextTab() {
  const [draft, setDraft] = useState('');
  // What the code on screen was generated from; editing the draft leaves it alone until Generate.
  const [payload, setPayload] = useState<string | null>(null);

  function generate() {
    setPayload(textPayload(draft));
    Keyboard.dismiss();
  }

  return (
    <QrScreen title="Text QR" payload={payload} hint="Write something, then tap Generate QR code.">
      <Field label="Your text">
        <Input
          value={draft}
          onChangeText={setDraft}
          placeholder="Write anything…"
          multiline
          textAlignVertical="top"
          returnKeyType="go"
          // Multiline fields insert a newline on Return by default; here Return should generate.
          submitBehavior="blurAndSubmit"
          onSubmitEditing={generate}
          style={{ minHeight: 110 }}
        />
      </Field>
      <Button label="Generate QR code" icon="qr_code_2" onPress={generate} disabled={!draft.trim()} />
      <HourlyAlertsToggle />
    </QrScreen>
  );
}
