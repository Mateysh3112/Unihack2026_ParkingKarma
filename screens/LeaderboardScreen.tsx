import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { getTierInfo } from '../services/karma';
import { LeaderboardEntry } from '../types';

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { userId: '1', name: 'DragonParker99', karma: 850, tier: 'Dragon', rank: 1 },
  { userId: '2', name: 'ZenSpotter', karma: 612, tier: 'Dragon', rank: 2 },
  { userId: '3', name: 'LotWhisperer', karma: 420, tier: 'Enlightened', rank: 3 },
  { userId: '4', name: 'KarmaKruizer', karma: 315, tier: 'Enlightened', rank: 4 },
  { userId: '5', name: 'BayBuddy', karma: 280, tier: 'Enlightened', rank: 5 },
  { userId: 'user_1', name: 'Parking Pilgrim', karma: 50, tier: 'Seedling', rank: 6 },
  { userId: '7', name: 'SlotSeeker', karma: 30, tier: 'Seedling', rank: 7 },
  { userId: '8', name: 'CurbCrawler', karma: 15, tier: 'Seedling', rank: 8 },
];

const MEDALS = ['🥇', '🥈', '🥉'];

function LeaderboardRow({ item }: { item: LeaderboardEntry }) {
  const info = getTierInfo(item.tier);
  const isMe = item.userId === 'user_1';

  return (
    <View style={[styles.row, isMe && styles.rowMe]}>
      <Text style={styles.rank}>{MEDALS[item.rank - 1] ?? `#${item.rank}`}</Text>
      <Text style={styles.tierEmoji}>{info.emoji}</Text>
      <View style={styles.nameBlock}>
        <Text style={[styles.name, isMe && styles.nameMe]}>{item.name}</Text>
        <Text style={[styles.tierLabel, { color: info.color }]}>{item.tier}</Text>
      </View>
      <Text style={styles.karma}>{item.karma} pts</Text>
    </View>
  );
}

export function LeaderboardScreen() {
  return (
    <View style={styles.container}>
      <FlatList
        data={MOCK_LEADERBOARD}
        keyExtractor={(item) => item.userId}
        renderItem={({ item }) => <LeaderboardRow item={item} />}
        ListHeaderComponent={<Text style={styles.title}>Leaderboard</Text>}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  title: { fontSize: 28, fontWeight: '800', color: '#1a1a1a', marginBottom: 12 },
  list: { padding: 16, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  rowMe: { borderWidth: 2, borderColor: '#FF6B35' },
  rank: { fontSize: 20, width: 32, textAlign: 'center' },
  tierEmoji: { fontSize: 20 },
  nameBlock: { flex: 1 },
  name: { fontWeight: '600', fontSize: 15, color: '#1a1a1a' },
  nameMe: { color: '#FF6B35' },
  tierLabel: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  karma: { fontWeight: '700', fontSize: 15, color: '#1a1a1a' },
});
