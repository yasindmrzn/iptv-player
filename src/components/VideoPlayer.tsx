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
  Animated,
  Platform,
  Pressable,
  ScrollView,
  type GestureResponderEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Orientation from 'react-native-orientation-locker';
import Video, {
  ResizeMode,
  SelectedTrackType,
  ViewType,
  type OnBufferData,
  type OnAudioTracksData,
  type OnTextTracksData,
  type OnVideoErrorData,
  type ReactVideoSource,
  type VideoRef,
} from 'react-native-video';
import {VLCPlayer} from 'react-native-vlc-media-player';

import {useFullscreenStore} from '../store/useFullscreenStore';
import {colors, fonts} from '../theme';
import {registerBack} from '../utils/backStack';
import {setImmersive} from '../utils/immersive';
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
  const [audioTracks, setAudioTracks] = useState<SubTrack[]>([]);
  const [audioSel, setAudioSel] = useState<number | null>(null); // null = varsayılan
  const [scrub, setScrub] = useState<number | null>(null); // 0..1, sürüklerken
  const [flash, setFlash] = useState<{side: 'l' | 'r'; id: number} | null>(null);
  const ctl = useRef(new Animated.Value(1)).current;
  const pausedRef = useRef(false);
  const menuRef = useRef(false);
  const lastTap = useRef({t: 0, side: 'c' as 'l' | 'c' | 'r'});
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fsOpen, setFsOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [position, setPosition] = useState(0); // sn (yalnızca vod)
  const [duration, setDuration] = useState(0); // sn (yalnızca vod)
  const [textTracks, setTextTracks] = useState<SubTrack[]>([]);
  const [subSel, setSubSel] = useState<number | null>(null); // null = kapalı
  const [subMenu, setSubMenu] = useState(false);
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
    setTextTracks([]);
    setAudioTracks([]);
    setAudioSel(null);
    setSubSel(null);
    setSubMenu(false);
    statusRef.current = 'loading';
    setStatus('loading');
    onStatusChange?.('loading');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id, channel?.url]);

  useEffect(
    () => () => {
      if (!fullscreenMode) {
        Orientation.lockToPortrait();
        setImmersive(false);
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

  useEffect(() => {
    if (!fullscreenMode) {
      return;
    }
    return registerBack(() => onExitFullscreen?.(positionRef.current));
  }, [fullscreenMode, onExitFullscreen]);

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
    hideTimer.current = setTimeout(() => {
      if (!pausedRef.current && !menuRef.current) {
        setControlsVisible(false);
      }
    }, CONTROLS_HIDE_MS);
  }, []);

  useEffect(() => {
    Animated.timing(ctl, {
      toValue: controlsVisible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [controlsVisible, ctl]);

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
    if (!channel) {
      return;
    }
    Orientation.lockToLandscape();
    setImmersive(true);
    setFsOpen(true);
    useFullscreenStore.getState().open({
      channel,
      vod,
      startAt: vod ? positionRef.current : 0,
      onExit: leaveFullscreen,
    });
  };
  const leaveFullscreen = (pos: number) => {
    useFullscreenStore.getState().close();
    setImmersive(false);
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

  // Altyazı: Türkçe varsa otomatik aç; yoksa kapalı bırak, kullanıcı seçsin
  const applyTracks = useCallback((list: SubTrack[]) => {
    setTextTracks(list);
    if (!vod) {
      return;
    }
    const tr = list.find(t => /^(tr|tur)|türk|turk/i.test(t.language ?? t.label));
    setSubSel(cur => (cur != null ? cur : tr ? tr.key : null));
  }, [vod]);

  const onNativeTextTracks = useCallback(
    ({textTracks: tt}: OnTextTracksData) => {
      applyTracks(
        tt.map(t => ({
          key: t.index,
          label: subLabel(t.title, t.language, t.index, 'Altyazı'),
          language: t.language ?? t.title,
        })),
      );
    },
    [applyTracks],
  );

  const onNativeAudioTracks = useCallback(({audioTracks: at}: OnAudioTracksData) => {
    setAudioTracks(
      at.map(t => ({
        key: t.index,
        label: subLabel(t.title, t.language, t.index, 'Ses'),
        language: t.language ?? t.title,
        selected: t.selected,
      })),
    );
  }, []);

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
  const hasTracks = textTracks.length > 0 || audioTracks.length > 0;
  const showTrackBtn = vod || hasTracks;
  const frac =
    scrub != null ? scrub : duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const shownPos = scrub != null ? scrub * duration : position;

  pausedRef.current = paused;
  menuRef.current = subMenu;

  const togglePlay = () => {
    setUserPaused(p => !p);
    showControls();
  };

  // Netflix gibi: tek dokunuş arayüzü açar/kapatır, ekranın sol/sağında çift dokunuş ±10 sn sarar
  const onZoneTap = (side: 'l' | 'c' | 'r') => {
    const now = Date.now();
    const dbl = now - lastTap.current.t < 320 && lastTap.current.side === side;
    lastTap.current = {t: now, side};
    if (dbl && vod && side !== 'c') {
      seekTo(position + (side === 'r' ? 10 : -10));
      setFlash({side, id: now});
      if (flashTimer.current) {
        clearTimeout(flashTimer.current);
      }
      flashTimer.current = setTimeout(() => setFlash(null), 650);
    } else if (controlsVisible) {
      setControlsVisible(false);
    } else {
      showControls();
    }
  };

  const scrubFrom = (e: GestureResponderEvent) => {
    if (barWidth > 0) {
      setScrub(Math.min(1, Math.max(0, e.nativeEvent.locationX / barWidth)));
    }
  };

  return (
    <View style={fullscreenMode ? styles.containerFull : styles.container}>
      {fsOpen ? null : engine === 'native' ? (
        <Video
          ref={nativeRef}
          key={`n-${channel.id}-${attempt}`}
          style={FILL}
          source={nativeSource}
          paused={paused}
          resizeMode={resizeMode}
          // SurfaceView: donanım katmanında (overlay) çizim, en düşük CPU/GPU yükü
          viewType={ViewType.SURFACE}
          playInBackground={false}
          playWhenInactive={false}
          preventsDisplaySleepDuringVideoPlayback
          progressUpdateInterval={vod ? 500 : 2000}
          automaticallyWaitsToMinimizeStalling
          preferredForwardBufferDuration={30}
          selectedTextTrack={
            subSel == null
              ? {type: SelectedTrackType.DISABLED}
              : {type: SelectedTrackType.INDEX, value: subSel}
          }
          selectedAudioTrack={
            audioSel == null ? undefined : {type: SelectedTrackType.INDEX, value: audioSel}
          }
          onTextTracks={onNativeTextTracks}
          onAudioTracks={onNativeAudioTracks}
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
          style={FILL}
          source={vlcSource!}
          paused={paused}
          resizeMode="contain"
          autoplay
          autoAspectRatio
          seek={vlcSeek}
          textTrack={subSel == null ? -1 : subSel}
          audioTrack={audioSel ?? undefined}
          onLoad={e => {
            applyTracks(
              (e.textTracks ?? []).map(t => ({
                key: t.id,
                label: subLabel(t.name, undefined, t.id, 'Altyazı'),
                language: t.name,
              })),
            );
            setAudioTracks(
              (e.audioTracks ?? []).map(t => ({
                key: t.id,
                label: subLabel(t.name, undefined, t.id, 'Ses'),
                language: t.name,
              })),
            );
          }}
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

      {/* Dokunma bölgeleri: sol / orta / sağ */}
      <View style={styles.zones}>
        <Pressable style={styles.zoneSide} onPress={() => onZoneTap('l')} />
        <Pressable style={styles.zoneMid} onPress={() => onZoneTap('c')} />
        <Pressable style={styles.zoneSide} onPress={() => onZoneTap('r')} />
      </View>

      {flash && (
        <View
          pointerEvents="none"
          style={[styles.flash, flash.side === 'l' ? styles.flashL : styles.flashR]}>
          <Text style={styles.flashText}>{flash.side === 'l' ? '« 10' : '10 »'}</Text>
        </View>
      )}

      {isBusy && (
        <View pointerEvents="none" style={[FILL, styles.center]}>
          <ActivityIndicator size="large" color={colors.gold} />
        </View>
      )}

      {status === 'error' && (
        <View style={[FILL, styles.center, styles.errorBg]}>
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

      {/* Netflix tarzı arayüz: üst/alt karartma, ortada büyük oynat-duraklat, altta ince ilerleme çizgisi */}
      {status !== 'error' && (
        <Animated.View
          style={[FILL, {opacity: ctl}]}
          pointerEvents={controlsVisible ? 'box-none' : 'none'}>
          <Shade edge="top" />
          <Shade edge="bottom" />

          <View style={styles.topBar} pointerEvents="box-none">
            {fullscreenMode ? (
              <Pressable onPress={toggleFullscreen} hitSlop={12} style={styles.backHit}>
                <Text style={styles.backGlyph}>‹</Text>
                <Text style={styles.topTitle} numberOfLines={1}>
                  {channel.name}
                </Text>
              </Pressable>
            ) : (
              <View />
            )}
            {!vod && (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>CANLI</Text>
              </View>
            )}
          </View>

          <View style={styles.centerRow} pointerEvents="box-none">
            {vod && (
              <Pressable onPress={() => seekTo(position - 10)} style={styles.skipBtn} hitSlop={8}>
                <Text style={styles.skipText}>« 10</Text>
              </Pressable>
            )}
            <Pressable onPress={togglePlay} style={styles.playBtn}>
              {paused ? <PlayIcon /> : <PauseIcon />}
            </Pressable>
            {vod && (
              <Pressable onPress={() => seekTo(position + 10)} style={styles.skipBtn} hitSlop={8}>
                <Text style={styles.skipText}>10 »</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.bottom} pointerEvents="box-none">
            {vod && (
              <View style={styles.seekRow}>
                <Text style={styles.timeText}>{formatTime(shownPos)}</Text>
                <View
                  style={styles.seekTrack}
                  onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderTerminationRequest={() => false}
                  onResponderGrant={e => {
                    scrubFrom(e);
                    if (hideTimer.current) {
                      clearTimeout(hideTimer.current);
                    }
                  }}
                  onResponderMove={scrubFrom}
                  onResponderRelease={() => {
                    if (scrub != null && duration > 0) {
                      seekTo(scrub * duration);
                    }
                    setScrub(null);
                    showControls();
                  }}>
                  <View style={styles.seekBg} pointerEvents="none">
                    <View style={[styles.seekFill, {width: `${frac * 100}%`}]} />
                  </View>
                  <View
                    pointerEvents="none"
                    style={[
                      styles.thumb,
                      scrub != null && styles.thumbBig,
                      {left: `${frac * 100}%`},
                    ]}
                  />
                </View>
                <Text style={styles.timeText}>
                  {duration > 0 ? `-${formatTime(Math.max(0, duration - shownPos))}` : '--:--'}
                </Text>
              </View>
            )}
            <View style={styles.actionsRow}>
              {showTrackBtn ? (
                <Pressable
                  onPress={() => {
                    setSubMenu(true);
                    showControls();
                  }}
                  style={styles.pill}
                  hitSlop={6}>
                  <View style={[styles.ccBox, subSel != null && styles.ccBoxOn]}>
                    <Text style={[styles.ccText, subSel != null && styles.ccTextOn]}>CC</Text>
                  </View>
                  <Text style={styles.pillText}>Ses ve Altyazı</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable onPress={toggleFullscreen} hitSlop={10} style={styles.fsBtn}>
                <FullscreenIcon exit={fullscreenMode} />
              </Pressable>
            </View>
          </View>
        </Animated.View>
      )}

      {/* Ses ve altyazı seçimi */}
      {showTrackBtn && subMenu && (
        <View style={[FILL, styles.menu]}>
          <Pressable style={FILL} onPress={() => setSubMenu(false)} />
          <View style={styles.menuBody} pointerEvents="box-none">
            <View style={styles.menuCol}>
              <Text style={styles.menuHead}>SES</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {audioTracks.length === 0 && (
                  <TrackRow label="Varsayılan ses" active onPress={() => setSubMenu(false)} />
                )}
                {audioTracks.map(t => (
                  <TrackRow
                    key={t.key}
                    label={t.label}
                    active={audioSel == null ? !!t.selected || audioTracks.length === 1 : audioSel === t.key}
                    onPress={() => {
                      setAudioSel(t.key);
                      setSubMenu(false);
                    }}
                  />
                ))}
              </ScrollView>
            </View>
            <View style={styles.menuDivider} />
            <View style={styles.menuCol}>
              <Text style={styles.menuHead}>ALTYAZI</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                <TrackRow
                  label="Kapalı"
                  active={subSel == null}
                  onPress={() => {
                    setSubSel(null);
                    setSubMenu(false);
                  }}
                />
                {textTracks.map(t => (
                  <TrackRow
                    key={t.key}
                    label={t.label}
                    active={subSel === t.key}
                    onPress={() => {
                      setSubSel(t.key);
                      setSubMenu(false);
                    }}
                  />
                ))}
                {textTracks.length === 0 && (
                  <Text style={styles.subNone}>Altyazı bulunamadı</Text>
                )}
              </ScrollView>
            </View>
          </View>
          <Pressable onPress={() => setSubMenu(false)} hitSlop={12} style={styles.menuClose}>
            <Text style={styles.menuCloseText}>×</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const FILL = {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0} as const;

type SubTrack = {key: number; label: string; language?: string; selected?: boolean};

const LANGS: Record<string, string> = {
  tr: 'Türkçe', tur: 'Türkçe', en: 'İngilizce', eng: 'İngilizce', de: 'Almanca', ger: 'Almanca',
  deu: 'Almanca', fr: 'Fransızca', fre: 'Fransızca', fra: 'Fransızca', ar: 'Arapça', ara: 'Arapça',
  ru: 'Rusça', rus: 'Rusça', es: 'İspanyolca', spa: 'İspanyolca', it: 'İtalyanca', ita: 'İtalyanca',
};

function subLabel(
  title: string | undefined,
  lang: string | undefined,
  i: number,
  fallback: string,
): string {
  const l = lang ? LANGS[lang.toLowerCase()] ?? lang.toUpperCase() : undefined;
  if (l && title && !title.toLowerCase().includes(l.toLowerCase().slice(0, 3))) {
    return `${l} · ${title}`;
  }
  return l ?? title ?? `${fallback} ${i + 1}`;
}

function TrackRow({label, active, onPress}: {label: string; active: boolean; onPress: () => void}) {
  return (
    <Pressable onPress={onPress} style={styles.trackRow} hitSlop={2}>
      <Text style={[styles.trackCheck, !active && styles.trackCheckOff]}>✓</Text>
      <Text style={[styles.trackText, active && styles.trackTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Üst/alt karartma: gradyan kütüphanesi olmadan, artan opaklıkta üst üste şeritler. */
function Shade({edge}: {edge: 'top' | 'bottom'}) {
  const steps = [0.03, 0.07, 0.12, 0.2, 0.3];
  const layers = edge === 'top' ? steps : [...steps].reverse();
  return (
    <View
      pointerEvents="none"
      style={[styles.shade, edge === 'top' ? {top: 0} : {bottom: 0}]}>
      {layers.map((a, i) => (
        <View key={i} style={{flex: 1, backgroundColor: `rgba(0,0,0,${a})`}} />
      ))}
    </View>
  );
}

// Simgeler View ile çizilir: cihaz fontuna bağlı olmadan her yerde aynı görünür.
function PlayIcon() {
  return <View style={styles.playTri} />;
}
function PauseIcon() {
  return (
    <View style={styles.pauseWrap}>
      <View style={styles.pauseBar} />
      <View style={styles.pauseBar} />
    </View>
  );
}
function FullscreenIcon({exit}: {exit?: boolean}) {
  return (
    <View style={styles.fsOuter}>
      <View style={exit ? styles.fsInnerExit : styles.fsInner} />
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
  center: {alignItems: 'center', justifyContent: 'center'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  emptyTitle: {color: '#fff', fontSize: 16, fontFamily: fonts.semi},
  errorBg: {backgroundColor: 'rgba(0,0,0,0.78)', paddingHorizontal: 24},
  errorTitle: {color: '#fff', fontSize: 16, fontFamily: fonts.bold},
  errorSub: {color: '#a0a0a6', fontSize: 12, marginTop: 6, marginBottom: 14, textAlign: 'center'},
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryBtnText: {color: colors.onAccent, fontFamily: fonts.semi, fontSize: 14},

  zones: {...FILL, flexDirection: 'row'},
  zoneSide: {flex: 1},
  zoneMid: {flex: 1.1},
  flash: {
    position: 'absolute',
    top: '30%',
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashL: {left: '12%'},
  flashR: {right: '12%'},
  flashText: {color: '#fff', fontSize: 18, fontFamily: fonts.bold},

  shade: {position: 'absolute', left: 0, right: 0, height: '30%'},
  topBar: {
    position: 'absolute',
    top: 8,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backHit: {flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1},
  backGlyph: {color: '#fff', fontSize: 34, marginTop: -4},
  topTitle: {color: '#fff', fontSize: 16, fontFamily: fonts.bold, flexShrink: 1},
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

  centerRow: {
    ...FILL,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 34,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTri: {
    marginLeft: 5,
    width: 0,
    height: 0,
    borderTopWidth: 11,
    borderBottomWidth: 11,
    borderLeftWidth: 18,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.gold,
  },
  pauseWrap: {flexDirection: 'row', gap: 6},
  pauseBar: {width: 6, height: 22, borderRadius: 2, backgroundColor: colors.gold},
  skipBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {color: '#fff', fontSize: 12, fontFamily: fonts.bold},

  bottom: {position: 'absolute', left: 14, right: 14, bottom: 8},
  seekRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  seekTrack: {flex: 1, height: 30, justifyContent: 'center'},
  seekBg: {height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden'},
  seekFill: {height: 4, backgroundColor: colors.gold},
  thumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
    backgroundColor: colors.gold,
  },
  thumbBig: {width: 22, height: 22, borderRadius: 11, marginLeft: -11},
  timeText: {
    color: '#e8e8e8',
    fontSize: 11,
    minWidth: 42,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  actionsRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2},
  pill: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingRight: 6},
  ccBox: {
    borderWidth: 1.5,
    borderColor: '#fff',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  ccBoxOn: {borderColor: colors.gold, backgroundColor: colors.gold},
  ccText: {color: '#fff', fontSize: 10, fontFamily: fonts.xbold},
  ccTextOn: {color: colors.onAccent},
  pillText: {color: '#fff', fontSize: 12, fontFamily: fonts.semi},
  fsBtn: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center'},
  fsOuter: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 3,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: 2,
  },
  fsInner: {width: 8, height: 8, backgroundColor: '#fff'},
  fsInnerExit: {width: 5, height: 5, backgroundColor: '#fff'},

  menu: {backgroundColor: 'rgba(8,8,8,0.9)'},
  menuBody: {
    ...FILL,
    flexDirection: 'row',
    paddingHorizontal: 28,
    paddingTop: 22,
    paddingBottom: 14,
    gap: 16,
  },
  menuCol: {flex: 1},
  menuDivider: {width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.25)'},
  menuHead: {color: colors.gold, fontSize: 11, fontFamily: fonts.xbold, letterSpacing: 2.5, marginBottom: 6},
  trackRow: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8},
  trackCheck: {color: colors.gold, fontSize: 14, width: 16},
  trackCheckOff: {opacity: 0},
  trackText: {color: '#c8c8c8', fontSize: 14, flexShrink: 1},
  trackTextOn: {color: '#fff', fontFamily: fonts.bold},
  subNone: {color: colors.textDim, fontSize: 12, paddingVertical: 8},
  menuClose: {position: 'absolute', top: 6, right: 14},
  menuCloseText: {color: '#fff', fontSize: 30},
});
