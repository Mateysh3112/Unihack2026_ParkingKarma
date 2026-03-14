import React, { useEffect } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { getTierInfo } from "../services/karma";
import { LeaderboardEntry } from "../types";
import { PD, pdTitle, pdLabel, pdMuted } from "../theme";
import { useAppStore } from "../store/useAppStore";

const RANK_LABELS = ["01", "02", "03"];

function LeaderboardRow({
  item,
  index,
}: {
  item: LeaderboardEntry;
  index: number;
}) {
  const { user } = useAppStore();
  const info = getTierInfo(item.tier);
  const isMe = user && item.userId === user.id;
  const isTop3 = item.rank <= 3;

  return (
    // Pixel drop-shadow for top 3
    <View style={[styles.rowShadow, isTop3 && styles.rowShadowTop3]}>
      <View
        style={[styles.row, isMe && styles.rowMe, isTop3 && styles.rowTop3]}
      >
        <Text style={[styles.rank, isTop3 && { color: PD.accent }]}>
          #{String(item.rank).padStart(2, "0")}
        </Text>
        <Text style={styles.tierEmoji}>{info.emoji}</Text>
        <View style={styles.nameBlock}>
          <Text style={[styles.name, isMe && styles.nameMe]} numberOfLines={1}>
            {item.name.toUpperCase()}
          </Text>
          <Text style={[styles.tierLabel, { color: info.color }]}>
            {item.tier.toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.karma, isMe && { color: PD.accent }]}>
          {item.karma} PTS
        </Text>
      </View>
    </View>
  );
}

export function LeaderboardScreen() {
  const { leaderboard, loadLeaderboard, isLoading } = useAppStore();

  useEffect(() => {
    loadLeaderboard();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>LEADERBOARD</Text>
          <Text style={styles.subtitle}>LOADING...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={leaderboard}
        keyExtractor={(item) => item.userId}
        renderItem={({ item, index }) => (
          <LeaderboardRow item={item} index={index} />
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>LEADERBOARD</Text>
            <Text style={styles.subtitle}>TOP KARMA EARNERS</Text>
          </View>
        }
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No users found. Be the first to earn karma!
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PD.bg },
  list: { padding: 16, paddingBottom: 40 },

  header: { marginBottom: 20 },
  title: { ...pdTitle },
  subtitle: { ...pdMuted, marginTop: 4 },

  rowShadow: {
    backgroundColor: PD.border,
    transform: [{ translateX: 3 }, { translateY: 3 }],
  },
  rowShadowTop3: {
    transform: [{ translateX: 4 }, { translateY: 4 }],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PD.surface,
    borderWidth: 2,
    borderColor: PD.border,
    padding: 14,
    gap: 10,
    transform: [{ translateX: -3 }, { translateY: -3 }],
  },
  rowTop3: {
    borderWidth: 3,
    transform: [{ translateX: -4 }, { translateY: -4 }],
  },
  rowMe: { backgroundColor: PD.accentBg, borderColor: PD.accent },

  rank: {
    fontFamily: PD.fontMono,
    fontWeight: "900",
    fontSize: 14,
    color: PD.inkLight,
    width: 36,
    letterSpacing: 1,
  },
  tierEmoji: { fontSize: 20 },
  nameBlock: { flex: 1 },
  name: {
    fontFamily: PD.fontMono,
    fontWeight: "900",
    fontSize: 13,
    color: PD.ink,
    letterSpacing: 1,
  },
  nameMe: { color: PD.accent },
  tierLabel: {
    fontFamily: PD.fontMono,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 2,
  },
  karma: {
    fontFamily: PD.fontMono,
    fontWeight: "900",
    fontSize: 13,
    color: PD.ink,
    letterSpacing: 1,
  },
  separator: { height: 10 },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { ...pdMuted, textAlign: "center" },
});
