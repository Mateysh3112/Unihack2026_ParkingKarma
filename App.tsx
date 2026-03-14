import React, { useEffect } from "react";
import { AppState } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { TabNavigator } from "./navigation/TabNavigator";
import { AuthScreen } from "./screens/AuthScreen";
import { usePermissions } from "./hooks/usePermissions";
import { useAppStore } from "./store/useAppStore";
import { sampleBarometer } from "./services/barometer";
import { useVerificationStore } from "./store/useVerificationStore";

export default function App() {
  const { isAuthenticated, isLoading, initializeAuth } = useAppStore();
  usePermissions(); // request location + sensor permissions on mount

  useEffect(() => {
    // Initialize Firebase Auth
    initializeAuth();

    // Capture barometer baseline at ground level on app launch.
    // This is the reference pressure used to compute relative altitude later.
    // Runs non-blocking — verification flow gracefully handles a null baseline.
    sampleBarometer().then((pressure) => {
      if (pressure !== null) {
        useVerificationStore.getState().setBaselinePressure(pressure);
        console.log(`Baseline pressure captured: ${pressure.toFixed(2)} hPa`);
      }
    });

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      const { verificationStatus, cancelVerification } =
        useVerificationStore.getState();

      if (
        nextState !== "active" &&
        (verificationStatus === "monitoring" ||
          verificationStatus === "suspicious" ||
          verificationStatus === "verified")
      ) {
        cancelVerification("app_backgrounded");
      }
    });

    return () => {
      appStateSub.remove();
    };
  }, []);

  if (isLoading) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <AuthScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        {isAuthenticated ? <TabNavigator /> : <AuthScreen />}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
