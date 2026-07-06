import 'react-native-gesture-handler';
import '@/lib/octovault-init'; // SDK DI seam: configures sync URL + KV before providers mount

import { configureStarfishPlatform } from '@drakkar.software/octovault-sdk/platform';
import { registerServiceWorker } from '@/lib/pwa';
import { AiSettingsProvider } from '@/lib/ai-settings-context';
import { BrandProvider } from '@/lib/brand-context';
import { NotificationSettingsProvider } from '@/lib/notification-settings-context';
import { ProfileProvider } from '@/lib/profile-context';
import { SpaceRegistryProvider } from '@/lib/space-registry-context';
import { SessionProvider } from '@/lib/session-context';
import { SpaceObjectsProvider } from '@/lib/space-objects-context';
import { SpaceTypesProvider } from '@/lib/space-types-context';
import { SpacesProvider } from '@/lib/spaces-context';
import { TypeRegistryProvider } from '@/lib/type-registry-context';

import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { DKSpacesThemeProvider } from '@drakkar.software/dk-spaces-ui';
import { TelemetryProvider, useTelemetryScreenTracking } from '@drakkar.software/dk-spaces-analytics-sdk';
import { colors, resolveOctoSpacesTheme } from '@/theme';
import { useAppFonts } from '@/lib/use-app-fonts';
import { AppFrame } from '@/components/ui/AppFrame';
import { AppErrorFallback } from '@/components/ui/AppErrorFallback';
import { analytics, initAnalytics } from '@/lib/analytics';

// Install platform crypto (no-op on web; quick-crypto install() on native).
configureStarfishPlatform();

// Register the PWA service worker (web production only; no-op elsewhere).
registerServiceWorker();

// Keep the native splash up until our fonts are ready (must run at module top).
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = colors[scheme];

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  useEffect(() => { initAnalytics().catch(console.error); }, []);
  useTelemetryScreenTracking(analytics);

  // Block first paint until fonts resolve so we never flash a fallback face.
  if (!fontsLoaded && !fontError) return null;

  return (
    <TelemetryProvider client={analytics} fallback={<AppErrorFallback />}>
    <DKSpacesThemeProvider theme={resolveOctoSpacesTheme(scheme)}>
    <BrandProvider>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          {/* Provider tree for OctoVault: the session, per-identity prefs
              (notifications, AI), the user's spaces, the per-space access
              registry (read by the workspace open flow), and the profile. */}
          <SessionProvider>
            <NotificationSettingsProvider>
              <AiSettingsProvider>
                <SpacesProvider>
                  <SpaceRegistryProvider>
                    <ProfileProvider>
                      <SpaceObjectsProvider>
                        <SpaceTypesProvider>
                        <TypeRegistryProvider>
                        <AppFrame>
                          <Stack
                            screenOptions={{
                              headerShown: false,
                              contentStyle: { backgroundColor: palette.canvas },
                            }}
                          />
                        </AppFrame>
                        </TypeRegistryProvider>
                        </SpaceTypesProvider>
                      </SpaceObjectsProvider>
                    </ProfileProvider>
                  </SpaceRegistryProvider>
                </SpacesProvider>
              </AiSettingsProvider>
            </NotificationSettingsProvider>
          </SessionProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
    </BrandProvider>
    </DKSpacesThemeProvider>
    </TelemetryProvider>
  );
}
