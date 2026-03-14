import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { KarmaBadge } from '../components/KarmaBadge';
import { PD, pdCard, pdTitle, pdLabel, pdMuted } from '../theme';

export function ProfileScreen() {
  const { user, addKarma } = useAppStore();

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {/* Header block */}
      <View style={styles.headerCard}>
        {/* Pixel-art avatar: solid square with initial */}
        <View style={styles.avatarShadow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.name[0].toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.name}>{user.name.toUpperCase()}</Text>
        <KarmaBadge tier={user.tier} karma={user.karma} size="large" />
      </View>

      {/* Activity */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>ACTIVITY</Text>
        <StatRow label="SPOTS SHARED" value={String(user.spotsShared)} />
        <StatRow label="SPOTS USED" value={String(user.spotsUsed)} />
        <StatRow label="TOTAL KARMA" value={`${user.karma} PTS`} last />
      </View>

      {/* Dev button */}
      <View style={styles.devShadow}>
        <TouchableOpacity style={styles.devBtn} onPress={() => addKarma(50)} activeOpacity={0.75}>
          <Text style={styles.devText}>⚡ +50 KARMA (DEV)</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function StatRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.statRow, !last && styles.statRowBorder]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: PD.bg },
  container: { padding: 16, paddingBottom: 48 },

  headerCard: {
    ...pdCard,
    alignItems: 'center',
    gap: 14,
    paddingVertical: 28,
    marginBottom: 16,
  },

  avatarShadow: {
    backgroundColor: PD.border,
    transform: [{ translateX: 4 }, { translateY: 4 }],
  },
  avatar: {
    width: 80,
    height: 80,
    backgroundColor: PD.accent,
    borderWidth: 3,
    borderColor: PD.border,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -4 }, { translateY: -4 }],
  },
  avatarText: {
    fontFamily: PD.fontMono,
    fontSize: 36,
    fontWeight: '900',
    color: PD.white,
  },
  name: { ...pdTitle, fontSize: 20 },

  card: { ...pdCard, marginBottom: 16 },
  cardTitle: {
    ...pdLabel,
    fontSize: 12,
    marginBottom: 14,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: PD.border,
  },

  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  statRowBorder: { borderBottomWidth: 2, borderBottomColor: PD.border },
  statLabel: { ...pdMuted },
  statValue: {
    fontFamily: PD.fontMono,
    fontWeight: '900',
    fontSize: 13,
    color: PD.ink,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  devShadow: {
    backgroundColor: PD.border,
    transform: [{ translateX: 3 }, { translateY: 3 }],
  },
  devBtn: {
    backgroundColor: PD.bg,
    borderWidth: 2,
    borderColor: PD.border,
    padding: 14,
    alignItems: 'center',
    transform: [{ translateX: -3 }, { translateY: -3 }],
  },
  devText: {
    fontFamily: PD.fontMono,
    color: PD.inkLight,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
