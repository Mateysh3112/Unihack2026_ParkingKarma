import React from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MapScreen } from '../screens/MapScreen';
import { KarmaScreen } from '../screens/KarmaScreen';
import { LeaderboardScreen } from '../screens/LeaderboardScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { PD } from '../theme';
import { PixelIcon, MAP_GRID, KARMA_GRID, RANKS_GRID, YOU_GRID, Grid } from '../components/PixelIcon';

export type RootTabParamList = {
  Map: undefined;
  Karma: undefined;
  Leaderboard: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

function TabIcon({ grid, focused }: { grid: Grid; focused: boolean }) {
  return (
    <View style={{
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 6,
      borderTopWidth: focused ? 3 : 0,
      borderTopColor: PD.accent,
      marginTop: focused ? 0 : 3,
      width: '100%',
      minWidth: 60,
    }}>
      <PixelIcon grid={grid} focused={focused} pixelSize={2} />
    </View>
  );
}

export function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: PD.accent,
        tabBarInactiveTintColor: PD.inkLight,
        tabBarStyle: {
          backgroundColor: PD.bg,
          borderTopWidth: PD.borderWidth,
          borderTopColor: PD.border,
          height: 80,
          paddingBottom: 26,
          paddingTop: 2,
        },
        tabBarLabelStyle: {
          fontFamily: PD.fontMono,
          fontWeight: '700',
          fontSize: 10,
          letterSpacing: 1,
          textTransform: 'uppercase',
        },
        headerStyle: {
          backgroundColor: PD.bg,
          borderBottomWidth: PD.borderWidth,
          borderBottomColor: PD.border,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTitleStyle: {
          fontFamily: PD.fontMono,
          fontWeight: '900',
          fontSize: 16,
          color: PD.ink,
          letterSpacing: 2,
          textTransform: 'uppercase',
        },
      }}
    >
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          headerTitle: 'PARKING KARMA',
          tabBarLabel: 'MAP',
          tabBarIcon: ({ focused }) => <TabIcon grid={MAP_GRID} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Karma"
        component={KarmaScreen}
        options={{
          tabBarLabel: 'KARMA',
          tabBarIcon: ({ focused }) => <TabIcon grid={KARMA_GRID} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Leaderboard"
        component={LeaderboardScreen}
        options={{
          tabBarLabel: 'RANKS',
          tabBarIcon: ({ focused }) => <TabIcon grid={RANKS_GRID} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'YOU',
          tabBarIcon: ({ focused }) => <TabIcon grid={YOU_GRID} focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}
