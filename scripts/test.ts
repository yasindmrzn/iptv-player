/* Parser, akış türü, EPG ve Xtream servisleri için hızlı doğrulama.
 * Çalıştır: npm test
 */
import http from 'node:http';
import {AddressInfo} from 'node:net';
import {gzip} from 'pako';

import {
  getNowNext,
  parseXmltv,
  parseXmltvTime,
  fetchEpg,
} from '../src/services/epg';
import {fetchM3U, parseM3U} from '../src/services/m3uParser';
import {
  chooseEngine,
  detectStreamKind,
  nativeSourceType,
} from '../src/services/streamType';
import {
  episodeUrl,
  fetchSeriesCategories,
  fetchSeriesEpisodes,
  fetchSeriesItems,
  fetchVodDetails,
  trailerUrl,
  fetchVodCategories,
  fetchVodItems,
  fetchXtreamChannels,
  fetchXtreamShortEpg,
  normalizeServer,
  vodUrl,
  xtreamAuthenticate,
  xtreamLiveUrl,
} from '../src/services/xtream';
import {base64ToUtf8, decodeXml} from '../src/utils/text';

let failed = 0;
let passed = 0;

async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${(e as Error).message}`);
  }
}

function eq(actual: unknown, expected: unknown, msg = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(`${msg} beklenen ${b}, gelen ${a}`);
  }
}

const SAMPLE = `﻿#EXTM3U url-tvg="http://epg.example/a.xml.gz, http://epg.example/b.xml"\r
#EXTINF:-1 tvg-id="trt1.tr" tvg-name="TRT 1 HD" tvg-logo="http://logo/trt1.png" group-title="Ulusal",TRT 1 HD\r
http://srv.example/live/trt1.m3u8\r
#EXTINF:-1 tvg-id="x" group-title="Haber, Gündem",CNN Türk, Canlı\r
http://srv.example/live/cnn.ts\r
#EXTINF:-1 group-title="Spor",Spor TV\r
#EXTVLCOPT:http-user-agent=VLC/3.0\r
#EXTVLCOPT:http-referrer=http://ref.example/\r
rtmp://srv.example/live/spor\r
#EXTINF:0,Pipe Kanal\r
http://srv.example/p.m3u8|User-Agent=Kodi%2F20&Referer=http://r.example/\r
#EXTINF:-1,Grupsuz\r
#EXTGRP:Film\r
http://srv.example/film.mpd\r
#EXTINF:-1,Bozuk\r
bu-bir-url-degil\r
#EXTINF:-1,Aynı\r
http://srv.example/same.m3u8\r
#EXTINF:-1,Aynı\r
http://srv.example/same.m3u8\r
http://srv.example/ciplak.m3u8\r
`;

async function main() {
  console.log('\nM3U ayrıştırıcı');
  const p = parseM3U(SAMPLE);

  await t('BOM + CRLF ile geçerli kanalları sayar (bozuk satır atılır)', () => {
    eq(p.channels.length, 8);
  });
  await t('url-tvg adresleri okunur', () => {
    eq(p.epgUrls, ['http://epg.example/a.xml.gz', 'http://epg.example/b.xml']);
  });
  await t('öznitelikler (tvg-id, logo, group) doğru', () => {
    const c = p.channels[0];
    eq([c.name, c.tvgId, c.logo, c.group], [
      'TRT 1 HD',
      'trt1.tr',
      'http://logo/trt1.png',
      'Ulusal',
    ]);
  });
  await t('kanal adındaki ve grup başlığındaki virgüller korunur', () => {
    const c = p.channels[1];
    eq([c.name, c.group], ['CNN Türk, Canlı', 'Haber, Gündem']);
  });
  await t('#EXTVLCOPT user-agent / referrer okunur', () => {
    const c = p.channels[2];
    eq([c.userAgent, c.referrer, c.headers], [
      'VLC/3.0',
      'http://ref.example/',
      {Referer: 'http://ref.example/'},
    ]);
  });
  await t('Kodi "url|Başlık=Değer" sözdizimi ayrıştırılır', () => {
    const c = p.channels[3];
    eq(c.url, 'http://srv.example/p.m3u8');
    eq(c.userAgent, 'Kodi/20');
    eq(c.headers, {'User-Agent': 'Kodi/20', Referer: 'http://r.example/'});
  });
  await t('#EXTGRP ile grup atanır; grupsuz kanal "Diğer" olur', () => {
    eq(p.channels[4].group, 'Film');
    eq(p.channels[7].group, 'Diğer');
  });
  await t('aynı url+isim tekrarında kimlikler benzersiz kalır', () => {
    const ids = p.channels.map(c => c.id);
    eq(new Set(ids).size, ids.length);
  });
  await t('#EXTINF olmayan çıplak URL kanal olarak eklenir', () => {
    eq(p.channels[7].url, 'http://srv.example/ciplak.m3u8');
  });
  await t('gruplar tekrarsız ve sıralı', () => {
    // ilk görülme sırasıyla ("Pipe Kanal" grupsuz olduğundan "Diğer" Film'den önce gelir)
    eq(p.groups, ['Ulusal', 'Haber, Gündem', 'Spor', 'Diğer', 'Film']);
  });
  await t('100.000 kanal < 1,5 sn', () => {
    let big = '#EXTM3U\n';
    for (let i = 0; i < 100000; i++) {
      big += `#EXTINF:-1 tvg-id="c${i}" tvg-logo="http://l/${i}.png" group-title="G${i % 50}",Kanal ${i}\nhttp://s.example/${i}.m3u8\n`;
    }
    const t0 = Date.now();
    const r = parseM3U(big);
    const dt = Date.now() - t0;
    eq(r.channels.length, 100000);
    eq(r.groups.length, 50);
    if (dt > 1500) {
      throw new Error(`çok yavaş: ${dt} ms`);
    }
    console.log(`      (${dt} ms)`);
  });

  console.log('\nAkış türü ve motor seçimi');
  await t('tür tespiti', () => {
    eq(detectStreamKind('http://a/b.m3u8?token=1'), 'hls');
    eq(detectStreamKind('http://a/b.mpd'), 'dash');
    eq(detectStreamKind('http://a/b.ts'), 'ts');
    eq(detectStreamKind('rtmp://a/live/x'), 'rtmp');
    eq(detectStreamKind('rtsp://a/x'), 'rtsp');
    eq(detectStreamKind('http://a/b.mp4'), 'progressive');
    eq(detectStreamKind('http://a:80/user/pass/123'), 'unknown');
    eq(detectStreamKind('http://a/p.m3u8|User-Agent=x'), 'hls');
  });
  await t('motor seçimi: RTMP/RTSP → VLC; iOS DASH/TS → VLC; diğerleri native', () => {
    eq(chooseEngine('rtmp', 'android'), 'vlc');
    eq(chooseEngine('rtsp', 'ios'), 'vlc');
    eq(chooseEngine('dash', 'ios'), 'vlc');
    eq(chooseEngine('ts', 'ios'), 'vlc');
    eq(chooseEngine('dash', 'android'), 'native');
    eq(chooseEngine('hls', 'ios'), 'native');
  });
  await t('native source.type', () => {
    eq([nativeSourceType('hls'), nativeSourceType('dash'), nativeSourceType('ts')], [
      'm3u8',
      'mpd',
      undefined,
    ]);
  });

  console.log('\nEPG (XMLTV)');
  await t('zaman damgası saat dilimi dönüşümü', () => {
    eq(parseXmltvTime('20261103183000 +0300'), Date.UTC(2026, 10, 3, 15, 30, 0));
    eq(parseXmltvTime('20261103183000 -0500'), Date.UTC(2026, 10, 3, 23, 30, 0));
    eq(parseXmltvTime('20261103183000'), Date.UTC(2026, 10, 3, 18, 30, 0));
  });
  await t('metin yardımcıları (XML varlıkları, base64 UTF-8)', () => {
    eq(decodeXml('Tom &amp; Jerry &#231;&#x131; <![CDATA[<b>]]>'), 'Tom & Jerry çı <b>');
    eq(base64ToUtf8(Buffer.from('Günün Haberleri 📺', 'utf8').toString('base64')), 'Günün Haberleri 📺');
  });

  const fmt = (ms: number) => {
    const d = new Date(ms);
    const p2 = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}00 +0000`;
  };
  const buildXml = (NOW: number) => `<?xml version="1.0" encoding="UTF-8"?><tv>
  <channel id="TRT1.tr"><display-name>TRT 1</display-name></channel>
  <programme start="${fmt(NOW - 30 * 60000)}" stop="${fmt(NOW + 30 * 60000)}" channel="TRT1.tr">
    <title lang="tr">Ana Haber &amp; Spor</title><desc>Günün özeti</desc></programme>
  <programme start="${fmt(NOW + 30 * 60000)}" stop="${fmt(NOW + 90 * 60000)}" channel="TRT1.tr">
    <title>Dizi</title></programme>
  <programme start="${fmt(NOW - 72 * 3600000)}" stop="${fmt(NOW - 71 * 3600000)}" channel="TRT1.tr">
    <title>Eski</title></programme>
  <programme start="${fmt(NOW)}" stop="${fmt(NOW + 3600000)}" channel="baska">
    <title>Alakasız</title></programme>
  </tv>`;

  const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);
  const XML = buildXml(NOW);

  await t('parseXmltv: süzme (kanal + zaman penceresi), sıralama, kimlik küçük harf', async () => {
    const epg = await parseXmltv(XML, {
      wantedChannels: new Set(['trt1.tr']),
      now: NOW,
    });
    eq(Object.keys(epg), ['trt1.tr']);
    eq(epg['trt1.tr'].map(x => x.title), ['Ana Haber & Spor', 'Dizi']);
    const {now, next} = getNowNext(epg, 'TRT1.tr', NOW);
    eq([now?.title, next?.title], ['Ana Haber & Spor', 'Dizi']);
  });

  console.log('\nAğ (yerel sahte sunucu): M3U, EPG(.gz), Xtream');
  const nowSec = Math.floor(Date.now() / 1000);
  const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    const json = (o: unknown) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(o));
    };
    if (u.pathname === '/list.m3u') {
      res.end(SAMPLE);
    } else if (u.pathname === '/epg.xml.gz') {
      res.setHeader('content-type', 'text/plain'); // sunucu yanlış tür bildirir
      // fetchEpg gerçek saate göre süzer; bu yüzden XML "şimdi"ye göre üretilir
      res.end(Buffer.from(gzip(buildXml(Date.now()))));
    } else if (u.pathname === '/player_api.php') {
      const ok =
        u.searchParams.get('username') === 'u' &&
        u.searchParams.get('password') === 'p w&d';
      const action = u.searchParams.get('action');
      if (!action) {
        json(ok
          ? {user_info: {auth: 1, status: 'Active', exp_date: '1893456000', max_connections: '2', active_cons: '0'}}
          : {user_info: {auth: 0}});
      } else if (action === 'get_live_categories') {
        json([{category_id: '1', category_name: 'Haber'}, {category_id: '2', category_name: 'Spor'}]);
      } else if (action === 'get_live_streams') {
        json([
          {stream_id: 101, name: 'TRT 1', stream_icon: 'http://x/y.png', epg_channel_id: 'trt1.tr', category_id: '1'},
          {stream_id: 102, name: 'Spor TV', category_id: '2', epg_channel_id: ''},
          {stream_id: 103, name: 'Bilinmeyen', category_id: '999'},
        ]);
      } else if (action === 'get_vod_categories') {
        json([{category_id: '10', category_name: 'Aksiyon'}]);
      } else if (action === 'get_vod_streams') {
        json([
          {stream_id: 501, name: 'Film A', stream_icon: 'http://x/a.jpg', rating: '7.5', category_id: '10', container_extension: 'mkv', added: '1700000300'},
          {stream_id: 502, name: 'Film B', rating: '', category_id: 10, added: '1700000900'},
        ]);
      } else if (action === 'get_vod_info') {
        json({info: {plot: 'Özet metni', genre: 'Aksiyon', releasedate: '2021-05-04', duration: '01:58:00', rating: 7.4, youtube_trailer: 'abc123', backdrop_path: ['http://x/b.jpg']}});
      } else if (action === 'get_series_categories') {
        json([{category_id: '20', category_name: 'Drama'}]);
      } else if (action === 'get_series') {
        json([{series_id: 7, name: 'Dizi X', cover: 'http://x/c.jpg', plot: 'Özet', rating: 8, category_id: '20', last_modified: '1700000500'}]);
      } else if (action === 'get_series_info') {
        json({
          episodes: {
            '2': [{id: '902', episode_num: 1, title: 'S2 B1', season: 2, container_extension: 'mp4'}],
            '1': [
              {id: '901', episode_num: 2, title: 'Final', season: 1, container_extension: 'mkv', info: {duration: '45:00'}},
              {id: '900', episode_num: 1, title: 'Pilot', season: 1, container_extension: 'mkv'},
            ],
          },
        });
      } else if (action === 'get_short_epg') {
        json({
          epg_listings: [{
            title: b64('Ana Haber'),
            description: b64('Günün haberleri'),
            start_timestamp: String(nowSec - 1800),
            stop_timestamp: String(nowSec + 1800),
          }],
        });
      } else {
        res.statusCode = 404;
        res.end();
      }
    } else {
      res.statusCode = 404;
      res.end('yok');
    }
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    await t('fetchM3U uzaktan indirir ve ayrıştırır', async () => {
      const r = await fetchM3U(`${base}/list.m3u`);
      eq(r.channels.length, 8);
    });
    await t('fetchM3U: M3U olmayan yanıtı reddeder', async () => {
      let threw = false;
      try {
        await fetchM3U(`${base}/yok`);
      } catch {
        threw = true;
      }
      eq(threw, true);
    });
    await t('fetchEpg: yanlış içerik türüne rağmen gzip algılanır', async () => {
      const epg = await fetchEpg(`${base}/epg.xml.gz`, new Set(['trt1.tr']));
      eq(Object.keys(epg), ['trt1.tr']);
    });

    const creds = {server: base, username: 'u', password: 'p w&d'};
    await t('xtreamAuthenticate: doğru ve yanlış şifre', async () => {
      const info = await xtreamAuthenticate(creds);
      eq([info.status, info.maxConnections], ['Active', 2]);
      let msg = '';
      try {
        await xtreamAuthenticate({...creds, password: 'yanlis'});
      } catch (e) {
        msg = (e as Error).message;
      }
      eq(msg, 'Kullanıcı adı veya şifre hatalı.');
    });
    await t('fetchXtreamChannels: kategori eşleme + URL + özel karakterli şifre', async () => {
      const r = await fetchXtreamChannels(creds);
      eq(r.channels.map(c => [c.id, c.name, c.group]), [
        ['x101', 'TRT 1', 'Haber'],
        ['x102', 'Spor TV', 'Spor'],
        ['x103', 'Bilinmeyen', 'Diğer'],
      ]);
      eq(r.channels[0].url, `${base}/live/u/p%20w%26d/101.m3u8`);
      eq(r.channels[0].epgChannelId, 'trt1.tr');
      eq(r.channels[1].epgChannelId, undefined);
    });
    await t('fetchXtreamShortEpg: base64 başlık çözülür', async () => {
      const ch = (await fetchXtreamChannels(creds)).channels[0];
      const list = await fetchXtreamShortEpg(creds, ch, 4);
      eq([list[0].title, list[0].description], ['Ana Haber', 'Günün haberleri']);
      eq(list[0].stop > Date.now(), true);
    });
    await t('VOD: kategori, liste, varsayılan uzantı ve URL', async () => {
      const cats = await fetchVodCategories(creds);
      eq(cats, [{id: '10', name: 'Aksiyon'}]);
      const items = await fetchVodItems(creds);
      eq(items.map(v => [v.id, v.name, v.categoryId, v.rating, v.ext]), [
        ['501', 'Film A', '10', '7.5', 'mkv'],
        ['502', 'Film B', '10', undefined, 'mp4'],
      ]);
      eq(items.map(v => v.added), [1700000300, 1700000900]);
      eq(vodUrl(creds, items[0]), `${base}/movie/u/p%20w%26d/501.mkv`);
    });
    await t('Film ayrıntıları ve fragman bağlantısı', async () => {
      const d = await fetchVodDetails(creds, '501');
      eq([d.plot, d.genre, d.year, d.rating, d.trailer, d.backdrop], ['Özet metni', 'Aksiyon', '2021', '7.4', 'abc123', 'http://x/b.jpg']);
      eq(trailerUrl('abc123'), 'https://www.youtube.com/watch?v=abc123');
      eq(trailerUrl('https://y.tv/v'), 'https://y.tv/v');
    });
    await t('Diziler: liste + sezon/bölüm sıralaması + URL', async () => {
      eq(await fetchSeriesCategories(creds), [{id: '20', name: 'Drama'}]);
      const list = await fetchSeriesItems(creds);
      eq([list[0].id, list[0].rating, list[0].plot, list[0].added], ['7', '8', 'Özet', 1700000500]);
      const eps = await fetchSeriesEpisodes(creds, '7');
      eq(eps.map(e => [e.season, e.number, e.title]), [
        [1, 1, 'Pilot'],
        [1, 2, 'Final'],
        [2, 1, 'S2 B1'],
      ]);
      eq(episodeUrl(creds, eps[1]), `${base}/series/u/p%20w%26d/901.mkv`);
    });
    await t('akış türü: Xtream film/dizi dosyaları "file"', () => {
      eq(detectStreamKind('http://s/movie/u/p/1.mkv'), 'file');
      eq(chooseEngine('file', 'ios'), 'vlc');
    });
    await t('normalizeServer / xtreamLiveUrl', () => {
      eq(normalizeServer(' sunucu.com:8080/ '), 'http://sunucu.com:8080');
      eq(normalizeServer('https://s.com//'), 'https://s.com');
      eq(xtreamLiveUrl({server: 's.com', username: 'a', password: 'b'}, 5, 'ts'), 'http://s.com/live/a/b/5.ts');
    });
  } finally {
    server.close();
  }

  console.log(`\n${passed} geçti, ${failed} kaldı\n`);
  process.exit(failed ? 1 : 0);
}

void main();
