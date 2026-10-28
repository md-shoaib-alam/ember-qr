import { PermissionsAndroid, Platform } from 'react-native';

import * as Clock from '../modules/clock-notify';

export const clockSupported = Clock.clockSupported;

export const readClockEnabled = () => Clock.isClockRunning();

export async function enableClock() {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error('Notifications are blocked for Ember QR. Allow them in system settings first.');
    }
  }
  await Clock.startClock();
}

export const disableClock = () => Clock.stopClock();

// A force-stop or an OEM "clear all" can drop an ongoing notification; put it back on launch.
export const resumeClock = () => Clock.restoreClock();
