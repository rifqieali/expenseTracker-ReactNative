import type { ComponentProps } from 'react';
import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

function TabIcon({ name, color }: { name: SymbolName; color: string }) {
  return <SymbolView name={name} tintColor={color} size={28} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <TabIcon
              name={{ ios: 'house.fill', android: 'home', web: 'home' }}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="pockets"
        options={{
          title: 'Kantong',
          tabBarIcon: ({ color }) => (
            <TabIcon
              name={{ ios: 'creditcard.fill', android: 'wallet', web: 'wallet' }}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Catat',
          tabBarIcon: ({ color }) => (
            <TabIcon
              name={{ ios: 'plus.circle.fill', android: 'add_circle', web: 'add' }}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color }) => (
            <TabIcon
              name={{ ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Setting',
          tabBarIcon: ({ color }) => (
            <TabIcon
              name={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }}
              color={color as string}
            />
          ),
        }}
      />
    </Tabs>
  );
}
