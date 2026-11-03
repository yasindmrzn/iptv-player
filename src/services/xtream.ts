import type {Channel, Programme, XtreamCredentials} from '../types';
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
