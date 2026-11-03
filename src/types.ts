export type Channel = {
  /** Kararlı kimlik: Xtream için stream_id, M3U için url hash'i */
  id: string;
  name: string;
  url: string;
  logo?: string;
  group: string;
  /** XMLTV kanal kimliği (tvg-id) */
  tvgId?: string;
  tvgName?: string;
  /** Xtream tarafında EPG kanal kimliği */
  epgChannelId?: string;
  userAgent?: string;
  referrer?: string;
  headers?: Record<string, string>;
};

export type Programme = {
  channelId: string;
  title: string;
  description?: string;
  /** epoch ms */
  start: number;
  /** epoch ms */
  stop: number;
};

export type EpgMap = Record<string, Programme[]>;

export type XtreamCredentials = {
  /** Örn: http://sunucu.com:8080 */
  server: string;
  username: string;
  password: string;
};

export type Source =
  | { id: string; kind: 'm3u'; name: string; url: string; epgUrl?: string }
  | { id: string; kind: 'xtream'; name: string; creds: XtreamCredentials };

export type StreamKind =
  | 'hls'
  | 'dash'
  | 'ts'
  | 'rtmp'
  | 'rtsp'
  | 'progressive'
  | 'unknown';

export type PlayerEngine = 'native' | 'vlc';
