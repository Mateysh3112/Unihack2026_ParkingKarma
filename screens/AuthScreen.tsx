import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { supabase } from "../services/supabase";
import { createUserProfile } from "../services/user";
import { PD, pdTitle, pdLabel, pdMuted } from "../theme";

export function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAnonLoading, setAnonIsLoading] = useState(false);

  const displayNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const handleAnonymousSignIn = async () => {
    setAnonIsLoading(true);
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) Alert.alert("Error", error.message);
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setAnonIsLoading(false);
    }
  };

  const handleEmailAuth = async () => {
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
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user) {
          await createUserProfile(data.user, displayName);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>PARKING KARMA</Text>
        <Text style={styles.subtitle}>Join the community</Text>

        <View style={styles.authContainer}>
          <TouchableOpacity
            style={styles.anonymousButton}
            onPress={handleAnonymousSignIn}
            disabled={isAnonLoading}
          >
            {isAnonLoading ? (
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
              <>
                <TextInput
                  ref={displayNameRef}
                  style={styles.input}
                  placeholder="Display Name"
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                />
              </>
            )}

            <TextInput
              ref={emailRef}
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />

            <TextInput
              ref={passwordRef}
              style={styles.input}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handleEmailAuth}
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PD.bg,
    padding: 20,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
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
