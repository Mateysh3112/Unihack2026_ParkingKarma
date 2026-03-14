import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { PD } from '../theme';

interface FABButtonProps {
  onPress: () => void;
  label?: string;
}

export function FABButton({ onPress, label = "I'M LEAVING!" }: FABButtonProps) {
  return (
    // Pixel-art "drop shadow" — offset duplicate border layer
    <View style={styles.shadowLayer}>
      <TouchableOpacity style={styles.fab} onPress={onPress} activeOpacity={0.75}>
        <Text style={styles.icon}>🚗</Text>
        <Text style={styles.label}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowLayer: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    // Offset black box = pixel-art drop shadow
    borderWidth: PD.borderWidthThick,
    borderColor: PD.border,
    backgroundColor: PD.border,
    transform: [{ translateX: 4 }, { translateY: 4 }],
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PD.accent,
    borderWidth: PD.borderWidthThick,
    borderColor: PD.border,
    paddingHorizontal: 24,
    paddingVertical: 14,
    gap: 10,
    transform: [{ translateX: -4 }, { translateY: -4 }],
  },
  icon: { fontSize: 18 },
  label: {
    fontFamily: PD.fontMono,
    color: PD.white,
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
