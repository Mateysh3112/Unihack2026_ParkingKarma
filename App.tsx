import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { TabNavigator } from "./navigation/TabNavigator";
import { usePermissions } from "./hooks/usePermissions";
import { signInUser } from "./services/firebase";
import { sampleBarometer } from "./services/barometer";
import { useVerificationStore } from "./store/useVerificationStore";

export default function App() {
  usePermissions(); // request location + sensor permissions on mount

  useEffect(() => {
    signInUser().then((user) => {
      console.log("Firebase connected! User ID:", user?.uid);
    });

    // Capture barometer baseline at ground level on app launch.
    // This is the reference pressure used to compute relative altitude later.
    // Runs non-blocking — verification flow gracefully handles a null baseline.
    sampleBarometer().then((pressure) => {
      if (pressure !== null) {
        useVerificationStore.getState().setBaselinePressure(pressure);
        console.log(`Baseline pressure captured: ${pressure.toFixed(2)} hPa`);
      }
    });
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" backgroundColor="#F2ECD8" />
        <TabNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
