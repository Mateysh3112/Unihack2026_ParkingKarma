import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { TabNavigator } from './navigation/TabNavigator';
import { usePermissions } from './hooks/usePermissions';

export default function App() {
  usePermissions(); // request location + sensor permissions on mount

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" backgroundColor="#F2ECD8" />
        <TabNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
