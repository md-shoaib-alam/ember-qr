import AsyncStorage from '@react-native-async-storage/async-storage';
// expo-notifications' entry file imports its FCM topics module unconditionally, and Expo Go ships
// without that native module, so the barrel import kills the app before it renders. Only these
// submodules are used, and none of them touch topics. Drop this for the barrel once
// expo/expo#52182 reaches a release.
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import {
  getExactAlarmPermissionsAsync,
  getPermissionsAsync,
  requestExactAlarmPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications/build/NotificationPermissions';
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import { cancelAllScheduledNotificationsAsync } from 'expo-notifications/build/cancelAllScheduledNotificationsAsync';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
import { Platform } from 'react-native';

const CHANNEL_ID = 'hourly-time';
const ACCENT = '#FF6B2C';
const HOUR = 60 * 60 * 1000;
// Android caps an app at 500 pending alarms; a week of hours leaves plenty of headroom.
const WINDOW_HOURS = 24 * 7;
const ENABLED_KEY = 'ember.hourlyAlerts.on';
const TOP_UP_KEY = 'ember.hourlyAlerts.topUpAt';

export type AlertsResult = 'on' | 'inexact' | 'denied';

// The alerts exist for when the app is closed, so a foreground one must not interrupt the user.
setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let channelReady = false;

async function ensureChannel() {
  if (channelReady || Platform.OS !== 'android') return;
  await setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Hourly time',
    importance: AndroidImportance.DEFAULT,
    sound: 'default',
    lightColor: ACCENT,
    vibrationPattern: [0, 120],
  });
  channelReady = true;
}

const formatTime = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// One alarm per hour, each carrying its own time as the title: a repeating trigger would fire on
// schedule but could only ever show the text it was created with.
async function scheduleWindow() {
  await ensureChannel();
  await cancelAllScheduledNotificationsAsync();
  const now = Date.now();
  const first = Math.ceil(now / HOUR) * HOUR;
  for (let i = 0; i < WINDOW_HOURS; i++) {
    const at = first + i * HOUR;
    await scheduleNotificationAsync({
      content: {
        title: formatTime(at),
        body: 'Hourly time check. Tap to make a QR code.',
        color: ACCENT,
        threadIdentifier: CHANNEL_ID,
        data: { kind: CHANNEL_ID },
      },
      trigger: {
        type: SchedulableTriggerInputTypes.DATE,
        date: new Date(at),
        channelId: CHANNEL_ID,
      },
    });
  }
  await AsyncStorage.setItem(TOP_UP_KEY, String(now));
}

// Exact delivery needs "Alarms & reminders" on Android 12+; without it the system may defer the
// alarm by minutes, which matters when the notification's title is the time it was due.
async function ensureExactAlarms() {
  if (Platform.OS !== 'android') return true;
  const current = await getExactAlarmPermissionsAsync();
  if (current.granted) return true;
  const next = await requestExactAlarmPermissionsAsync();
  return next.granted;
}

export async function enableHourlyAlerts(): Promise<AlertsResult> {
  const current = await getPermissionsAsync();
  const permission = current.granted ? current : await requestPermissionsAsync();
  if (!permission.granted) return 'denied';
  const exact = await ensureExactAlarms();
  await scheduleWindow();
  await AsyncStorage.setItem(ENABLED_KEY, 'on');
  return exact ? 'on' : 'inexact';
}

export async function disableHourlyAlerts() {
  await cancelAllScheduledNotificationsAsync();
  await AsyncStorage.setItem(ENABLED_KEY, 'off');
}

export async function readAlertsEnabled() {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === 'on';
}

// The window is finite, so every launch refills it; a day is frequent enough to never run dry.
export async function topUpHourlyAlerts() {
  if (!(await readAlertsEnabled())) return;
  if (!(await getPermissionsAsync()).granted) return;
  const last = Number(await AsyncStorage.getItem(TOP_UP_KEY)) || 0;
  if (Date.now() - last < 12 * HOUR) return;
  await scheduleWindow();
}
