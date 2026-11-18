const {app, BrowserWindow, Menu, shell, ipcMain} = require('electron');
const path = require('path');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win;
let meta = {brand: 'pasha', title: 'PashaPlay'};
try {
  meta = require('../dist/brand.json');
} catch {
  /* varsayılan */
}
function create() {
  win = new BrowserWindow({
    width: 1366,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b0b0b',
    title: meta.title,
    icon: path.join(__dirname, '..', 'build', `icon-${meta.brand}.png`),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // IPTV panelleri CORS/karışık içerik (http) kullanır; yalnızca kendi yerel arayüzümüzü yükleriz.
      webSecurity: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  // Bazı paneller "Electron" kimliğini reddeder: normal Chrome gibi bağlan
  const ua = win.webContents.getUserAgent().replace(/\s(Electron|[A-Za-z-]*[Pp]layer|pashaplay-desktop)\/\S+/g, '');
  win.webContents.setUserAgent(ua);
  win.webContents.session.setUserAgent(ua);
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // Dış bağlantılar (WhatsApp, e-posta, fragman) varsayılan tarayıcıda açılır
  win.webContents.setWindowOpenHandler(({url}) => {
    shell.openExternal(url);
    return {action: 'deny'};
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
    }
  });
}

ipcMain.on('set-fullscreen', (_e, on) => win && win.setFullScreen(!!on));

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
app.whenReady().then(create);
app.on('window-all-closed', () => app.quit());
