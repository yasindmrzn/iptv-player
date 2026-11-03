/** Binary string / bayt dizisinden UTF-8 metne (TextDecoder bağımsız). */
export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  const CHUNK = 0x2000;
  let buf: number[] = [];
  const flush = () => {
    out += String.fromCharCode.apply(null, buf);
    buf = [];
  };

  for (let i = 0; i < bytes.length; ) {
    const b0 = bytes[i++];
    let cp: number;
    if (b0 < 0x80) {
      cp = b0;
    } else if (b0 >= 0xc0 && b0 < 0xe0 && i < bytes.length) {
      cp = ((b0 & 0x1f) << 6) | (bytes[i++] & 0x3f);
    } else if (b0 >= 0xe0 && b0 < 0xf0 && i + 1 < bytes.length) {
      cp = ((b0 & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else if (b0 >= 0xf0 && b0 < 0xf8 && i + 2 < bytes.length) {
      cp =
        ((b0 & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
    } else {
      cp = 0xfffd;
    }

    if (cp > 0xffff) {
      cp -= 0x10000;
      buf.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else {
      buf.push(cp);
    }
    if (buf.length >= CHUNK) {
      flush();
    }
  }
  flush();
  return out;
}

const B64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 → UTF-8 metin. Xtream short-EPG başlıkları bu biçimde gelir. */
export function base64ToUtf8(input: string): string {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : -1;
    const d = i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : -1;
    bytes.push((a << 2) | (b >> 4));
    if (c !== -1) {
      bytes.push(((b & 15) << 4) | (c >> 2));
    }
    if (d !== -1) {
      bytes.push(((c & 3) << 6) | d);
    }
  }
  return utf8Decode(Uint8Array.from(bytes));
}

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** XML varlıklarını (&amp; &#231; &#xE7; ...) çözer ve CDATA'yı açar. */
export function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ent: string) => {
      if (ent[0] === '#') {
        const code =
          ent[1] === 'x' || ent[1] === 'X'
            ? parseInt(ent.slice(2), 16)
            : parseInt(ent.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return NAMED[ent.toLowerCase()] ?? m;
    })
    .trim();
}

export const yieldToUi = () => new Promise<void>(r => setTimeout(r, 0));
