/**
 * Yerel yayın köprüsü (127.0.0.1): Chromium'un doğrudan çözemediği yayınları
 * (HEVC görüntü, AC3/DTS ses, RTMP/RTSP, bozuk çıkışlar) uygulamaya gömülü ffmpeg ile
 * H.264/AAC'ye çevirip düz HTTP olarak oynatıcıya verir. Harici oynatıcı gerekmez.
 *
 *   /probe?u=URL                  → {duration, vcodec, acodec}
 *   /live?u=URL                   → MPEG-TS (canlı yayın)
 *   /vod?u=URL&ss=SANİYE          → parçalı MP4 (film / bölüm, ss'den başlar)
 */
const http = require('http');
const {spawn} = require('child_process');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function netArgs(url) {
  const a = ['-user_agent', UA];
  if (/^https?:/i.test(url)) {
    a.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
  }
  if (/^rtsp/i.test(url)) {
    a.push('-rtsp_transport', 'tcp');
  }
  return a;
}

function probe(ffmpeg, url) {
  return new Promise(resolve => {
    const p = spawn(ffmpeg, ['-hide_banner', ...netArgs(url), '-analyzeduration', '4000000', '-probesize', '4000000', '-i', url], {
      windowsHide: true,
    });
    let err = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), 20000);
    p.stderr.on('data', d => (err += d.toString()));
    p.on('close', () => {
      clearTimeout(timer);
      const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
      const dur = m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
      const v = /Video:\s*([a-z0-9_]+)/i.exec(err);
      const a = /Audio:\s*([a-z0-9_]+)/i.exec(err);
      resolve({duration: dur, vcodec: v ? v[1].toLowerCase() : '', acodec: a ? a[1].toLowerCase() : ''});
    });
    p.on('error', () => resolve({duration: 0, vcodec: '', acodec: ''}));
  });
}

function start(ffmpegPath) {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const src = u.searchParams.get('u');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (!src) {
      res.statusCode = 400;
      return res.end();
    }

    if (u.pathname === '/probe') {
      const info = await probe(ffmpegPath, src);
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify(info));
    }

    const live = u.pathname === '/live';
    const ss = Math.max(0, Number(u.searchParams.get('ss')) || 0);
    // Görüntü H.264 ise kopyala (CPU yok); değilse H.264'e çevir. Ses her zaman AAC.
    const info = u.searchParams.get('v') === 'copy' ? {vcodec: 'h264'} : await probe(ffmpegPath, src);
    const copyVideo = info.vcodec === 'h264';
    const args = ['-hide_banner', '-loglevel', 'error'];
    if (ss > 0) {
      args.push('-ss', String(ss));
    }
    args.push(...netArgs(src), '-fflags', '+genpts+discardcorrupt', '-i', src, '-map', '0:v:0?', '-map', '0:a:0?', '-sn');
    if (copyVideo) {
      args.push('-c:v', 'copy');
    } else {
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-crf', '23', '-vf', "scale='min(1920,iw)':-2", '-pix_fmt', 'yuv420p');
    }
    args.push('-c:a', 'aac', '-b:a', '160k', '-ac', '2');
    if (live) {
      args.push('-f', 'mpegts', '-mpegts_flags', '+resend_headers', 'pipe:1');
    } else {
      args.push('-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1');
    }

    const ff = spawn(ffmpegPath, args, {windowsHide: true});
    res.writeHead(200, {'content-type': live ? 'video/mp2t' : 'video/mp4', 'cache-control': 'no-store'});
    ff.stdout.pipe(res);
    ff.stderr.on('data', d => process.stderr.write(`[ffmpeg] ${d}`));
    const stop = () => {
      try {
        ff.kill('SIGKILL');
      } catch {
        /* yok say */
      }
    };
    res.on('close', stop);
    req.on('aborted', stop);
    ff.on('error', () => res.end());
    ff.on('close', () => res.end());
  });

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({port: server.address().port, server}));
  });
}

module.exports = {start, probe};
