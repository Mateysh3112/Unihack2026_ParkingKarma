import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { KarmaBadge } from '../components/KarmaBadge';

export function ProfileScreen() {
  const { user, addKarma } = useAppStore();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.name[0]}</Text>
        </View>
        <Text style={styles.name}>{user.name}</Text>
        <KarmaBadge tier={user.tier} karma={user.karma} size="large" />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Activity</Text>
        <StatRow label="Spots Shared" value={String(user.spotsShared)} />
        <StatRow label="Spots Used" value={String(user.spotsUsed)} />
        <StatRow label="Total Karma" value={`${user.karma} pts`} last />
      </View>

      <TouchableOpacity style={styles.devBtn} onPress={() => addKarma(50)}>
        <Text style={styles.devText}>⚡ +50 karma (dev)</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function StatRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.statRow, last && styles.statRowLast]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48 },
  header: { alignItems: 'center', gap: 12, marginBottom: 24 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 34, fontWeight: '800', color: '#fff' },
  name: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 12 },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statRowLast: { borderBottomWidth: 0 },
  statLabel: { color: '#555', fontSize: 15 },
  statValue: { fontWeight: '700', fontSize: 15, color: '#1a1a1a' },
  devBtn: {
    backgroundColor: '#f0f0f0',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  devText: { color: '#888', fontSize: 13, fontWeight: '600' },
});
