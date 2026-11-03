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
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Orientation from 'react-native-orientation-locker';
import Video, {
  ResizeMode,
  ViewType,
  type OnBufferData,
  type OnVideoErrorData,
  type ReactVideoSource,
  type VideoRef,
} from 'react-native-video';
import {VLCPlayer} from 'react-native-vlc-media-player';

import {colors, fonts} from '../theme';
import type {Channel, PlayerEngine} from '../types';
import {
  chooseEngine,
  detectStreamKind,
  isFileKind,
  nativeSourceType,
} from '../services/streamType';

type Status = 'loading' | 'buffering' | 'playing' | 'error';

type Props = {
  channel: Channel | null;
  /** Dışarıdan duraklatma (ör. uygulama arka plana geçince) */
  paused?: boolean;
  /** Film/bölüm modu: sarma çubuğu gösterilir, "CANLI" rozeti gizlenir */
  vod?: boolean;
  onStatusChange?: (status: Status) => void;
  /** Tam ekran kopyası olarak çalışıyor (Modal içinde) */
  fullscreenMode?: boolean;
  /** Film/bölüm: bu saniyeden başla (tam ekrana/ekrandan geçişte kaldığı yerden devam) */
  startAt?: number;
  onExitFullscreen?: (positionSec: number) => void;
};

const MAX_AUTO_RETRY = 3;
/** İlk kare / oynatma bu süre içinde başlamazsa motor hatası sayılır */
const START_TIMEOUT_MS = 20000;
const CONTROLS_HIDE_MS = 3500;

/**
 * Donmayı önlemek için geniş tamponlar (react-native-video → source.bufferConfig;
 * Android'de Media3 ExoPlayer DefaultLoadControl'e iletilir).
 * Canlı: uzun ön tampon + canlı kenardan geride durma (targetOffset) = ağ dalgalanmasına dayanıklı.
 * Bedel: kanal açılışı birkaç yüz ms uzar, canlı yayın ~15 sn geriden gelir.
 */
const LIVE_BUFFER = {
  minBufferMs: 30000,
  maxBufferMs: 60000,
  bufferForPlaybackMs: 2500,
  bufferForPlaybackAfterRebufferMs: 6000,
  backBufferDurationMs: 0,
  cacheSizeMB: 0,
  live: {
    targetOffsetMs: 15000,
    minOffsetMs: 8000,
    maxOffsetMs: 40000,
    minPlaybackSpeed: 0.96,
    maxPlaybackSpeed: 1.04,
  },
} as const;

