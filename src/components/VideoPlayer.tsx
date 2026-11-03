import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Video, {
  ResizeMode,
  ViewType,
  type OnBufferData,
  type OnVideoErrorData,
  type ReactVideoSource,
} from 'react-native-video';
import {VLCPlayer} from 'react-native-vlc-media-player';

import {colors} from '../theme';
import type {Channel, PlayerEngine} from '../types';
import {
  chooseEngine,
  detectStreamKind,
  nativeSourceType,
} from '../services/streamType';

type Status = 'loading' | 'buffering' | 'playing' | 'error';

type Props = {
  channel: Channel | null;
  /** Dışarıdan duraklatma (ör. uygulama arka plana geçince) */
  paused?: boolean;
  onStatusChange?: (status: Status) => void;
};

const MAX_AUTO_RETRY = 3;
/** İlk kare / oynatma bu süre içinde başlamazsa motor hatası sayılır */
const START_TIMEOUT_MS = 20000;
const CONTROLS_HIDE_MS = 3500;

const NATIVE_LABEL = Platform.OS === 'ios' ? 'AVPlayer' : 'ExoPlayer';

/**
 * Canlı yayın için ayarlanmış tamponlar (react-native-video → source.bufferConfig).
 * Android'de Media3 ExoPlayer DefaultLoadControl'e iletilir.
 */
const BUFFER_CONFIG = {
  minBufferMs: 10000,
  maxBufferMs: 30000,
  bufferForPlaybackMs: 2000,
  bufferForPlaybackAfterRebufferMs: 4000,
  backBufferDurationMs: 0,
  cacheSizeMB: 0,
  live: {
    targetOffsetMs: 8000,
    minOffsetMs: 4000,
    maxOffsetMs: 20000,
    minPlaybackSpeed: 0.97,
    maxPlaybackSpeed: 1.03,
  },
} as const;

function buildHeaders(ch: Channel): Record<string, string> | undefined {
  const h: Record<string, string> = {...(ch.headers ?? {})};
  if (ch.userAgent && !h['User-Agent']) {
    h['User-Agent'] = ch.userAgent;
  }
  if (ch.referrer && !h.Referer) {
    h.Referer = ch.referrer;
  }
  return Object.keys(h).length ? h : undefined;
}

function buildVlcOptions(ch: Channel): string[] {
  const opts = [
    '--network-caching=2000',
    '--live-caching=2000',
    '--http-reconnect',
    '--rtsp-tcp',
    // libVLC: mevcut olan en iyi donanım çözücüyü kullan (MediaCodec / VideoToolbox)
    '--avcodec-hw=any',
  ];
  const ua = ch.userAgent ?? ch.headers?.['User-Agent'];
  const ref = ch.referrer ?? ch.headers?.Referer;
  if (ua) {
    opts.push(`--http-user-agent=${ua}`);
  }
  if (ref) {
    opts.push(`--http-referrer=${ref}`);
  }
  return opts;
}

