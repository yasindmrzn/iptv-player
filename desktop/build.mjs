import {build} from 'esbuild';
import {cpSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const BRAND = process.env.BRAND === 'paris' ? 'paris' : 'pasha';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const sh = f => path.join(here, 'shims', f);
const nm = f => path.join(here, 'node_modules', f);

rmSync(path.join(here, 'dist'), {recursive: true, force: true});
mkdirSync(path.join(here, 'dist/fonts'), {recursive: true});

const alias = {
  'react-native': sh('react-native.ts'),
  'react-native-safe-area-context': sh('safe-area.tsx'),
  'react-native-orientation-locker': sh('orientation.ts'),
  'react-native-video': sh('video.tsx'),
  'react-native-vlc-media-player': sh('vlc.tsx'),
  '@react-native-async-storage/async-storage': sh('async-storage.ts'),
  // paylaşılan paketler masaüstü node_modules'tan çözülsün
  react: nm('react'),
  'react-dom': nm('react-dom'),
  zustand: nm('zustand'),
  pako: nm('pako'),
  'react-native-web': nm('react-native-web'),
};

const immersive = {
  name: 'immersive',
  setup(b) {
    b.onResolve({filter: /utils\/immersive$/}, () => ({path: sh('immersive.ts')}));
  },
};

await build({
  entryPoints: [path.join(here, 'entry.tsx')],
  outfile: path.join(here, 'dist/app.js'),
  bundle: true,
  minify: true,
  sourcemap: false,
  platform: 'browser',
  target: 'chrome120',
  format: 'iife',
  alias,
  plugins: [immersive],
  nodePaths: [path.join(here, 'node_modules')],
  loader: {'.png': 'dataurl', '.ttf': 'file'},
  define: {
    __DEV__: 'false',
    __BRAND__: JSON.stringify(BRAND),
    'process.env.NODE_ENV': '"production"',
    global: 'window',
  },
  resolveExtensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.web.js', '.js', '.mjs', '.json'],
  logLevel: 'info',
});

cpSync(path.join(here, 'index.html'), path.join(here, 'dist/index.html'));
for (const f of ['Medium', 'SemiBold', 'Bold', 'ExtraBold']) {
  cpSync(
    path.join(root, `android/app/src/main/assets/fonts/Montserrat-${f}.ttf`),
    path.join(here, `dist/fonts/Montserrat-${f}.ttf`),
  );
}
writeFileSync(
  path.join(here, 'dist/brand.json'),
  JSON.stringify({brand: BRAND, title: BRAND === 'paris' ? 'ParisPlayer' : 'PashaPlay'}),
);
console.log('dist hazır:', BRAND);
