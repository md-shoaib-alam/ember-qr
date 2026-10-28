import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type ClockNotifyNative = {
  isRunning(): Promise<boolean>;
  start(): Promise<void>;
  stop(): Promise<void>;
  restore(): Promise<void>;
};

// Android-only: iOS has no ongoing notification and the web build has no native module.
// Expo Go has no ClockNotify either, so a missing module must not take the whole bundle down.
function load(): ClockNotifyNative | null {
  if (Platform.OS !== 'android') return null;
  try {
    return requireNativeModule<ClockNotifyNative>('ClockNotify');
  } catch {
    return null;
  }
}

const native = load();

export const clockSupported = native !== null;

export async function isClockRunning() {
  return native ? native.isRunning() : false;
}

export async function startClock() {
  await native?.start();
}

export async function stopClock() {
  await native?.stop();
}

export async function restoreClock() {
  await native?.restore();
}
