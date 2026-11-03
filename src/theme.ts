/** PashaPlay: Dark Obsidian + Pasha Gold. Tüm ekranlar bu belirteçleri (design tokens) kullanır. */
export const colors = {
  bg: '#0b0b0b',
  surface: '#141414',
  surfaceAlt: '#1c1c1c',
  border: '#2a2a2a',
  text: '#f5f5f5',
  textDim: '#a8a8a8',
  textFaint: '#6e6e6e',
  accent: '#D4AF37',
  accentSoft: 'rgba(212,175,55,0.16)',
  onAccent: '#0b0b0b',
  gold: '#D4AF37',
  goldBright: '#F0CF65',
  live: '#ff3b30',
  fav: '#D4AF37',
  danger: '#ff6b81',
  // Cam (glassmorphism) yüzeyleri: yarı saydam beyaz + ince hat
  glass: 'rgba(255,255,255,0.06)',
  glassStrong: 'rgba(20,20,20,0.82)',
  glassBorder: 'rgba(255,255,255,0.12)',
  scrim: 'rgba(11,11,11,0.72)',
};

/** Montserrat (android/app/src/main/assets/fonts). Alt metinler sistem sans-serif'inde kalır. */
export const fonts = {
  medium: 'Montserrat-Medium',
  semi: 'Montserrat-SemiBold',
  bold: 'Montserrat-Bold',
  xbold: 'Montserrat-ExtraBold',
};

/** Altın parlama: odaklanan öğelere. (Android'de elevation, iOS'ta shadow* kullanılır.) */
export const goldGlow = {
  shadowColor: '#D4AF37',
  shadowOpacity: 0.55,
  shadowRadius: 14,
  shadowOffset: {width: 0, height: 0},
  elevation: 10,
};

export const ROW_HEIGHT = 64;