function VideoPlayerBase({channel, paused: externalPaused, onStatusChange}: Props) {
  const kind = useMemo(
    () => (channel ? detectStreamKind(channel.url) : 'unknown'),
    [channel],
  );

  // Motor seçimi kanala bağlıdır: kanal değiştiği render'da önceki kanalın
  // motoru kullanılmasın diye (gereksiz VLC/ExoPlayer kurulumu) türetilir.
  const channelKey = channel ? `${channel.id}|${channel.url}` : '';
  const channelKeyRef = useRef(channelKey);
  channelKeyRef.current = channelKey;
  const initialEngine: PlayerEngine = channel
    ? chooseEngine(kind, Platform.OS)
    : 'native';
  const [engineState, setEngineState] = useState<{
    key: string;
    engine: PlayerEngine;
  }>({key: '', engine: 'native'});
  const engine =
    engineState.key === channelKey ? engineState.engine : initialEngine;
  const setEngine = useCallback(
    (e: PlayerEngine) => setEngineState({key: channelKeyRef.current, engine: e}),
    [],
  );

  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0); // Video bileşenini yeniden kurmak için
  const [userPaused, setUserPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [fill, setFill] = useState(false); // false: sığdır, true: doldur
  const [controlsVisible, setControlsVisible] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const retryCount = useRef(0);
  const triedFallback = useRef(false);
  const statusRef = useRef<Status>('loading');
  const engineRef = useRef<PlayerEngine>('native');
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateStatus = useCallback(
    (s: Status) => {
      if (statusRef.current !== s) {
        statusRef.current = s;
        setStatus(s);
        onStatusChange?.(s);
      }
    },
    [onStatusChange],
  );

  // ── Kanal değişince her şeyi sıfırla ────────────────────────────────────
  useEffect(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
    }
    retryCount.current = 0;
    triedFallback.current = false;
    engineRef.current = initialEngine;
    setEngine(initialEngine);
    // Not: Video/VLC bileşenlerinin key'i kanal kimliğini içerdiğinden kanal
    // değişince zaten yeniden kurulur; burada ayrıca `attempt` artırılmaz
    // (aksi halde her kanal geçişinde oynatıcı iki kez başlatılırdı).
    setErrorText(null);
    setNotice(null);
    setUserPaused(false);
    statusRef.current = 'loading';
    setStatus('loading');
    onStatusChange?.('loading');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id, channel?.url]);

  useEffect(
    () => () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
      }
    },
    [],
  );

  // ── Hata yönetimi: önce yedek motor, sonra üstel geri çekilmeyle yeniden dene
  const handleFailure = useCallback(
    (reason: string) => {
      if (!channel) {
        return;
      }
      // 1) ExoPlayer/AVPlayer çözemediyse (ör. DTS, VP8, AV1 yok) VLC'ye geç
      if (engineRef.current === 'native' && !triedFallback.current) {
        triedFallback.current = true;
        engineRef.current = 'vlc';
        setEngine('vlc');
        setAttempt(a => a + 1);
        setNotice('Bu yayın VLC motoruyla açılıyor');
        updateStatus('loading');
        return;
      }
      // 2) Aynı motorla artan beklemeyle yeniden dene
      if (retryCount.current < MAX_AUTO_RETRY) {
        const delay = 1000 * 2 ** retryCount.current;
        retryCount.current += 1;
        updateStatus('loading');
        setNotice(`Yeniden bağlanılıyor (${retryCount.current}/${MAX_AUTO_RETRY})`);
        if (retryTimer.current) {
          clearTimeout(retryTimer.current);
        }
        retryTimer.current = setTimeout(() => setAttempt(a => a + 1), delay);
        return;
      }
      // 3) Pes et
      setErrorText(reason);
      setNotice(null);
      updateStatus('error');
    },
    [channel, updateStatus],
  );

  // ── Başlatma zaman aşımı bekçisi ───────────────────────────────────────
  useEffect(() => {
    if (!channel) {
      return;
    }
    const t = setTimeout(() => {
      if (statusRef.current !== 'playing' && statusRef.current !== 'error') {
        handleFailure('Yayın zamanında başlamadı.');
      }
    }, START_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [channel, attempt, engine, handleFailure]);

  const markPlaying = useCallback(() => {
    retryCount.current = 0;
    setNotice(null);
    updateStatus('playing');
  }, [updateStatus]);

  // ── Kontrollerin otomatik gizlenmesi ───────────────────────────────────
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
    }
    hideTimer.current = setTimeout(
      () => setControlsVisible(false),
      CONTROLS_HIDE_MS,
    );
  }, []);

  const toggleControls = useCallback(() => {
    if (controlsVisible) {
      setControlsVisible(false);
    } else {
      showControls();
    }
  }, [controlsVisible, showControls]);

  const switchEngine = useCallback(() => {
    const next: PlayerEngine = engineRef.current === 'native' ? 'vlc' : 'native';
    engineRef.current = next;
    triedFallback.current = true; // elle seçildi; otomatik geri dönüş döngüsü olmasın
    retryCount.current = 0;
    setEngine(next);
    setAttempt(a => a + 1);
    setErrorText(null);
    updateStatus('loading');
    showControls();
  }, [showControls, updateStatus]);

  const manualRetry = useCallback(() => {
    retryCount.current = 0;
    setErrorText(null);
    setAttempt(a => a + 1);
    updateStatus('loading');
  }, [updateStatus]);

  // ── Kaynaklar ──────────────────────────────────────────────────────────
  const nativeSource = useMemo<ReactVideoSource | undefined>(() => {
    if (!channel) {
      return undefined;
    }
    return {
      uri: channel.url.split('|')[0],
      type: nativeSourceType(kind),
      headers: buildHeaders(channel),
      minLoadRetryCount: 5,
      bufferConfig: BUFFER_CONFIG,
    };
  }, [channel, kind]);

  const vlcSource = useMemo(() => {
    if (!channel) {
      return undefined;
    }
    return {
      uri: channel.url.split('|')[0],
      initType: 2 as const,
      initOptions: buildVlcOptions(channel),
    };
  }, [channel]);

  const paused = userPaused || !!externalPaused;
  const resizeMode = fill ? ResizeMode.COVER : ResizeMode.CONTAIN;

  // ── Oynatıcı olayları ──────────────────────────────────────────────────
  const onNativeBuffer = useCallback(
    ({isBuffering}: OnBufferData) => {
      if (statusRef.current === 'error') {
        return;
      }
      updateStatus(isBuffering ? 'buffering' : 'playing');
    },
    [updateStatus],
  );

  // Canlı yayının "bitmesi" kopma demektir → yeniden bağlan. Tek seferlik
  // dosyalarda (mp4/mkv vb.) bitiş normaldir, yeniden bağlanma döngüsüne girme.
  const onEnded = useCallback(() => {
    if (kind !== 'progressive') {
      handleFailure('Yayın sona erdi.');
    }
  }, [kind, handleFailure]);

  const onNativeError = useCallback(
    (e: OnVideoErrorData) => {
      const err = e.error;
      const msg =
        err.errorString ??
        err.localizedDescription ??
        err.error ??
        'Yayın oynatılamadı.';
      handleFailure(msg);
    },
    [handleFailure],
  );

  // ── Görünüm ────────────────────────────────────────────────────────────
  if (!channel) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.emptyTitle}>Bir kanal seçin</Text>
        <Text style={styles.emptySub}>Listeden dokunarak yayını başlatın</Text>
      </View>
    );
  }

  const isBusy = status === 'loading' || status === 'buffering';

  return (
    <View style={styles.container}>
      {engine === 'native' ? (
        <Video
          key={`n-${channel.id}-${attempt}`}
          style={StyleSheet.absoluteFill}
          source={nativeSource}
          paused={paused}
          muted={muted}
          resizeMode={resizeMode}
          // SurfaceView: donanım katmanında (overlay) çizim, en düşük CPU/GPU yükü
          viewType={ViewType.SURFACE}
          playInBackground={false}
          playWhenInactive={false}
          preventsDisplaySleepDuringVideoPlayback
          progressUpdateInterval={2000}
          automaticallyWaitsToMinimizeStalling
          preferredForwardBufferDuration={10}
          onLoadStart={() => updateStatus('loading')}
          onReadyForDisplay={markPlaying}
          onBuffer={onNativeBuffer}
          onProgress={() => {
            if (statusRef.current !== 'playing' && !paused) {
              markPlaying();
            }
          }}
          onError={onNativeError}
          onEnd={onEnded}
        />
      ) : (
        <VLCPlayer
          key={`v-${channel.id}-${attempt}`}
          style={StyleSheet.absoluteFill}
          source={vlcSource!}
          paused={paused}
          muted={muted}
          resizeMode={fill ? 'cover' : 'contain'}
          autoplay
          autoAspectRatio
          onBuffering={() => {
            if (statusRef.current !== 'playing') {
              updateStatus('buffering');
            }
          }}
          onPlaying={markPlaying}
          onProgress={() => {
            if (statusRef.current !== 'playing' && !paused) {
              markPlaying();
            }
          }}
          onError={() => handleFailure('VLC yayını oynatamadı.')}
          onEnd={onEnded}
        />
      )}

      {/* Dokunma katmanı */}
      <Pressable style={StyleSheet.absoluteFill} onPress={toggleControls} />

      {isBusy && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
          <ActivityIndicator size="large" color="#fff" />
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        </View>
      )}

      {status === 'error' && (
        <View style={[StyleSheet.absoluteFill, styles.center, styles.errorBg]}>
          <Text style={styles.errorTitle}>Yayın açılamadı</Text>
          {errorText ? (
            <Text style={styles.errorSub} numberOfLines={2}>
              {errorText}
            </Text>
          ) : null}
          <View style={styles.row}>
            <Pressable style={styles.primaryBtn} onPress={manualRetry}>
              <Text style={styles.primaryBtnText}>Tekrar dene</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={switchEngine}>
              <Text style={styles.ghostBtnText}>
                {engine === 'native' ? 'VLC ile dene' : `${NATIVE_LABEL} ile dene`}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Üst rozetler */}
      <View pointerEvents="none" style={styles.topBar}>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>CANLI</Text>
        </View>
        {controlsVisible && (
          <View style={styles.engineBadge}>
            <Text style={styles.engineText}>
              {engine === 'vlc' ? 'VLC' : NATIVE_LABEL}
            </Text>
          </View>
        )}
      </View>

      {/* Alt kontroller */}
      {controlsVisible && status !== 'error' && (
        <View style={styles.bottomBar}>
          <Text style={styles.channelName} numberOfLines={1}>
            {channel.name}
          </Text>
          <View style={styles.row}>
            <CtrlButton
              label={paused ? '▶' : '❚❚'}
              onPress={() => {
                setUserPaused(p => !p);
                showControls();
              }}
            />
            <CtrlButton
              label={muted ? '🔇' : '🔊'}
              onPress={() => {
                setMuted(m => !m);
                showControls();
              }}
            />
            <CtrlButton
              label={fill ? 'Sığdır' : 'Doldur'}
              wide
              onPress={() => {
                setFill(f => !f);
                showControls();
              }}
            />
            <CtrlButton
              label={engine === 'native' ? 'VLC' : NATIVE_LABEL}
              wide
              onPress={switchEngine}
            />
          </View>
        </View>
      )}
    </View>
  );
}