const VOD_BUFFER = {
  minBufferMs: 40000,
  maxBufferMs: 120000,
  bufferForPlaybackMs: 2500,
  bufferForPlaybackAfterRebufferMs: 8000,
  backBufferDurationMs: 30000,
  cacheSizeMB: 0,
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

function buildVlcOptions(ch: Channel, vod: boolean): string[] {
  const opts = [
    `--network-caching=${vod ? 8000 : 6000}`,
    `--live-caching=${vod ? 8000 : 6000}`,
    '--file-caching=3000',
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

function VideoPlayerBase({
  channel,
  paused: externalPaused,
  vod = false,
  onStatusChange,
  fullscreenMode = false,
  startAt = 0,
  onExitFullscreen,
}: Props) {
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
  const [fsOpen, setFsOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [position, setPosition] = useState(0); // sn (yalnızca vod)
  const [duration, setDuration] = useState(0); // sn (yalnızca vod)
  const [vlcSeek, setVlcSeek] = useState<number | undefined>(undefined);
  const [barWidth, setBarWidth] = useState(0);
  const nativeRef = useRef<VideoRef>(null);
  const resumeRef = useRef(startAt);
  const positionRef = useRef(0);

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
    resumeRef.current = startAt;
    engineRef.current = initialEngine;
    setEngine(initialEngine);
    // Not: Video/VLC bileşenlerinin key'i kanal kimliğini içerdiğinden kanal
    // değişince zaten yeniden kurulur; burada ayrıca `attempt` artırılmaz
    // (aksi halde her kanal geçişinde oynatıcı iki kez başlatılırdı).
    setErrorText(null);
    setUserPaused(false);
    setPosition(0);
    setDuration(0);
    setVlcSeek(undefined);
    statusRef.current = 'loading';
    setStatus('loading');
    onStatusChange?.('loading');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id, channel?.url]);

  useEffect(
    () => () => {
      if (!fullscreenMode) {
        Orientation.lockToPortrait();
      }
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
        updateStatus('loading');
        return;
      }
      // 2) Aynı motorla artan beklemeyle yeniden dene
      if (retryCount.current < MAX_AUTO_RETRY) {
        const delay = 1000 * 2 ** retryCount.current;
        retryCount.current += 1;
        updateStatus('loading');
        if (retryTimer.current) {
          clearTimeout(retryTimer.current);
        }
        retryTimer.current = setTimeout(() => setAttempt(a => a + 1), delay);
        return;
      }
      // 3) Pes et
      setErrorText(reason);
        updateStatus('error');
    },
    [channel, updateStatus],
  );

  // ── Başlatma zaman aşımı bekçisi ───────────────────────────────────────
  useEffect(() => {
    if (!channel || fsOpen) {
      return;
    }
    const t = setTimeout(() => {
      if (statusRef.current !== 'playing' && statusRef.current !== 'error') {
        handleFailure('Yayın zamanında başlamadı.');
      }
    }, vod ? START_TIMEOUT_MS * 2 : START_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [channel, attempt, engine, handleFailure, vod, fsOpen]);

  const markPlaying = useCallback(() => {
    retryCount.current = 0;
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
      bufferConfig: vod ? VOD_BUFFER : LIVE_BUFFER,
    };
  }, [channel, kind, vod]);

  const vlcSource = useMemo(() => {
    if (!channel) {
      return undefined;
    }
    return {
      uri: channel.url.split('|')[0],
      initType: 2 as const,
      initOptions: buildVlcOptions(channel, vod),
    };
  }, [channel, vod]);

  const paused = userPaused || !!externalPaused;
  const resizeMode = ResizeMode.CONTAIN;

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
    if (!isFileKind(kind)) {
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

  const enterFullscreen = () => {
    Orientation.lockToLandscape();
    setFsOpen(true);
  };
  const leaveFullscreen = (pos: number) => {
    Orientation.lockToPortrait();
    resumeRef.current = vod ? pos : 0;
    setFsOpen(false);
    setAttempt(a => a + 1); // canlıda yayına yeniden bağlan, filmde kaldığı yerden devam et
  };
  const toggleFullscreen = () => {
    if (fullscreenMode) {
      onExitFullscreen?.(positionRef.current);
    } else {
      enterFullscreen();
    }
  };

  const seekTo = (sec: number) => {
    const t = Math.max(0, duration > 0 ? Math.min(duration - 1, sec) : sec);
    setPosition(t);
    if (engineRef.current === 'native') {
      nativeRef.current?.seek(t);
    } else if (duration > 0) {
      setVlcSeek(t / duration);
    }
    showControls();
  };

  // ── Görünüm ────────────────────────────────────────────────────────────
  if (!channel) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.emptyTitle}>Bir kanal seçin</Text>
      </View>
    );
  }

  const isBusy = status === 'loading' || status === 'buffering';

  return (
    <View style={fullscreenMode ? styles.containerFull : styles.container}>
      {fsOpen ? null : engine === 'native' ? (
        <Video
          ref={nativeRef}
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
          progressUpdateInterval={vod ? 500 : 2000}
          automaticallyWaitsToMinimizeStalling
          preferredForwardBufferDuration={30}
          onLoadStart={() => updateStatus('loading')}
          onReadyForDisplay={markPlaying}
          onBuffer={onNativeBuffer}
          onLoad={d => {
            if (vod) {
              setDuration(d.duration);
              if (resumeRef.current > 1) {
                nativeRef.current?.seek(resumeRef.current);
                resumeRef.current = 0;
              }
            }
          }}
          onProgress={p => {
            if (vod) {
              setPosition(p.currentTime);
              positionRef.current = p.currentTime;
            }
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
          resizeMode="contain"
          autoplay
          autoAspectRatio
          seek={vlcSeek}
          onBuffering={() => {
            if (statusRef.current !== 'playing') {
              updateStatus('buffering');
            }
          }}
          onPlaying={markPlaying}
          onProgress={e => {
            if (vod) {
              // Kütüphane süreyi sürüme göre sn ya da ms verebilir: büyük değer ms sayılır
              const dur = e.duration > 100000 ? e.duration / 1000 : e.duration;
              setDuration(dur);
              setPosition(e.position * dur);
              positionRef.current = e.position * dur;
              if (resumeRef.current > 1 && dur > 0) {
                setVlcSeek(resumeRef.current / dur);
                resumeRef.current = 0;
              }
            }
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
          <ActivityIndicator size="large" color={colors.gold} />
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
          <Pressable style={styles.primaryBtn} onPress={manualRetry}>
            <Text style={styles.primaryBtnText}>Tekrar dene</Text>
          </Pressable>
        </View>
      )}

      {/* Üst rozetler */}
      <View pointerEvents="none" style={styles.topBar}>
        {vod ? (
          <View />
        ) : (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>CANLI</Text>
          </View>
        )}
      </View>

      {/* Alt kontroller */}
      {controlsVisible && status !== 'error' && (
        <View style={styles.bottomBar}>
          {vod && (
            <View style={styles.seekRow}>
              <Text style={styles.timeText}>{formatTime(position)}</Text>
              <Pressable
                style={styles.seekTrack}
                onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
                onPress={e => {
                  if (barWidth > 0 && duration > 0) {
                    seekTo((e.nativeEvent.locationX / barWidth) * duration);
                  }
                }}>
                <View style={styles.seekBg}>
                  <View
                    style={[
                      styles.seekFill,
                      {width: `${duration > 0 ? Math.min(100, (position / duration) * 100) : 0}%`},
                    ]}
                  />
                </View>
              </Pressable>
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>
          )}
          <View style={styles.controlsRow}>
            <View style={styles.row}>
              <CtrlButton
                label={paused ? '▶' : '❚❚'}
                onPress={() => {
                  setUserPaused(p => !p);
                  showControls();
                }}
              />
              {vod && <CtrlButton label="−10" onPress={() => seekTo(position - 10)} />}
              {vod && <CtrlButton label="+10" onPress={() => seekTo(position + 10)} />}
              <CtrlButton
                label={muted ? '🔇' : '🔊'}
                onPress={() => {
                  setMuted(m => !m);
                  showControls();
                }}
              />
            </View>
            <CtrlButton label={fullscreenMode ? '⤡' : '⤢'} onPress={toggleFullscreen} />
          </View>
        </View>
      )}

      {/* Tam ekran: yatay Modal içinde ikinci bir oynatıcı; satır içi olan susturulur */}
      {!fullscreenMode && (
        <Modal
          visible={fsOpen}
          animationType="fade"
          supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}
          statusBarTranslucent
          onRequestClose={() => leaveFullscreen(positionRef.current)}>
          <StatusBar hidden />
          <View style={styles.fsRoot}>
            {fsOpen ? (
              <VideoPlayer
                channel={channel}
                vod={vod}
                fullscreenMode
                startAt={vod ? positionRef.current : 0}
                onExitFullscreen={leaveFullscreen}
                onStatusChange={onStatusChange}
              />
            ) : null}
          </View>
        </Modal>
      )}
    </View>
  );
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) {
    return '0:00';
  }
  const t = Math.floor(sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
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
  containerFull: {flex: 1, width: '100%', backgroundColor: '#000', overflow: 'hidden'},
  fsRoot: {flex: 1, backgroundColor: '#000'},
  controlsRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  center: {alignItems: 'center', justifyContent: 'center'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  emptyTitle: {color: '#fff', fontSize: 16, fontFamily: fonts.semi},
  errorBg: {backgroundColor: 'rgba(0,0,0,0.78)', paddingHorizontal: 24},
  errorTitle: {color: '#fff', fontSize: 16, fontFamily: fonts.bold},
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
  primaryBtnText: {color: colors.onAccent, fontFamily: fonts.semi, fontSize: 14},
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
  liveText: {color: '#fff', fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.6},
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
  ctrl: {
    minWidth: 40,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(212,175,55,0.26)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  ctrlWide: {paddingHorizontal: 14},
  ctrlPressed: {backgroundColor: 'rgba(212,175,55,0.55)'},
  ctrlText: {color: '#fff', fontSize: 13, fontFamily: fonts.semi},
  seekRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  seekTrack: {
    flex: 1,
    height: 22,
    justifyContent: 'center',
  },
  seekBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  seekFill: {height: 4, backgroundColor: colors.gold},
  timeText: {
    color: '#e8e0f8',
    fontSize: 11,
    minWidth: 38,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
