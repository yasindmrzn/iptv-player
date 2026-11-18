import React, {useEffect} from 'react';

/** Masaüstünde libVLC yok: RTMP/RTSP kaynaklar uygulamanın hata/yeniden deneme akışına düşer. */
export function VLCPlayer(props: {onError?: () => void}) {
  useEffect(() => {
    const t = setTimeout(() => props.onError?.(), 50);
    return () => clearTimeout(t);
  }, [props]);
  return null;
}
