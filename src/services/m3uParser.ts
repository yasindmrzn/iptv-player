import type {Channel} from '../types';

export type ParsedPlaylist = {
  channels: Channel[];
  /** #EXTM3U satırındaki url-tvg / x-tvg-url değerleri (XMLTV EPG adresleri) */
  epgUrls: string[];
  /** Tekrarsız, sıralı grup listesi */
  groups: string[];
};

const DEFAULT_GROUP = 'Diğer';

/** Hızlı, kararlı 32-bit hash (djb2) → base36 */
export function hashId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/**
 * key="value" / key='value' çiftlerini okur.
 * Anahtarlar küçük harfe çevrilir (tvg-ID ve tvg-id aynı sayılır).
 */
function parseAttributes(str: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z0-9_.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    attrs[m[1].toLowerCase()] = (m[2] ?? m[3] ?? '').trim();
  }
  return attrs;
}

/** Tırnak dışındaki ilk virgülün indeksi (kanal adı ayırıcısı). */
function findNameSeparator(str: string): number {
  let quote: string | null = null;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (quote) {
      if (c === quote) {
        quote = null;
      }
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ',') {
      return i;
    }
  }
  return -1;
}

/**
 * Kodi tarzı "url|Header=Değer&Header2=Değer" biçimini ayırır.
 */
function splitPipeHeaders(raw: string): {
  url: string;
  headers?: Record<string, string>;
} {
  // Kodi sözleşmesi: ilk "|" işaretinden sonrası HTTP başlıklarıdır
  const idx = raw.indexOf('|');
  if (idx === -1) {
    return {url: raw};
  }
  const url = raw.slice(0, idx);
  const headers: Record<string, string> = {};
  raw
    .slice(idx + 1)
    .split('&')
    .forEach(pair => {
      const eq = pair.indexOf('=');
      if (eq > 0) {
        const key = pair.slice(0, eq).trim();
        let value = pair.slice(eq + 1).trim();
        try {
          value = decodeURIComponent(value);
        } catch {
          /* ham değeri kullan */
        }
        headers[key] = value;
      }
    });
  return {url, headers: Object.keys(headers).length ? headers : undefined};
}

