export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

export const textPayload = (text: string) => (text.trim() ? text : null);

export function urlPayload(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return null;
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// The Wi-Fi QR format treats these characters as separators, so they must be backslash-escaped.
const escapeWifi = (value: string) => value.replace(/([\\;,":])/g, '\\$1');

export function wifiPayload(ssid: string, password: string, security: WifiSecurity) {
  if (!ssid.trim()) return null;
  if (security === 'nopass') return `WIFI:T:nopass;S:${escapeWifi(ssid)};;`;
  if (!password) return null;
  return `WIFI:T:${security};S:${escapeWifi(ssid)};P:${escapeWifi(password)};;`;
}

export function phonePayload(phone: string) {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  return `tel:${trimmed.startsWith('+') ? '+' : ''}${digits}`;
}
