import { useState } from 'react';

import { urlPayload } from '@/qr/payload';
import { Field, Input, QrScreen } from '@/qr/QrScreen';

export default function UrlTab() {
  const [url, setUrl] = useState('');

  return (
    <QrScreen title="Link QR" payload={urlPayload(url)} hint="Enter a website link to create its QR code.">
      <Field label="Website link">
        <Input
          value={url}
          onChangeText={setUrl}
          placeholder="example.com"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Field>
    </QrScreen>
  );
}
