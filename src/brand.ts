import {NativeModules} from 'react-native';

/**
 * Tek kod tabanından iki uygulama: PashaPlay (siyah/altın) ve ParisPlayer (lacivert-mavi/Eyfel).
 * Hangisi olduğu derleme sırasında (Gradle productFlavor → BuildConfig.BRAND) belirlenir
 * ve Immersive native modülünün sabiti olarak JS'e gelir.
 */
export type BrandId = 'pasha' | 'paris';

type Palette = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textDim: string;
  textFaint: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  gold: string;
  goldBright: string;
  glassStrong: string;
  scrim: string;
  glowRgb: string;
};

export type Brand = {
  id: BrandId;
  name: string;
  tagline: string;
  whatsapp: string;
  email?: string;
  /** Sabit sunucu adresi: verilirse girişte sunucu alanı gösterilmez */
  server?: string;
  /** Eyfel Kulesi çizimlerini göster */
  eiffel: boolean;
  palette: Palette;
};

const BRANDS: Record<BrandId, Brand> = {
  pasha: {
    id: 'pasha',
    name: 'PASHAPLAY',
    tagline: 'PREMIUM TV',
    whatsapp: '+44 7853 701384',
    email: 'pashaservers@gmail.com',
    eiffel: false,
    palette: {
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
      glassStrong: 'rgba(20,20,20,0.82)',
      scrim: 'rgba(11,11,11,0.72)',
      glowRgb: '212,175,55',
    },
  },
  paris: {
    id: 'paris',
    name: 'PARISPLAYER',
    tagline: 'PARİS · PREMIUM TV',
    whatsapp: '+90 505 660 08 31',
    server: 'http://parispanel.shop:8080',
    eiffel: true,
    palette: {
      bg: '#060b16',
      surface: '#0d1526',
      surfaceAlt: '#14203a',
      border: '#22325a',
      text: '#f2f6ff',
      textDim: '#9fb0d0',
      textFaint: '#62759c',
      accent: '#2F7BFF',
      accentSoft: 'rgba(47,123,255,0.20)',
      onAccent: '#ffffff',
      gold: '#4C9AFF',
      goldBright: '#A8CCFF',
      glassStrong: 'rgba(13,21,38,0.86)',
      scrim: 'rgba(6,11,22,0.72)',
      glowRgb: '76,154,255',
    },
  },
};

const native = NativeModules.Immersive as {brand?: string} | undefined;
export const brand: Brand = BRANDS[native?.brand === 'paris' ? 'paris' : 'pasha'];
