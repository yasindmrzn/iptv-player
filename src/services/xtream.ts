import type {
  Category,
  Channel,
  Episode,
  Programme,
  SeriesItem,
  VodDetails,
  VodItem,
  XtreamCredentials,
} from '../types';
import {fetchWithTimeout} from '../utils/net';
import {base64ToUtf8} from '../utils/text';

type XtreamCategory = {category_id: string | number; category_name: string};

type XtreamLiveStream = {
  stream_id: number | string;
  name: string;
  stream_icon?: string;
  epg_channel_id?: string | null;
  category_id?: string | number | null;
};

export type XtreamAccountInfo = {
  status: string;
  expiresAt?: number;
  maxConnections?: number;
  activeConnections?: number;
};

/** "sunucu.com:8080" → "http://sunucu.com:8080" (sondaki "/" kaldırılır) */
export function normalizeServer(server: string): string {
  let s = server.trim();
  if (!/^https?:\/\//i.test(s)) {
    s = `http://${s}`;
  }
  return s.replace(/\/+$/, '');
}

function apiUrl(c: XtreamCredentials, action?: string, extra = ''): string {
  const base = `${normalizeServer(c.server)}/player_api.php`;
  const q =
    `username=${encodeURIComponent(c.username)}` +
    `&password=${encodeURIComponent(c.password)}` +
    (action ? `&action=${action}` : '') +
    extra;
  return `${base}?${q}`;
}

async function getJson<T>(url: string, timeoutMs = 25000): Promise<T> {
  const res = await fetchWithTimeout(
    url,
    {headers: {'User-Agent': 'IPTVPlayer/1.0', Accept: 'application/json'}},
    timeoutMs,
  );
  if (!res.ok) {
    throw new Error(`Sunucu hatası (HTTP ${res.status})`);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error('Sunucudan geçersiz yanıt alındı.');
  }
}

/** Kimlik doğrulaması + hesap bilgisi. Hatalı giriş için Error fırlatır. */
export async function xtreamAuthenticate(
  creds: XtreamCredentials,
): Promise<XtreamAccountInfo> {
  const data = await getJson<{
    user_info?: {
      auth?: number | string;
      status?: string;
      exp_date?: string | null;
      max_connections?: string;
      active_cons?: string;
    };
  }>(apiUrl(creds));

  const u = data.user_info;
  if (!u || Number(u.auth) !== 1) {
    throw new Error('Kullanıcı adı veya şifre hatalı.');
  }
  return {
    status: u.status ?? 'Active',
    expiresAt: u.exp_date ? Number(u.exp_date) * 1000 : undefined,
    maxConnections: u.max_connections ? Number(u.max_connections) : undefined,
    activeConnections: u.active_cons ? Number(u.active_cons) : undefined,
  };
}

/** Canlı yayın akış adresi. HLS (.m3u8) her iki motorda da en sorunsuz seçenektir. */
export function xtreamLiveUrl(
  creds: XtreamCredentials,
  streamId: string | number,
  ext: 'm3u8' | 'ts' = 'm3u8',
): string {
  const s = normalizeServer(creds.server);
  return `${s}/live/${encodeURIComponent(creds.username)}/${encodeURIComponent(
    creds.password,
  )}/${streamId}.${ext}`;
}

/** Canlı kategori + kanal listesini çeker ve ortak Channel modeline çevirir. */
export async function fetchXtreamChannels(
  creds: XtreamCredentials,
): Promise<{channels: Channel[]; groups: string[]}> {
  const [cats, streams] = await Promise.all([
    getJson<XtreamCategory[]>(apiUrl(creds, 'get_live_categories')),
    getJson<XtreamLiveStream[]>(apiUrl(creds, 'get_live_streams'), 60000),
  ]);

  if (!Array.isArray(streams)) {
    throw new Error('Kanal listesi alınamadı (hesap süresi dolmuş olabilir).');
  }

  const catName = new Map<string, string>();
  (Array.isArray(cats) ? cats : []).forEach(c =>
    catName.set(String(c.category_id), c.category_name),
  );

  const groupSet = new Set<string>();
  const channels: Channel[] = streams.map(s => {
    const group =
      (s.category_id != null && catName.get(String(s.category_id))) || 'Diğer';
    groupSet.add(group);
    const epgId = s.epg_channel_id || undefined;
    return {
      id: `x${s.stream_id}`,
      name: s.name,
      url: xtreamLiveUrl(creds, s.stream_id),
      logo: s.stream_icon || undefined,
      group,
      tvgId: epgId,
      epgChannelId: epgId,
    };
  });

  return {channels, groups: Array.from(groupSet)};
}

