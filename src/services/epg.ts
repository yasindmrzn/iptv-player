import {ungzip} from 'pako';
import type {EpgMap, Programme} from '../types';
import {fetchWithTimeout} from '../utils/net';
import {decodeXml, utf8Decode, yieldToUi} from '../utils/text';

/** XMLTV zaman damgası: "20261103183000 +0300" → epoch ms */
export function parseXmltvTime(s: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4}|Z)?/.exec(
    s.trim(),
  );
  if (!m) {
    return NaN;
  }
  const [, y, mo, d, h, mi, sec = '0', tz = '+0000'] = m;
  let offsetMin = 0;
  if (tz !== 'Z') {
    const sign = tz[0] === '-' ? -1 : 1;
    offsetMin = sign * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3, 5)));
  }
  return (
    Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec) - offsetMin * 60 * 1000
  );
}

export const epgKey = (id: string) => id.trim().toLowerCase();

/**
 * XMLTV metnini ayrıştırır.
 *
 * Bellek/CPU için yalnızca:
 *  - `wantedChannels` içindeki kanalların (verilmişse)
 *  - [şimdi − pastMs, şimdi + futureMs] aralığına düşen programların
 * saklanır. Büyük dosyalarda arayüzü dondurmamak için periyodik olarak
 * JS iş parçacığına nefes aldırılır.
 */
export async function parseXmltv(
  xml: string,
  opts: {
    wantedChannels?: Set<string>;
    pastMs?: number;
    futureMs?: number;
    now?: number;
  } = {},
): Promise<EpgMap> {
  const now = opts.now ?? Date.now();
  const from = now - (opts.pastMs ?? 2 * 3600 * 1000);
  const to = now + (opts.futureMs ?? 24 * 3600 * 1000);
  const wanted = opts.wantedChannels;

  const map: EpgMap = {};
  const re = /<programme\s+([^>]*?)>([\s\S]*?)<\/programme>/g;
  const attrRe = /([A-Za-z_:-]+)\s*=\s*"([^"]*)"/g;

  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(xml)) !== null) {
    if (++n % 3000 === 0) {
      await yieldToUi();
    }

    const attrs: Record<string, string> = {};
    let a: RegExpExecArray | null;
    attrRe.lastIndex = 0;
    while ((a = attrRe.exec(m[1])) !== null) {
      attrs[a[1]] = a[2];
    }

    const channelRaw = attrs.channel;
    if (!channelRaw) {
      continue;
    }
    const key = epgKey(decodeXml(channelRaw));
    if (wanted && !wanted.has(key)) {
      continue;
    }

    const start = parseXmltvTime(attrs.start ?? '');
    const stop = parseXmltvTime(attrs.stop ?? '');
    if (!Number.isFinite(start) || !Number.isFinite(stop)) {
      continue;
    }
    if (stop < from || start > to) {
      continue;
    }

    const body = m[2];
    const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(body);
    const desc = /<desc[^>]*>([\s\S]*?)<\/desc>/.exec(body);

    const prog: Programme = {
      channelId: key,
      title: title ? decodeXml(title[1]) : 'Adsız program',
      description: desc ? decodeXml(desc[1]) : undefined,
      start,
      stop,
    };
    (map[key] ??= []).push(prog);
  }

  Object.values(map).forEach(list => list.sort((x, y) => x.start - y.start));
  return map;
}

/** XMLTV'yi (düz veya .gz) indirir ve ayrıştırır. */
export async function fetchEpg(
  url: string,
  wantedChannels?: Set<string>,
  signal?: AbortSignal,
): Promise<EpgMap> {
  const res = await fetchWithTimeout(
    url,
    {signal, headers: {'User-Agent': 'IPTVPlayer/1.0'}},
    90000,
  );
  if (!res.ok) {
    throw new Error(`EPG indirilemedi (HTTP ${res.status})`);
  }

  let bytes = new Uint8Array(await res.arrayBuffer());
  // gzip sihirli baytları: 1F 8B (sunucular içerik türünü sık sık yanlış bildirir).
  // Metne çevirme işini TextDecoder'a (Hermes'te garanti değil) bırakmadan
  // kendi UTF-8 çözücümüzle yapıyoruz; pako sürümlerinin seçenek farklarından da bağımsız.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    bytes = ungzip(bytes);
  }
  const text = utf8Decode(bytes);

  return parseXmltv(text, {wantedChannels});
}

export function getNowNext(
  epg: EpgMap,
  channelId: string | undefined,
  now = Date.now(),
): {now?: Programme; next?: Programme} {
  if (!channelId) {
    return {};
  }
  const list = epg[epgKey(channelId)];
  if (!list || !list.length) {
    return {};
  }
  const idx = list.findIndex(p => p.start <= now && now < p.stop);
  if (idx === -1) {
    const upcoming = list.find(p => p.start > now);
    return {next: upcoming};
  }
  return {now: list[idx], next: list[idx + 1]};
}

export function formatClock(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
