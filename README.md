# IPTV Player (React Native 0.88 · dikey mod · OLED karanlık tema)

M3U / M3U8 (link veya dosya) ve Xtream Codes destekli, EPG'li IPTV oynatıcı.
Android ve iOS klasörleri hazırdır; ek proje oluşturmanız gerekmez.
Gerekli ayarlar uygulanmıştır: dikey kilit, `minSdkVersion 26`, http yayınlar için cleartext izni.

## Çalıştırma (Android Studio)

Gereken: Node.js 22.11+, JDK 17, Android Studio (SDK + emülatör ya da USB hata ayıklamalı telefon).

```bash
npm install
npm start          # Metro; bu terminal açık kalsın
```
1. Android Studio → **File → Open** → bu projenin içindeki **`android`** klasörünü seçin.
2. Gradle sync bitince cihazı seçip yeşil ▶ düğmesine basın
   (ya da başka terminalde `npm run android`).

Gerçek telefon önerilir; emülatörlerde donanım video çözücüleri sınırlıdır.

### Sık sorunlar
- **`libc++_shared.so` çakışması:** `node_modules/react-native-vlc-media-player/README.md`
  içindeki "Android" bölümündeki gradle bloğunu `android/app/build.gradle` dosyasına ekleyin.
  `pickFirst` kullanmayın (paket belgesine göre libVLC çöker).
- **"Unable to load script":** Metro kapalıdır; `npm start`. Fiziksel cihazda ayrıca
  `adb reverse tcp:8081 tcp:8081`.
- **SDK bulunamadı:** `ANDROID_HOME` tanımlayın ya da `android/local.properties` içine `sdk.dir=...` yazın.

### iOS (macOS gerekir)
```bash
cd ios && pod install && cd ..
npm run ios
```

> Güvenlik notu: `usesCleartextTraffic="true"` (Android) ve `NSAllowsArbitraryLoads` (iOS)
> http yayınlar içindir ve aktarım güvenliğini gevşetir. Yalnızca https kullanacaksanız kapatın.
> iOS'ta ATS'yi gevşetmek App Store incelemesinde sorun çıkarabilir.

## Mimari
```
App.tsx
src/
  services/   m3uParser · xtream · epg · streamType
  store/      useIptvStore (zustand + AsyncStorage)
  components/ VideoPlayer · ChannelItem · CategoryTabs · EpgStrip · SourceModal
  screens/    MainScreen
scripts/test.ts   servis testleri
```

## Oynatıcı motoru
| Yayın | Android | iOS |
|---|---|---|
| HLS, mp4/mkv | ExoPlayer (Media3) | AVPlayer |
| DASH, ham TS | ExoPlayer | VLC |
| RTMP, RTSP | VLC | VLC |

Native motor yayını açamazsa otomatik VLC'ye geçilir; ardından 3 kez artan beklemeyle
yeniden denenir. HEVC/VP9/AV1/AC3/EAC3/DTS desteği cihazın çözücülerine bağlıdır.

## EPG
- M3U: `url-tvg` ya da kaynak eklerken girilen XMLTV adresi (`.gz` otomatik açılır).
- Xtream: kanal seçilince yalnızca o kanalın programı (`get_short_epg`) çekilir.

## Komutlar
```bash
npm run typecheck      # tsc --noEmit
npm run test:services  # 24 test: parser, EPG, Xtream (yerel sahte sunucu)
```

## Bilinen sınırlar
- Uygulama gerçek cihazda/emülatörde henüz denenmedi; servisler test edildi, proje tip denetiminden geçti.
  Oynatıcı davranışı, VLC seçenekleri ve dosya seçici cihazda doğrulanmalıdır.
- HDS (.f4m) desteklenmiyor.
- Canlı yayın odaklı: VOD için sarma kontrolü yok. Yalnızca dikey mod.
