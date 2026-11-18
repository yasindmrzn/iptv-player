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
  onLoad?: (d: {duration: number}) => void;
  onProgress?: (d: {currentTime: number}) => void;
  onError?: (e: OnVideoErrorData) => void;
  onEnd?: () => void;
  onTextTracks?: (d: OnTextTracksData) => void;
  onAudioTracks?: (d: OnAudioTracksData) => void;
  [k: string]: unknown;
};

function pick(url: string): 'hls' | 'ts' | 'file' {
  const path = url.toLowerCase().replace(/^[a-z]+:\/\/[^/]+/, '').split(/[?#]/)[0];
  if (path.endsWith('.m3u8') || path.endsWith('.m3u')) {
    return 'hls';
  }
  if (path.endsWith('.ts') || /^\/live\//.test(path) || /^\/[^/]+\/[^/]+\/\d+$/.test(path)) {
    return 'ts';
  }
  return 'file';
}

export const Video = forwardRef<VideoRef, Props>(function Video(props, ref) {
  const el = useRef<HTMLVideoElement>(null);
  const cb = useRef(props);
  cb.current = props;
  const hlsRef = useRef<Hls | null>(null);
  const uri = props.source?.uri;

  useImperativeHandle(ref, () => ({
    seek(sec: number) {
      if (el.current) {
        el.current.currentTime = sec;
      }
    },
  }));

  // Kaynağı bağla
  useEffect(() => {
    const v = el.current;
    if (!v || !uri) {
      return;
    }
    let ts: mpegts.Player | null = null;
    let dead = false;
    const fail = (msg: string) => !dead && cb.current.onError?.({error: {errorString: msg}});
    cb.current.onLoadStart?.();
    const kind = pick(uri);

    try {
      if (kind === 'hls' && Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 60,
          maxMaxBufferLength: 120,
          liveSyncDuration: 12,
          liveMaxLatencyDuration: 40,
          enableWorker: true,
          manifestLoadingMaxRetry: 4,
          levelLoadingMaxRetry: 4,
          fragLoadingMaxRetry: 6,
        });
        hlsRef.current = hls;
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
          cb.current.onAudioTracks?.({
            audioTracks: hls.audioTracks.map((t, i) => ({
              index: i,
              title: t.name,
              language: t.lang,
              selected: i === hls.audioTrack,
            })),
          });
        });
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
          cb.current.onTextTracks?.({
            textTracks: hls.subtitleTracks.map((t, i) => ({index: i, title: t.name, language: t.lang})),
          });
        });
        hls.on(Hls.Events.ERROR, (_e, d) => {
          if (!d.fatal) {
            return;
          }
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            fail(`${d.type}: ${d.details}`);
          }
        });
        hls.loadSource(uri);
        hls.attachMedia(v);
      } else if (kind === 'ts' && mpegts.isSupported()) {
        ts = mpegts.createPlayer(
          {type: 'mpegts', isLive: true, url: uri},
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
        ts.on(mpegts.Events.ERROR, (_t: unknown, d: unknown) => fail(`Yayın hatası: ${String(d)}`));
        ts.attachMediaElement(v);
        ts.load();
      } else {
        v.src = uri;
        v.load();
      }
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Oynatıcı başlatılamadı.');
    }

    return () => {
      dead = true;
      try {
        hlsRef.current?.destroy();
        hlsRef.current = null;
        ts?.destroy();
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

  return (
    <video
      ref={el}
      playsInline
      autoPlay={!props.paused}
      style={{background: '#000', objectFit: fit, ...flat, position: 'absolute', inset: 0, width: '100%', height: '100%'}}
      onLoadedMetadata={e => {
        const v = e.currentTarget;
        cb.current.onLoad?.({duration: Number.isFinite(v.duration) ? v.duration : 0});
        const tt: OnTextTracksData['textTracks'] = [];
        for (let i = 0; i < v.textTracks.length; i++) {
          tt.push({index: i, title: v.textTracks[i].label, language: v.textTracks[i].language});
        }
        if (tt.length) {
          cb.current.onTextTracks?.({textTracks: tt});
        }
      }}
      onPlaying={() => {
        cb.current.onBuffer?.({isBuffering: false});
        cb.current.onReadyForDisplay?.();
      }}
      onWaiting={() => cb.current.onBuffer?.({isBuffering: true})}
      onTimeUpdate={e => cb.current.onProgress?.({currentTime: e.currentTarget.currentTime})}
      onEnded={() => cb.current.onEnd?.()}
      onError={e => {
        const m = e.currentTarget.error;
        cb.current.onError?.({
          error: {
            errorString:
              m?.code === 4
                ? 'Bu biçim oynatılamadı (codec desteklenmiyor).'
                : m?.message || 'Yayın oynatılamadı.',
          },
        });
      }}
    />
  );
});

export default Video;
