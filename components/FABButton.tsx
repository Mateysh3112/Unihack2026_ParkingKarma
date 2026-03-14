import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

interface FABButtonProps {
  onPress: () => void;
  label?: string;
}

export function FABButton({ onPress, label = "I'm Leaving!" }: FABButtonProps) {
  return (
    <TouchableOpacity style={styles.fab} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.icon}>🚗</Text>
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B35',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    gap: 8,
  },
  icon: { fontSize: 20 },
  label: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