/** Tüm XMLTV'yi indirmeden tek kanal için "şimdi / sıradaki" programı çeker. */
export async function fetchXtreamShortEpg(
  creds: XtreamCredentials,
  channel: Channel,
  limit = 4,
): Promise<Programme[]> {
  const streamId = channel.id.replace(/^x/, '');
  const data = await getJson<{
    epg_listings?: Array<{
      title?: string;
      description?: string;
      start_timestamp?: string;
      stop_timestamp?: string;
    }>;
  }>(
    apiUrl(creds, 'get_short_epg', `&stream_id=${streamId}&limit=${limit}`),
    15000,
  );

  return (data.epg_listings ?? [])
    .filter(e => e.start_timestamp && e.stop_timestamp)
    .map(e => ({
      channelId: channel.epgChannelId ?? channel.id,
      title: e.title ? base64ToUtf8(e.title) : 'Program bilgisi yok',
      description: e.description ? base64ToUtf8(e.description) : undefined,
      start: Number(e.start_timestamp) * 1000,
      stop: Number(e.stop_timestamp) * 1000,
    }));
}

/** Xtream sağlayıcılarında standart XMLTV adresi. */
export function xtreamXmltvUrl(creds: XtreamCredentials): string {
  return (
    `${normalizeServer(creds.server)}/xmltv.php` +
    `?username=${encodeURIComponent(creds.username)}` +
    `&password=${encodeURIComponent(creds.password)}`
  );
}

// ───────────────────────── VOD (filmler) ─────────────────────────

type RawCat = {category_id: string | number; category_name: string};

const toCats = (raw: unknown): Category[] =>
  (Array.isArray(raw) ? (raw as RawCat[]) : []).map(c => ({
    id: String(c.category_id),
    name: c.category_name,
  }));

