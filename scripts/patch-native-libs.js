/* npm install sonrası çalışır (postinstall).
 *
 * react-native-vlc-media-player'ın android/build.gradle dosyası, yeni Android
 * Gradle Plugin'in artık kabul etmediği `proguard-android.txt` dosyasını kullanıyor
 * ve release derlemesini şu hatayla durduruyor:
 *   "`getDefaultProguardFile('proguard-android.txt')` is no longer supported"
 * Burada o satır `proguard-android-optimize.txt` ile değiştirilir.
 * Dosya yoksa ya da zaten düzeltilmişse sessizce geçilir.
 */
const fs = require('fs');
const path = require('path');

const file = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-vlc-media-player',
  'android',
  'build.gradle',
);

try {
  const src = fs.readFileSync(file, 'utf8');
  const fixed = src.replace(
    /getDefaultProguardFile\((['"])proguard-android\.txt\1\)/g,
    "getDefaultProguardFile('proguard-android-optimize.txt')",
  );
  if (fixed !== src) {
    fs.writeFileSync(file, fixed);
    console.log('[patch-native-libs] react-native-vlc-media-player düzeltildi.');
  }
} catch (e) {
  if (e.code !== 'ENOENT') {
    console.warn('[patch-native-libs] atlandı:', e.message);
  }
}
