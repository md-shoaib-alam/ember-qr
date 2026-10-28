import { useFonts } from 'expo-font';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Easing, useWindowDimensions, View } from 'react-native';

import { EmberBackground, holdEmberBackground } from '@/components/EmberBackground';
import { Icon, type IconName } from '@/components/Icon';
import { LiquidTabBar } from '@/components/LiquidTabBar';
import { resumeClock } from '@/clock';
import { tap } from '@/haptics';
import { ThemeModeProvider, useTheme, useThemeMode } from '@/theme';

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Text', icon: 'edit_note' },
  { name: 'url', title: 'Link', icon: 'link' },
  { name: 'scan', title: 'Scan', icon: 'photo_camera' },
  { name: 'wifi', title: 'Wi-Fi', icon: 'contactless' },
  { name: 'phone', title: 'Phone', icon: 'call' },
];

const SLIDE_MS = 260;

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((r) => {
      if (alive) setReduce(r);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

export default function RootLayout() {
  return (
    <ThemeModeProvider>
      <Root />
    </ThemeModeProvider>
  );
}

function Root() {
  const c = useTheme();
  const { scheme } = useThemeMode();
  const { width } = useWindowDimensions();
  // The vendored navigator only animates when transitionSpec/animation is set, so passing undefined
  // under reduce motion is what makes the swap instant instead of sliding.
  const slide = !useReduceMotion();
  const [loaded, error] = useFonts({
    'Bricolage-800-40': require('@/assets/fonts/Bricolage-800-40.ttf'),
    'Bricolage-700-16': require('@/assets/fonts/Bricolage-700-16.ttf'),
    'Bricolage-600-16': require('@/assets/fonts/Bricolage-600-16.ttf'),
    MaterialSymbolsOutline: require('@/assets/fonts/MaterialSymbolsOutline.ttf'),
    MaterialSymbolsFill: require('@/assets/fonts/MaterialSymbolsFill.ttf'),
  });

  // The bottom inset band is the DecorView showing through under the transparent tab bar, so it has to
  // follow the palette rather than the build-time #F7F3EE in app.json.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.bg);
  }, [c.bg]);

  // An ongoing notification can be dropped by an OEM "clear all" or a force-stop, so each launch
  // puts it back when the switch is still on.
  useEffect(() => {
    resumeClock().catch(() => {});
  }, []);

  // Do not call SplashScreen.preventAutoHideAsync() here: it marks the splash user-controlled, which
  // disables expo-router's own release, and our hide() then landed after Android had already cancelled
  // a blocked first frame — the splash stayed over a live app in the preview build.
  if (!loaded && !error) return null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <EmberBackground />
      <Tabs
        tabBar={(props) => <LiquidTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: 'transparent' },
          transitionSpec: slide
            ? { animation: 'timing', config: { duration: SLIDE_MS, easing: Easing.out(Easing.cubic) } }
            : undefined,
          // Full-width pages: the outgoing scene leaves in the direction of the tab order while the
          // incoming one arrives from the other side.
          sceneStyleInterpolator: slide
            ? ({ current }) => ({
                sceneStyle: {
                  transform: [
                    {
                      translateX: current.progress.interpolate({
                        inputRange: [-1, 0, 1],
                        outputRange: [-width, 0, width],
                      }),
                    },
                  ],
                },
              })
            : undefined,
        }}>
        {TABS.map((t) => (
          <Tabs.Screen
            key={t.name}
            name={t.name}
            listeners={{
              tabPress: () => {
                tap('hard');
                // Two full-screen scenes move during the slide; the background shader can sit it out.
                holdEmberBackground(SLIDE_MS + 140);
              },
            }}
            options={{
              title: t.title,
              tabBarIcon: ({ color, size, focused }) => (
                <Icon name={t.icon} size={size} color={color} filled={focused} />
              ),
            }}
          />
        ))}
      </Tabs>
    </View>
  );
}
