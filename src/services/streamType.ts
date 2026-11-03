import type {PlayerEngine, StreamKind} from '../types';

/** URL'den yayın türünü tahmin eder (sorgu/parça ve "|başlık" kısımları atılır). */
export function detectStreamKind(rawUrl: string): StreamKind {
  const url = rawUrl.split('|')[0].trim();
  const lower = url.toLowerCase();

  if (/^rtmp[a-z]*:\/\//.test(lower)) {
    return 'rtmp';
  }
  if (/^rtsps?:\/\//.test(lower)) {
    return 'rtsp';
  }

  const path = lower.replace(/^[a-z]+:\/\/[^/]+/, '').split(/[?#]/)[0];

  if (path.endsWith('.m3u8') || path.endsWith('.m3u')) {
    return 'hls';
  }
  if (path.endsWith('.mpd')) {
    return 'dash';
  }
  if (path.endsWith('.ts')) {
    return 'ts';
  }
  if (/\.(mkv|avi|flv|wmv)$/.test(path)) {
    return 'file';
  }
  if (/\.(mp4|m4v|webm|mov|mp3|aac|m4a|ogg|flac)$/.test(path)) {
    return 'progressive';
  }
  return 'unknown';
}

/**
 * react-native-video'nun `source.type` değeri. Yalnızca uzantıdan çıkarım
 * yapılamayan/yanlış çıkarılabilen durumlarda verilir.
 */
export function nativeSourceType(kind: StreamKind): string | undefined {
  switch (kind) {
    case 'hls':
      return 'm3u8';
    case 'dash':
      return 'mpd';
    default:
      return undefined;
  }
}

/** Tek seferlik dosya (film/bölüm): sonu normaldir, canlı yayın gibi yeniden bağlanılmaz. */
export const isFileKind = (kind: StreamKind) =>
  kind === 'progressive' || kind === 'file';

/**
 * Hangi oynatıcı motoru ilk denenir?
 *
 *  - native: Android → ExoPlayer (Media3, MediaCodec donanım çözücü),
 *            iOS → AVPlayer (VideoToolbox donanım çözücü)
 *  - vlc:    libVLC / MobileVLCKit — RTMP, RTSP, ham TS, iOS'ta DASH,
 *            DTS vb. ExoPlayer/AVPlayer'ın karşılamadığı durumlar
 */
export function chooseEngine(
  kind: StreamKind,
  os: 'android' | 'ios' | string,
): PlayerEngine {
  if (kind === 'rtmp' || kind === 'rtsp') {
    return 'vlc';
  }
  if (os === 'ios' && (kind === 'dash' || kind === 'ts' || kind === 'file')) {
    return 'vlc';
  }
  return 'native';
}
