const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  bridgePort: () => ipcRenderer.invoke('bridge-port'),
  setFullscreen: on => ipcRenderer.send('set-fullscreen', on),
});
