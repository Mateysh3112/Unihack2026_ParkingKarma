import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { KarmaTier } from '../types';
import { getTierInfo } from '../services/karma';

interface KarmaBadgeProps {
  tier: KarmaTier;
  karma: number;
  size?: 'small' | 'large';
}

export function KarmaBadge({ tier, karma, size = 'small' }: KarmaBadgeProps) {
  const info = getTierInfo(tier);
  const large = size === 'large';

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: info.color + '22', borderColor: info.color },
        large && styles.badgeLarge,
      ]}
    >
      <Text style={[styles.emoji, large && styles.emojiLarge]}>{info.emoji}</Text>
      <Text style={[styles.tier, { color: info.color }, large && styles.tierLarge]}>{tier}</Text>
      <Text style={[styles.karma, large && styles.karmaLarge]}>{karma} pts</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  badgeLarge: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderRadius: 16 },
  emoji: { fontSize: 14 },
  emojiLarge: { fontSize: 24 },
  tier: { fontWeight: '700', fontSize: 13 },
  tierLarge: { fontSize: 20 },
  karma: { color: '#666', fontSize: 12 },
  karmaLarge: { fontSize: 16 },
});
