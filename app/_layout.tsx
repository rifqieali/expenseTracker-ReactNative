import { useFonts } from 'expo-font';
import { DefaultTheme, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import 'react-native-reanimated';

import { db, seedIfEmpty } from '@/db/client';
import migrations from '@/drizzle/migrations';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  if (!fontsLoaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const { success: migrationSuccess, error: migrationError } = useMigrations(db, migrations);
  const [seedDone, setSeedDone] = useState(false);
  const [seedError, setSeedError] = useState<Error | null>(null);

  useEffect(() => {
    if (!migrationSuccess) return;
    let cancelled = false;
    seedIfEmpty(db)
      .then(() => {
        if (!cancelled) setSeedDone(true);
      })
      .catch((e: Error) => {
        if (!cancelled) setSeedError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [migrationSuccess]);

  useEffect(() => {
    if (migrationSuccess && seedDone) {
      SplashScreen.hideAsync();
    }
  }, [migrationSuccess, seedDone]);

  const fatal = migrationError ?? seedError;
  if (fatal) {
    SplashScreen.hideAsync();
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text>Database gagal dibuka: {fatal.message}</Text>
      </View>
    );
  }

  if (!migrationSuccess || !seedDone) {
    return null;
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
