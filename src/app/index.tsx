import { useState } from 'react';

import { textPayload } from '@/qr/payload';
import { Field, Input, QrScreen } from '@/qr/QrScreen';

export default function TextTab() {
  const [text, setText] = useState('');

  return (
    <QrScreen title="Text QR" payload={textPayload(text)} hint="Type something and your QR code appears here.">
      <Field label="Your text">
        <Input
          value={text}
          onChangeText={setText}
          placeholder="Write anything…"
          multiline
          textAlignVertical="top"
          style={{ minHeight: 110 }}
        />
      </Field>
    </QrScreen>
  );
}
