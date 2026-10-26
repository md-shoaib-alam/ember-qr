import { useFonts } from 'expo-font';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { View } from 'react-native';

import { EmberBackground } from '@/components/EmberBackground';
import { Icon, type IconName } from '@/components/Icon';
import { LiquidTabBar } from '@/components/LiquidTabBar';
import { ThemeModeProvider, useTheme, useThemeMode } from '@/theme';

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Text', icon: 'edit_note' },
  { name: 'url', title: 'Link', icon: 'link' },
  { name: 'wifi', title: 'Wi-Fi', icon: 'contactless' },
  { name: 'phone', title: 'Phone', icon: 'call' },
];

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
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}>
        {TABS.map((t) => (
          <Tabs.Screen
            key={t.name}
            name={t.name}
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
