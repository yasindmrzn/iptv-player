import React, {forwardRef, useEffect, useImperativeHandle, useRef} from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';

export const ResizeMode = {CONTAIN: 'contain', COVER: 'cover', STRETCH: 'stretch', NONE: 'none'} as const;
export const SelectedTrackType = {DISABLED: 'disabled', INDEX: 'index', SYSTEM: 'system'} as const;
export const ViewType = {TEXTURE: 0, SURFACE: 1, SURFACE_SECURE: 2} as const;

export type VideoRef = {seek: (sec: number) => void};
export type ReactVideoSource = {uri: string; type?: string; headers?: Record<string, string>};
export type OnBufferData = {isBuffering: boolean};
export type OnVideoErrorData = {error: {errorString?: string; error?: string; localizedDescription?: string}};
export type OnAudioTracksData = {
  audioTracks: {index: number; title?: string; language?: string; selected?: boolean}[];
};
export type OnTextTracksData = {textTracks: {index: number; title?: string; language?: string}[]};

type Sel = {type: string; value?: number} | undefined;
type Props = {
  source?: ReactVideoSource;
  paused?: boolean;
  style?: unknown;
  resizeMode?: string;
  selectedTextTrack?: Sel;
  selectedAudioTrack?: Sel;
  onLoadStart?: () => void;
  onReadyForDisplay?: () => void;
  onBuffer?: (d: OnBufferData) => void;
  onLoad?: (d: {duration: number; naturalSize?: {width: number; height: number}}) => void;
  onProgress?: (d: {currentTime: number}) => void;
  onError?: (e: OnVideoErrorData) => void;
  onEnd?: () => void;
  onTextTracks?: (d: OnTextTracksData) => void;
  onAudioTracks?: (d: OnAudioTracksData) => void;
  [k: string]: unknown;
};

type Mode = 'hls' | 'ts' | 'file' | 'ff';
type Win = {desktop?: {bridgePort?: () => Promise<number>}};

