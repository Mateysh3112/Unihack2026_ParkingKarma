// Playdate-inspired design system
// Aesthetic: 1-bit newsprint, chunky pixel borders, monospace bold type, flat & high-contrast

export const PD = {
  // Palette
  bg:       '#F2ECD8',   // newsprint cream
  surface:  '#FDFAF3',   // slightly lighter surface
  ink:      '#1A1714',   // near-black ink
  inkLight: '#5C554A',   // muted ink for secondary text
  accent:   '#FF6B35',   // orange — the one allowed colour
  accentBg: '#FFE9DC',   // tinted accent surface
  white:    '#FFFFFF',
  border:   '#1A1714',

  // Typography — React Native system fonts closest to monospace/bitmap
  fontMono: 'Courier New' as const,
  fontBold: undefined,    // system bold

  // Grid / spacing
  grid: 4,
  borderWidth: 2,
  borderWidthThick: 3,

  // No border radius — square pixel aesthetic (use 0 strictly)
  radius: 0,
} as const;

export const pdCard = {
  backgroundColor: PD.surface,
  borderWidth: PD.borderWidth,
  borderColor: PD.border,
  borderRadius: PD.radius,
  padding: 16,
} as const;

export const pdTitle = {
  fontFamily: PD.fontMono,
  fontWeight: '900' as const,
  fontSize: 22,
  color: PD.ink,
  textTransform: 'uppercase' as const,
  letterSpacing: 2,
} as const;

export const pdLabel = {
  fontFamily: PD.fontMono,
  fontWeight: '700' as const,
  fontSize: 13,
  color: PD.ink,
  textTransform: 'uppercase' as const,
  letterSpacing: 1,
} as const;

export const pdMuted = {
  fontFamily: PD.fontMono,
  fontSize: 11,
  color: PD.inkLight,
  textTransform: 'uppercase' as const,
  letterSpacing: 1,
} as const;
