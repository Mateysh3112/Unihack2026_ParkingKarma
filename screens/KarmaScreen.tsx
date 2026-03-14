import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { useKarma } from '../hooks/useKarma';
import { KarmaBadge } from '../components/KarmaBadge';
import { KARMA_TIERS } from '../services/karma';

export function KarmaScreen() {
  const { user } = useAppStore();
  const { tierInfo, nextTier, progressToNextTier } = useKarma();
  const progressPercent = Math.round(progressToNextTier * 100);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Your Karma</Text>

      <View style={styles.badgeWrap}>
        <KarmaBadge tier={user.tier} karma={user.karma} size="large" />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Progress to {nextTier?.tier ?? '✨ Max Tier reached!'}
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${progressPercent}%`, backgroundColor: tierInfo.color },
            ]}
          />
        </View>
        <Text style={styles.progressLabel}>{progressPercent}%</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Stats</Text>
        <StatRow label="Spots Shared" value={String(user.spotsShared)} />
        <StatRow label="Spots Used" value={String(user.spotsUsed)} />
        <StatRow label="Total Karma" value={`${user.karma} pts`} last />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Tier Ladder</Text>
        {KARMA_TIERS.map((t) => (
          <View
            key={t.tier}
            style={[styles.tierRow, user.tier === t.tier && { backgroundColor: t.color + '22' }]}
          >
            <Text style={styles.tierEmoji}>{t.emoji}</Text>
            <Text style={[styles.tierName, { color: t.color }]}>{t.tier}</Text>
            <Text style={styles.tierMin}>{t.min}+ pts</Text>
            {user.tier === t.tier && <Text style={styles.currentTag}>YOU</Text>}
          </View>
        ))}
      </View>
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
  title: { fontSize: 28, fontWeight: '800', color: '#1a1a1a', marginBottom: 16 },
  badgeWrap: { alignItems: 'flex-start', marginBottom: 4 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 12 },
  progressTrack: { height: 10, backgroundColor: '#eee', borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  progressLabel: { textAlign: 'right', fontSize: 12, color: '#888', marginTop: 4 },
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
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 4,
    gap: 10,
  },
  tierEmoji: { fontSize: 20 },
  tierName: { fontWeight: '700', fontSize: 15, flex: 1 },
  tierMin: { color: '#888', fontSize: 13 },
  currentTag: {
    backgroundColor: '#FF6B35',
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
});