function pick(url: string): {kind: 'hls' | 'ts' | 'file'; live: boolean} {
  if (/^rtmp|^rtsp/i.test(url)) {
    return {kind: 'file', live: true};
  }
  const path = url.toLowerCase().replace(/^[a-z]+:\/\/[^/]+/, '').split(/[?#]/)[0];
  if (path.endsWith('.m3u8') || path.endsWith('.m3u')) {
    return {kind: 'hls', live: true};
  }
  if (path.endsWith('.ts') || /^\/live\//.test(path) || /^\/[^/]+\/[^/]+\/\d+$/.test(path)) {
    return {kind: 'ts', live: true};
  }
  return {kind: 'file', live: false};
}

let bridge: Promise<number> | null = null;
const getBridge = (): Promise<number> => {
  if (!bridge) {
    const f = (window as unknown as Win).desktop?.bridgePort;
    bridge = f ? f().catch(() => 0) : Promise.resolve(0);
  }
  return bridge;
};

export const Video = forwardRef<VideoRef, Props>(function Video(props, ref) {
  const el = useRef<HTMLVideoElement>(null);
  const cb = useRef(props);
  cb.current = props;
  const hlsRef = useRef<Hls | null>(null);
  const modeRef = useRef<Mode>('file');
  const offsetRef = useRef(0); // köprü + film: ss ofseti (sn)
  const ffDur = useRef(0);
  const ffUrl = useRef('');
  const advance = useRef<(toFf?: boolean) => void>(() => {});
  const uri = props.source?.uri;

  useImperativeHandle(ref, () => ({
    seek(sec: number) {
      const v = el.current;
      if (!v) {
        return;
      }
      if (modeRef.current === 'ff' && ffDur.current > 0) {
        offsetRef.current = sec;
        v.src = `${ffUrl.current}&ss=${Math.floor(sec)}`;
        v.load();
        v.play().catch(() => {});
      } else {
        v.currentTime = sec;
      }
    },
  }));

  // Kaynağı bağla: doğrudan (hls.js / mpegts.js / <video>) → olmazsa yerel ffmpeg köprüsü
  useEffect(() => {
    const v = el.current;
    if (!v || !uri) {
      return;
    }
    let dead = false;
    let ts: mpegts.Player | null = null;
    let idx = 0;
    let watch: ReturnType<typeof setTimeout> | null = null;
    let stall: ReturnType<typeof setTimeout> | null = null;
    offsetRef.current = 0;
    ffDur.current = 0;
    cb.current.onLoadStart?.();

    const {kind, live} = pick(uri);
    const swap = (to: 'm3u8' | 'ts') =>
      uri.replace(/\.(m3u8|ts)(?=$|[?#])/i, `.${to}`).replace(/^(.*\/\d+)$/, `$1.${to}`);

    const teardown = () => {
      if (stall) {
        clearTimeout(stall);
        stall = null;
      }
      if (watch) {
        clearTimeout(watch);
        watch = null;
      }
      try {
        hlsRef.current?.destroy();
        hlsRef.current = null;
        ts?.destroy();
        ts = null;
      } catch {
        /* yok say */
      }
    };

    const start = async () => {
      const port = await getBridge();
      if (dead) {
        return;
      }
      const ffBase = port ? `http://127.0.0.1:${port}` : '';
      // .m3u8 ↔ .ts yedeği yalnızca Xtream canlı yolunda anlamlı; film/dizi (direct source) için değil
      const xtLive = /\/live\/|\/\d+\.(m3u8|ts)(?=$|[?#])/i.test(uri);
      const direct: {mode: Mode; url: string}[] = /^rtmp|^rtsp/i.test(uri)
        ? []
        : kind === 'hls'
        ? [{mode: 'hls', url: uri}, ...(xtLive ? [{mode: 'ts' as Mode, url: swap('ts')}] : [])]
        : kind === 'ts'
        ? [{mode: 'ts', url: uri}, ...(xtLive ? [{mode: 'hls' as Mode, url: swap('m3u8')}] : [])]
        : [{mode: 'file', url: uri}];
      const plans = [...direct];
      if (ffBase) {
        plans.push({mode: 'ff', url: `${ffBase}/${live ? 'live' : 'vod'}?u=${encodeURIComponent(uri)}`});
      }
      if (!plans.length) {
        cb.current.onError?.({error: {errorString: 'Bu yayın türü desteklenmiyor.'}});
        return;
      }
      const ffIndex = plans.length - 1;
      const hasFf = plans[ffIndex].mode === 'ff';

      const run = async (i: number) => {
        if (dead) {
          return;
        }
        teardown();
        idx = i;
        const plan = plans[i];
        modeRef.current = plan.mode;
        const last = i >= plans.length - 1;
        // Doğrudan oynatma 12 sn içinde başlamazsa (takılma / sessiz hata) köprüye geç
        if (plan.mode !== 'ff' && hasFf) {
          stall = setTimeout(() => {
            stall = null;
            if (!dead && v.readyState < 3) {
              advance.current(true);
            }
          }, 12000);
        }
        const fail = (msg: string) => {
          if (dead) {
            return;
          }
          if (!last) {
            void run(i + 1);
          } else {
            cb.current.onError?.({error: {errorString: msg}});
          }
        };
        try {
          if (plan.mode === 'hls' && Hls.isSupported()) {
            const hls = new Hls({
              maxBufferLength: 60,
              maxMaxBufferLength: 120,
              liveSyncDuration: 12,
              liveMaxLatencyDuration: 40,
              enableWorker: true,
              manifestLoadingMaxRetry: 2,
              levelLoadingMaxRetry: 3,
              fragLoadingMaxRetry: 4,
            });
            hlsRef.current = hls;
            hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
              cb.current.onAudioTracks?.({
                audioTracks: hls.audioTracks.map((t, k) => ({index: k, title: t.name, language: t.lang, selected: k === hls.audioTrack})),
              });
            });
            hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
              cb.current.onTextTracks?.({
                textTracks: hls.subtitleTracks.map((t, k) => ({index: k, title: t.name, language: t.lang})),
              });
            });
            hls.on(Hls.Events.ERROR, (_e, d) => {
              if (!d.fatal) {
                return;
              }
              if (d.type === Hls.ErrorTypes.MEDIA_ERROR && last) {
                hls.recoverMediaError();
                return;
              }
              const code = (d as {response?: {code?: number}}).response?.code;
              fail(`Yayın alınamadı (${d.details}${code ? ` · HTTP ${code}` : ''})`);
            });
            hls.loadSource(plan.url);
            hls.attachMedia(v);
          } else if ((plan.mode === 'ts' || (plan.mode === 'ff' && live)) && mpegts.isSupported()) {
            ts = mpegts.createPlayer(
              {type: 'mpegts', isLive: true, url: plan.url},
              {
                enableWorker: true,
                enableStashBuffer: true,
                stashInitialSize: 1024 * 1024,
                liveBufferLatencyChasing: true,
                liveBufferLatencyMaxLatency: 40,
                liveBufferLatencyMinRemain: 6,
                lazyLoad: false,
                autoCleanupSourceBuffer: true,
              },
            );
            ts.on(mpegts.Events.ERROR, (_t: unknown, d: unknown, info?: {code?: number}) =>
              fail(`Yayın alınamadı (${String(d)}${info?.code ? ` · HTTP ${info.code}` : ''})`),
            );
            ts.attachMediaElement(v);
            ts.load();
            v.play().catch(() => {});
          } else if (plan.mode === 'ff') {
            // Film / bölüm: süre ffmpeg probu ile alınır, parçalı MP4 olarak akar
            ffUrl.current = plan.url;
            const info = (await fetch(`${ffBase}/probe?u=${encodeURIComponent(uri)}`)
              .then(r => r.json())
              .catch(() => ({duration: 0}))) as {duration: number};
            if (dead) {
              return;
            }
            ffDur.current = info.duration || 0;
            if (ffDur.current > 0) {
              cb.current.onLoad?.({duration: ffDur.current});
            }
            v.src = plan.url;
            v.load();
            v.play().catch(() => {});
          } else {
            v.src = plan.url;
            v.load();
          }
        } catch (e) {
          fail(e instanceof Error ? e.message : 'Oynatıcı başlatılamadı.');
        }
      };

      advance.current = toFf => {
        const next = toFf && hasFf ? ffIndex : idx + 1;
        if (next <= ffIndex && next !== idx) {
          void run(next);
        } else {
          cb.current.onError?.({error: {errorString: 'Yayın oynatılamadı.'}});
        }
      };
      // Görüntü ya da ses çözülemiyorsa (HEVC, AC3 vb.) 4 sn sonra köprüye geç
      (v as unknown as {__arm: () => void}).__arm = () => {
        if (watch || !hasFf || modeRef.current === 'ff') {
          return;
        }
        watch = setTimeout(() => {
          watch = null;
          if (dead || v.paused) {
            return;
          }
          const noVideo = v.videoWidth === 0;
          const noAudio =
            (v as unknown as {webkitAudioDecodedByteCount?: number}).webkitAudioDecodedByteCount === 0 &&
            v.currentTime > 1;
          if (noVideo || noAudio) {
            advance.current(true);
          }
        }, 4000);
      };
      void run(0);
    };
    void start();

    return () => {
      dead = true;
      teardown();
      advance.current = () => {};
      try {
        v.removeAttribute('src');
        v.load();
      } catch {
        /* yok say */
      }
    };
  }, [uri]);

  // Duraklat / oynat
  useEffect(() => {
    const v = el.current;
    if (!v) {
      return;
    }
    if (props.paused) {
      v.pause();
    } else {
      v.play().catch(() => {});
    }
  }, [props.paused, uri]);

  // Altyazı seçimi
  const subSel = props.selectedTextTrack;
  useEffect(() => {
    const v = el.current;
    if (!v) {
      return;
    }
    const idx = subSel?.type === 'index' ? subSel.value : -1;
    if (hlsRef.current) {
      hlsRef.current.subtitleTrack = idx ?? -1;
    }
    for (let i = 0; i < v.textTracks.length; i++) {
      v.textTracks[i].mode = i === idx ? 'showing' : 'disabled';
    }
  }, [subSel?.type, subSel?.value]);

  // Ses seçimi (HLS)
  const audSel = props.selectedAudioTrack;
  useEffect(() => {
    if (hlsRef.current && audSel?.type === 'index' && audSel.value != null) {
      hlsRef.current.audioTrack = audSel.value;
    }
  }, [audSel?.type, audSel?.value]);

  const fit = props.resizeMode === 'cover' ? 'cover' : props.resizeMode === 'stretch' ? 'fill' : 'contain';
  const flat = (Array.isArray(props.style) ? Object.assign({}, ...props.style.flat(3)) : props.style) as
    | React.CSSProperties
    | undefined;

  const size = (v: HTMLVideoElement) => ({width: v.videoWidth, height: v.videoHeight});

  return (
    <video
      ref={el}
      playsInline
      autoPlay={!props.paused}
      style={{background: '#000', objectFit: fit, ...flat, position: 'absolute', inset: 0, width: '100%', height: '100%'}}
      onLoadedMetadata={e => {
        const v = e.currentTarget;
        const dur = ffDur.current > 0 ? ffDur.current : Number.isFinite(v.duration) ? v.duration : 0;
        cb.current.onLoad?.({duration: dur, naturalSize: size(v)});
        const tt: OnTextTracksData['textTracks'] = [];
        for (let i = 0; i < v.textTracks.length; i++) {
          tt.push({index: i, title: v.textTracks[i].label, language: v.textTracks[i].language});
        }
        if (tt.length) {
          cb.current.onTextTracks?.({textTracks: tt});
        }
      }}
      onResize={e => {
        const v = e.currentTarget;
        const dur = ffDur.current > 0 ? ffDur.current : Number.isFinite(v.duration) ? v.duration : 0;
        cb.current.onLoad?.({duration: dur, naturalSize: size(v)});
      }}
      onPlaying={e => {
        cb.current.onBuffer?.({isBuffering: false});
        cb.current.onReadyForDisplay?.();
        (e.currentTarget as unknown as {__arm?: () => void}).__arm?.();
      }}
      onWaiting={() => cb.current.onBuffer?.({isBuffering: true})}
      onTimeUpdate={e => cb.current.onProgress?.({currentTime: offsetRef.current + e.currentTarget.currentTime})}
      onEnded={() => cb.current.onEnd?.()}
      onError={e => {
        const m = e.currentTarget.error;
        if (m && modeRef.current !== 'ff') {
          // Codec/biçim hatası: köprüye geç
          advance.current(m.code === 4 || m.code === 3);
          return;
        }
        cb.current.onError?.({
          error: {errorString: m?.message || 'Yayın oynatılamadı.'},
        });
      }}
    />
  );
});

export default Video;