function toEpoch(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function fetchVodCategories(c: XtreamCredentials): Promise<Category[]> {
  return toCats(await getJson<unknown>(apiUrl(c, 'get_vod_categories')));
}

export async function fetchVodItems(
  c: XtreamCredentials,
  categoryId?: string,
): Promise<VodItem[]> {
  const raw = await getJson<
    Array<{
      stream_id: number | string;
      name: string;
      stream_icon?: string | null;
      rating?: string | number | null;
      category_id?: string | number | null;
      container_extension?: string | null;
      added?: string | number | null;
    }>
  >(
    apiUrl(c, 'get_vod_streams', categoryId ? `&category_id=${encodeURIComponent(categoryId)}` : ''),
    categoryId ? 45000 : 120000,
  );
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map(v => ({
    id: String(v.stream_id),
    name: v.name,
    cover: v.stream_icon || undefined,
    categoryId: String(v.category_id ?? ''),
    rating: v.rating != null && v.rating !== '' ? String(v.rating) : undefined,
    ext: v.container_extension || 'mp4',
    added: toEpoch(v.added),
  }));
}

export function vodUrl(c: XtreamCredentials, v: VodItem): string {
  return `${normalizeServer(c.server)}/movie/${encodeURIComponent(
    c.username,
  )}/${encodeURIComponent(c.password)}/${v.id}.${v.ext}`;
}

// ───────────────────────── Diziler ─────────────────────────

export async function fetchSeriesCategories(c: XtreamCredentials): Promise<Category[]> {
  return toCats(await getJson<unknown>(apiUrl(c, 'get_series_categories')));
}

export async function fetchSeriesItems(
  c: XtreamCredentials,
  categoryId?: string,
): Promise<SeriesItem[]> {
  const raw = await getJson<
    Array<{
      series_id: number | string;
      name: string;
      cover?: string | null;
      plot?: string | null;
      rating?: string | number | null;
      category_id?: string | number | null;
      last_modified?: string | number | null;
    }>
  >(
    apiUrl(c, 'get_series', categoryId ? `&category_id=${encodeURIComponent(categoryId)}` : ''),
    categoryId ? 45000 : 120000,
  );
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map(s => ({
    id: String(s.series_id),
    name: s.name,
    cover: s.cover || undefined,
    plot: s.plot || undefined,
    categoryId: String(s.category_id ?? ''),
    rating: s.rating != null && s.rating !== '' ? String(s.rating) : undefined,
    added: toEpoch(s.last_modified),
  }));
}

type RawEpisode = {
  id: string | number;
  episode_num?: string | number;
  title?: string;
  season?: string | number;
  container_extension?: string;
  info?: {duration?: string};
};

/** Dizinin bölümleri. Sunucular `episodes`'u sezon→liste nesnesi ya da düz liste olarak döndürür. */
export async function fetchSeriesEpisodes(
  c: XtreamCredentials,
  seriesId: string,
): Promise<Episode[]> {
  const data = await getJson<{episodes?: Record<string, RawEpisode[]> | RawEpisode[]}>(
    apiUrl(c, 'get_series_info', `&series_id=${encodeURIComponent(seriesId)}`),
    40000,
  );

  const out: Episode[] = [];
  const push = (e: RawEpisode, fallbackSeason: number) => {
    out.push({
      id: String(e.id),
      season: Number(e.season ?? fallbackSeason) || fallbackSeason,
      number: Number(e.episode_num) || out.length + 1,
      title: e.title || `Bölüm ${e.episode_num ?? out.length + 1}`,
      ext: e.container_extension || 'mp4',
      duration: e.info?.duration,
    });
  };

  const eps = data.episodes;
  if (Array.isArray(eps)) {
    eps.forEach(e => push(e, 1));
  } else if (eps && typeof eps === 'object') {
    Object.entries(eps).forEach(([season, list]) =>
      (Array.isArray(list) ? list : []).forEach(e => push(e, Number(season) || 1)),
    );
  }
  return out.sort((a, b) => a.season - b.season || a.number - b.number);
}

export function episodeUrl(c: XtreamCredentials, e: Episode): string {
  return `${normalizeServer(c.server)}/series/${encodeURIComponent(
    c.username,
  )}/${encodeURIComponent(c.password)}/${e.id}.${e.ext}`;
}

/** Film ayrıntıları (özet, tür, yıl, fragman). Sunucular alanları farklı adlandırabilir. */
export async function fetchVodDetails(
  c: XtreamCredentials,
  vodId: string,
): Promise<VodDetails> {
  const data = await getJson<{
    info?: Record<string, unknown>;
  }>(apiUrl(c, 'get_vod_info', `&vod_id=${encodeURIComponent(vodId)}`), 30000);
  const i = data?.info ?? {};
  const str = (v: unknown) =>
    typeof v === 'string' || typeof v === 'number'
      ? String(v).trim() || undefined
      : undefined;
  const backdropRaw = i.backdrop_path;
  return {
    plot: str(i.plot) ?? str(i.description),
    genre: str(i.genre),
    year: str(i.releasedate)?.slice(0, 4) ?? str(i.year),
    duration: str(i.duration),
    rating: str(i.rating) ?? str(i.rating_5based),
    cast: str(i.cast) ?? str(i.actors),
    director: str(i.director),
    trailer: str(i.youtube_trailer) ?? str(i.trailer),
    backdrop: Array.isArray(backdropRaw) ? str(backdropRaw[0]) : str(backdropRaw),
  };
}

/** Fragman için açılacak bağlantı (kimlik ya da tam URL kabul eder). */
export function trailerUrl(t: string): string {
  return /^https?:\/\//i.test(t) ? t : `https://www.youtube.com/watch?v=${encodeURIComponent(t)}`;
}
