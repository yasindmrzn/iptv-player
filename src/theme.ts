import {brand} from './brand';

/** Marka paleti (brand.ts). Tüm ekranlar bu belirteçleri (design tokens) kullanır. */
const p = brand.palette;

export const colors = {
  bg: p.bg,
  surface: p.surface,
  surfaceAlt: p.surfaceAlt,
  border: p.border,
  text: p.text,
  textDim: p.textDim,
  textFaint: p.textFaint,
  accent: p.accent,
  accentSoft: p.accentSoft,
  onAccent: p.onAccent,
  gold: p.gold,
  goldBright: p.goldBright,
  live: '#ff3b30',
  fav: p.gold,
  danger: '#ff6b81',
  // Cam (glassmorphism) yüzeyleri: yarı saydam beyaz + ince hat
  glass: 'rgba(255,255,255,0.06)',
  glassStrong: p.glassStrong,
  glassBorder: 'rgba(255,255,255,0.12)',
  scrim: p.scrim,
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
  shadowColor: p.gold,
  shadowOpacity: 0.55,
  shadowRadius: 14,
  shadowOffset: {width: 0, height: 0},
  elevation: 10,
};

export const ROW_HEIGHT = 64;