function splitHeaderLine(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * M3U / M3U8 (IPTV) oynatma listesini ayrıştırır.
 *
 * Desteklenenler:
 *  - #EXTM3U (url-tvg, x-tvg-url)
 *  - #EXTINF (tvg-id, tvg-name, tvg-logo, group-title, tvg-chno ... ve virgül içeren isimler)
 *  - #EXTGRP, #EXTVLCOPT (http-user-agent, http-referrer)
 *  - Kodi "url|User-Agent=..." başlık sözdizimi
 *  - UTF-8 BOM, CRLF/LF/CR satır sonları, bozuk/eksik satırlar
 *
 * Büyük listelerde (100 bin+ satır) bellek dostu olması için satırlar
 * split() yerine tek geçişte taranır.
 */
export function parseM3U(text: string): ParsedPlaylist {
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const channels: Channel[] = [];
  const epgUrls: string[] = [];
  const groupSet = new Set<string>();
  const usedIds = new Set<string>();

  let pending:
    | {
        name: string;
        attrs: Record<string, string>;
        group?: string;
        userAgent?: string;
        referrer?: string;
      }
    | null = null;

  const len = text.length;
  let pos = 0;

  while (pos < len) {
    let end = pos;
    while (end < len) {
      const c = text.charCodeAt(end);
      if (c === 10 || c === 13) {
        break;
      }
      end++;
    }
    const line = text.slice(pos, end).trim();
    // \r\n çiftini tek satır sonu say
    pos = end + 1;
    if (text.charCodeAt(end) === 13 && text.charCodeAt(end + 1) === 10) {
      pos++;
    }

    if (!line) {
      continue;
    }

    if (line.charCodeAt(0) === 35 /* # */) {
      // "#EXTVLCOPT" 10 karakter; hepsini kapsayacak kadar önek al
      const upper = line.slice(0, 10).toUpperCase();

      if (upper.startsWith('#EXTM3U')) {
        const attrs = parseAttributes(line);
        const tvg = attrs['url-tvg'] ?? attrs['x-tvg-url'] ?? attrs['tvg-url'];
        if (tvg) {
          splitHeaderLine(tvg).forEach(u => epgUrls.push(u));
        }
      } else if (upper.startsWith('#EXTINF')) {
        const body = line.slice(line.indexOf(':') + 1);
        const sep = findNameSeparator(body);
        const meta = sep === -1 ? body : body.slice(0, sep);
        const attrs = parseAttributes(meta);
        const name = (sep === -1 ? '' : body.slice(sep + 1)).trim();
        pending = {
          name: name || attrs['tvg-name'] || '',
          attrs,
        };
      } else if (upper.startsWith('#EXTGRP')) {
        if (pending) {
          pending.group = line.slice(line.indexOf(':') + 1).trim();
        }
      } else if (upper.startsWith('#EXTVLCOPT')) {
        if (pending) {
          const kv = line.slice(line.indexOf(':') + 1);
          const eq = kv.indexOf('=');
          if (eq > 0) {
            const key = kv.slice(0, eq).trim().toLowerCase();
            const val = kv.slice(eq + 1).trim();
            if (key === 'http-user-agent') {
              pending.userAgent = val;
            } else if (key === 'http-referrer' || key === 'http-referer') {
              pending.referrer = val;
            }
          }
        }
      }
      // #KODIPROP, #EXT-X-* vb. satırları yok sayılır
      continue;
    }

    // URL satırı
    if (!pending) {
      // #EXTINF'siz çıplak URL: yine de kanal olarak ekle
      if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(line)) {
        continue;
      }
      pending = {name: '', attrs: {}};
    }

    const {url, headers} = splitPipeHeaders(line);
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
      // Geçerli bir şema değil → bu EXTINF'i at
      pending = null;
      continue;
    }

    const {attrs} = pending;
    const group =
      (attrs['group-title'] || pending.group || '').trim() || DEFAULT_GROUP;
    const name = pending.name || attrs['tvg-name'] || url;

    let id = hashId(`${url}|${name}`);
    // Aynı url+isim tekrar ederse kimlik çakışmasını önle
    if (usedIds.has(id)) {
      let n = 2;
      while (usedIds.has(`${id}-${n}`)) {
        n++;
      }
      id = `${id}-${n}`;
    }
    usedIds.add(id);
    groupSet.add(group);

    const mergedHeaders: Record<string, string> | undefined =
      headers || pending.referrer
        ? {
            ...(headers ?? {}),
            ...(pending.referrer && !(headers && headers.Referer)
              ? {Referer: pending.referrer}
              : {}),
          }
        : undefined;

    channels.push({
      id,
      name,
      url,
      logo: attrs['tvg-logo'] || attrs['logo'] || undefined,
      group,
      tvgId: attrs['tvg-id'] || undefined,
      tvgName: attrs['tvg-name'] || undefined,
      userAgent:
        pending.userAgent ||
        (headers && (headers['User-Agent'] || headers['user-agent'])) ||
        undefined,
      referrer: pending.referrer || undefined,
      headers: mergedHeaders,
    });

    pending = null;
  }

  return {channels, epgUrls: Array.from(new Set(epgUrls)), groups: Array.from(groupSet)};
}

/** Uzak M3U adresini indirip ayrıştırır. */
export async function fetchM3U(
  url: string,
  signal?: AbortSignal,
): Promise<ParsedPlaylist> {
  const res = await fetch(url, {
    signal,
    headers: {'User-Agent': 'Mozilla/5.0 (Linux; Android 13) IPTVPlayer/1.0'},
  });
  if (!res.ok) {
    throw new Error(`Liste indirilemedi (HTTP ${res.status})`);
  }
  const text = await res.text();
  if (!/#EXTM3U|#EXTINF/i.test(text.slice(0, 4096))) {
    throw new Error('Geçerli bir M3U listesi değil.');
  }
  return parseM3U(text);
}
