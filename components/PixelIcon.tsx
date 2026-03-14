import React from 'react';
import { View } from 'react-native';
import { PD } from '../theme';

// 0 = transparent, 1 = primary colour
export type Grid = (0 | 1)[][];

interface PixelIconProps {
  grid: Grid;
  focused: boolean;
  pixelSize?: number;
}

export function PixelIcon({ grid, focused, pixelSize = 2 }: PixelIconProps) {
  const fill = focused ? PD.accent : PD.inkLight;

  return (
    <View style={{ flexDirection: 'column' }}>
      {grid.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {row.map((cell, c) => (
            <View
              key={c}
              style={{
                width: pixelSize,
                height: pixelSize,
                backgroundColor: cell === 1 ? fill : 'transparent',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── Icon definitions (12 × 12, pixelSize 2 → renders at 24 × 24) ──────────

// MAP — location pin: circle head + narrow tail pointing down
export const MAP_GRID: Grid = [
  [0,0,0,1,1,1,1,0,0,0,0,0],
  [0,0,1,1,1,1,1,1,0,0,0,0],
  [0,1,1,0,0,0,0,1,1,0,0,0],
  [0,1,1,0,0,0,0,1,1,0,0,0],
  [0,1,1,0,0,0,0,1,1,0,0,0],
  [0,0,1,1,0,0,1,1,0,0,0,0],
  [0,0,0,1,1,1,1,0,0,0,0,0],
  [0,0,0,0,1,1,0,0,0,0,0,0],
  [0,0,0,0,1,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
];

// KARMA — 4-pointed star: reflects earning/reward rather than a lightning bolt
export const KARMA_GRID: Grid = [
  [0,0,0,0,0,1,0,0,0,0,0,0],
  [0,0,0,0,0,1,0,0,0,0,0,0],
  [0,0,0,0,1,1,1,0,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,0,0,0],
  [1,1,1,1,1,1,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,0,0,1,1,1,0,0,0,0,0],
  [0,0,0,0,0,1,0,0,0,0,0,0],
  [0,0,0,0,0,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
];

// RANKS — 3-step podium: 1st (centre/tall), 2nd (left/mid), 3rd (right/short)
export const RANKS_GRID: Grid = [
  [0,0,0,0,1,1,0,0,0,0,0,0],
  [0,0,0,0,1,1,0,0,0,0,0,0],
  [0,0,0,0,1,1,0,0,0,0,0,0],
  [0,0,1,1,1,1,0,0,0,0,0,0],
  [0,0,1,1,1,1,0,0,0,0,0,0],
  [0,0,1,1,1,1,1,1,1,0,0,0],
  [0,0,1,1,1,1,1,1,1,0,0,0],
  [0,0,1,1,1,1,1,1,1,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
];

// YOU — person silhouette: round head + torso + split legs
export const YOU_GRID: Grid = [
  [0,0,0,0,1,1,0,0,0,0,0,0],
  [0,0,0,1,1,1,1,0,0,0,0,0],
  [0,0,0,1,1,1,1,0,0,0,0,0],
  [0,0,0,0,1,1,0,0,0,0,0,0],
  [0,0,1,1,1,1,1,1,0,0,0,0],
  [0,0,1,1,1,1,1,1,0,0,0,0],
  [0,0,1,1,1,1,1,1,0,0,0,0],
  [0,0,1,1,1,1,1,1,0,0,0,0],
  [0,0,1,1,0,0,1,1,0,0,0,0],
  [0,0,1,1,0,0,1,1,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
];
