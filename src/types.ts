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

export type VodItem = {
  id: string;
  name: string;
  cover?: string;
  categoryId: string;
  rating?: string;
  ext: string;
  /** Sunucuya eklenme zamanı (epoch sn) */
  added?: number;
};

export type SeriesItem = {
  id: string;
  name: string;
  cover?: string;
  categoryId: string;
  plot?: string;
  rating?: string;
  /** Son güncelleme / eklenme zamanı (epoch sn) */
  added?: number;
};

export type Episode = {
  id: string;
  season: number;
  number: number;
  title: string;
  ext: string;
  duration?: string;
};

export type Category = {id: string; name: string};

export type StreamKind =
  | 'hls'
  | 'dash'
  | 'ts'
  | 'rtmp'
  | 'rtsp'
  | 'progressive'
  | 'file'
  | 'unknown';

export type PlayerEngine = 'native' | 'vlc';

export type VodDetails = {
  plot?: string;
  genre?: string;
  year?: string;
  duration?: string;
  rating?: string;
  cast?: string;
  director?: string;
  /** YouTube video kimliği ya da tam bağlantı */
  trailer?: string;
  backdrop?: string;
};

export type Profile = {id: string; name: string; color: string};

export type ProfileData = {
  favorites: Record<string, true>;
  recent: RecentItem[];
  lastChannelId: string | null;
};

export type RecentItem =
  | {kind: 'vod'; item: VodItem; ts: number}
  | {kind: 'series'; item: SeriesItem; ts: number};
