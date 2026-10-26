import { useState } from 'react';

import { phonePayload } from '@/qr/payload';
import { Field, Input, QrScreen } from '@/qr/QrScreen';

export default function PhoneTab() {
  const [phone, setPhone] = useState('');

  return (
    <QrScreen title="Phone QR" payload={phonePayload(phone)} hint="Enter a phone number to create its QR code.">
      <Field label="Phone number">
        <Input value={phone} onChangeText={setPhone} placeholder="+880 1712 345678" keyboardType="phone-pad" />
      </Field>
    </QrScreen>
  );
}
