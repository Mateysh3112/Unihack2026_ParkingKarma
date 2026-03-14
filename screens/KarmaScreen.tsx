import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { useKarma } from '../hooks/useKarma';
import { KarmaBadge } from '../components/KarmaBadge';
import { KARMA_TIERS } from '../services/karma';
import { PD, pdCard, pdTitle, pdLabel, pdMuted } from '../theme';

export function KarmaScreen() {
  const { user } = useAppStore();
  const { tierInfo, nextTier, progressToNextTier } = useKarma();
  const progressPercent = Math.round(progressToNextTier * 100);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>YOUR KARMA</Text>

      <View style={styles.badgeWrap}>
        <KarmaBadge tier={user.tier} karma={user.karma} size="large" />
      </View>

      {/* Progress card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          PROGRESS → {nextTier?.tier?.toUpperCase() ?? 'MAX TIER'}
        </Text>
        {/* Pixel progress bar — outer track */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: tierInfo.color }]} />
          {/* Dashed overlay grid lines for pixel feel */}
          {Array.from({ length: 9 }).map((_, i) => (
            <View key={i} style={[styles.progressTick, { left: `${(i + 1) * 10}%` as any }]} />
          ))}
        </View>
        <Text style={styles.progressLabel}>{progressPercent}%</Text>
      </View>

      {/* Stats card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>STATS</Text>
        <StatRow label="SPOTS SHARED" value={String(user.spotsShared)} />
        <StatRow label="SPOTS USED" value={String(user.spotsUsed)} />
        <StatRow label="TOTAL KARMA" value={`${user.karma} PTS`} last />
      </View>

      {/* Tier ladder */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>TIER LADDER</Text>
        {KARMA_TIERS.map((t, i) => (
          <View
            key={t.tier}
            style={[
              styles.tierRow,
              i < KARMA_TIERS.length - 1 && styles.tierRowBorder,
              user.tier === t.tier && { backgroundColor: PD.accentBg },
            ]}
          >
            <Text style={styles.tierEmoji}>{t.emoji}</Text>
            <Text style={[styles.tierName, { color: t.color }]}>{t.tier.toUpperCase()}</Text>
            <Text style={styles.tierMin}>{t.min}+ PTS</Text>
            {user.tier === t.tier && (
              <View style={styles.youTag}>
                <Text style={styles.youTagText}>YOU</Text>
              </View>
            )}
          </View>
        ))}
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
  title: { ...pdTitle, marginBottom: 20 },
  badgeWrap: { alignItems: 'flex-start', marginBottom: 20 },

  card: { ...pdCard, marginBottom: 16 },
  cardTitle: {
    ...pdLabel,
    fontSize: 12,
    marginBottom: 14,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: PD.border,
  },

  progressTrack: {
    height: 20,
    backgroundColor: PD.bg,
    borderWidth: 2,
    borderColor: PD.border,
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: { height: '100%' },
  progressTick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: PD.border,
    opacity: 0.2,
  },
  progressLabel: { ...pdMuted, textAlign: 'right', marginTop: 6 },

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

  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 10,
  },
  tierRowBorder: { borderBottomWidth: 2, borderBottomColor: PD.border },
  tierEmoji: { fontSize: 20, width: 28 },
  tierName: {
    fontFamily: PD.fontMono,
    fontWeight: '900',
    fontSize: 13,
    flex: 1,
    letterSpacing: 1,
  },
  tierMin: { ...pdMuted },
  youTag: {
    backgroundColor: PD.accent,
    borderWidth: 2,
    borderColor: PD.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  youTagText: {
    fontFamily: PD.fontMono,
    color: PD.white,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