function CtrlButton({
  label,
  onPress,
  wide,
}: {
  label: string;
  onPress: () => void;
  wide?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({pressed}) => [
        styles.ctrl,
        wide && styles.ctrlWide,
        pressed && styles.ctrlPressed,
      ]}>
      <Text style={styles.ctrlText}>{label}</Text>
    </Pressable>
  );
}

export const VideoPlayer = memo(VideoPlayerBase);
export default VideoPlayer;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  center: {alignItems: 'center', justifyContent: 'center'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  emptyTitle: {color: '#fff', fontSize: 16, fontWeight: '600'},
  emptySub: {color: colors.textDim, fontSize: 13, marginTop: 4},
  notice: {color: '#d0d0d4', fontSize: 12, marginTop: 10},
  errorBg: {backgroundColor: 'rgba(0,0,0,0.78)', paddingHorizontal: 24},
  errorTitle: {color: '#fff', fontSize: 16, fontWeight: '700'},
  errorSub: {
    color: '#a0a0a6',
    fontSize: 12,
    marginTop: 6,
    marginBottom: 14,
    textAlign: 'center',
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryBtnText: {color: '#fff', fontWeight: '600', fontSize: 14},
  ghostBtn: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.textFaint,
  },
  ghostBtnText: {color: '#e5e5e8', fontWeight: '500', fontSize: 14},
  topBar: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 5,
  },
  liveDot: {width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live},
  liveText: {color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.6},
  engineBadge: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  engineText: {color: '#c8c8cc', fontSize: 11, fontWeight: '600'},
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 22,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    gap: 8,
  },
  channelName: {color: '#fff', fontSize: 14, fontWeight: '600'},
  ctrl: {
    minWidth: 40,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(139,92,246,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  ctrlWide: {paddingHorizontal: 14},
  ctrlPressed: {backgroundColor: 'rgba(139,92,246,0.55)'},
  ctrlText: {color: '#fff', fontSize: 13, fontWeight: '600'},
});
