import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { KarmaTier } from '../types';
import { getTierInfo } from '../services/karma';
import { PD } from '../theme';

interface KarmaBadgeProps {
  tier: KarmaTier;
  karma: number;
  size?: 'small' | 'large';
}

export function KarmaBadge({ tier, karma, size = 'small' }: KarmaBadgeProps) {
  const info = getTierInfo(tier);
  const large = size === 'large';

  return (
    // Pixel-art drop shadow
    <View style={[styles.shadowLayer, large && styles.shadowLayerLarge]}>
      <View style={[
        styles.badge,
        { borderColor: info.color },
        large && styles.badgeLarge,
      ]}>
        <Text style={[styles.emoji, large && styles.emojiLarge]}>{info.emoji}</Text>
        <Text style={[styles.tier, { color: info.color }, large && styles.tierLarge]}>
          {tier}
        </Text>
        <Text style={[styles.karma, large && styles.karmaLarge]}>{karma} PTS</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowLayer: {
    borderWidth: 2,
    borderColor: PD.border,
    backgroundColor: PD.border,
    transform: [{ translateX: 3 }, { translateY: 3 }],
  },
  shadowLayerLarge: {
    transform: [{ translateX: 4 }, { translateY: 4 }],
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PD.surface,
    borderWidth: 2,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
    transform: [{ translateX: -3 }, { translateY: -3 }],
  },
  badgeLarge: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    transform: [{ translateX: -4 }, { translateY: -4 }],
  },
  emoji: { fontSize: 14 },
  emojiLarge: { fontSize: 26 },
  tier: {
    fontFamily: PD.fontMono,
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  tierLarge: { fontSize: 18 },
  karma: {
    fontFamily: PD.fontMono,
    color: PD.inkLight,
    fontSize: 11,
    letterSpacing: 1,
  },
  karmaLarge: { fontSize: 14 },
});
