import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MapScreen } from '../screens/MapScreen';
import { KarmaScreen } from '../screens/KarmaScreen';
import { LeaderboardScreen } from '../screens/LeaderboardScreen';
import { ProfileScreen } from '../screens/ProfileScreen';

export type RootTabParamList = {
  Map: undefined;
  Karma: undefined;
  Leaderboard: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>;
}

export function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#FF6B35',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: { paddingBottom: 4, paddingTop: 2 },
        headerStyle: { backgroundColor: '#fff' },
        headerTitleStyle: { fontWeight: '800', fontSize: 18, color: '#1a1a1a' },
      }}
    >
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          headerTitle: 'ParkingKarma 🅿️',
          tabBarLabel: 'Map',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🗺️" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Karma"
        component={KarmaScreen}
        options={{
          tabBarLabel: 'Karma',
          tabBarIcon: ({ focused }) => <TabIcon emoji="⚡" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Leaderboard"
        component={LeaderboardScreen}
        options={{
          tabBarLabel: 'Leaderboard',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏆" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}
