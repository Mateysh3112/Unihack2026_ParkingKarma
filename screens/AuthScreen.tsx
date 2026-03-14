import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import {
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { auth } from "../services/firebase";
import { PD, pdTitle, pdLabel, pdMuted } from "../theme";

export function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleAnonymousSignIn = async () => {
    if (!auth) {
      Alert.alert("Error", "Firebase not configured");
      return;
    }

    setIsLoading(true);
    try {
      await signInAnonymously(auth);
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    if (!auth) {
      Alert.alert("Error", "Firebase not configured");
      return;
    }

    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    if (isSignUp && !displayName) {
      Alert.alert("Error", "Please enter a display name");
      return;
    }

    setIsLoading(true);
    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        // Update display name if provided
        if (displayName) {
          await updateProfile(userCredential.user, { displayName });
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>PARKING KARMA</Text>
        <Text style={styles.subtitle}>Join the community</Text>

        <View style={styles.authContainer}>
          <TouchableOpacity
            style={styles.anonymousButton}
            onPress={handleAnonymousSignIn}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={PD.ink} />
            ) : (
              <Text style={styles.anonymousButtonText}>Continue as Guest</Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.form}>
            <TouchableOpacity
              style={styles.toggleButton}
              onPress={() => setIsSignUp(!isSignUp)}
            >
              <Text style={styles.toggleText}>
                {isSignUp
                  ? "Already have an account? Sign In"
                  : "Need an account? Sign Up"}
              </Text>
            </TouchableOpacity>

            {isSignUp && (
              <TextInput
                style={styles.input}
                placeholder="Display Name"
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
              />
            )}

            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextInput
              style={styles.input}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={styles.authButton}
              onPress={handleEmailAuth}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={PD.surface} />
              ) : (
                <Text style={styles.authButtonText}>
                  {isSignUp ? "Sign Up" : "Sign In"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PD.bg,
    justifyContent: "center",
    padding: 20,
  },
  content: {
    alignItems: "center",
  },
  title: {
    ...pdTitle,
    fontSize: 32,
    marginBottom: 8,
  },
  subtitle: {
    ...pdMuted,
    marginBottom: 40,
  },
  authContainer: {
    width: "100%",
    maxWidth: 320,
  },
  anonymousButton: {
    backgroundColor: PD.surface,
    borderWidth: 2,
    borderColor: PD.border,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 20,
  },
  anonymousButtonText: {
    ...pdLabel,
    fontWeight: "700",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: PD.border,
  },
  dividerText: {
    ...pdMuted,
    paddingHorizontal: 16,
    fontSize: 12,
  },
  form: {
    gap: 12,
  },
  toggleButton: {
    alignSelf: "center",
    padding: 8,
  },
  toggleText: {
    ...pdMuted,
    fontSize: 12,
  },
  input: {
    backgroundColor: PD.surface,
    borderWidth: 2,
    borderColor: PD.border,
    padding: 12,
    borderRadius: 8,
    fontFamily: PD.fontMono,
    fontSize: 14,
    color: PD.ink,
  },
  authButton: {
    backgroundColor: PD.accent,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  authButtonText: {
    color: PD.surface,
    fontFamily: PD.fontMono,
    fontWeight: "700",
    fontSize: 14,
  },
});
