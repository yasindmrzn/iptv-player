const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  setFullscreen: on => ipcRenderer.send('set-fullscreen', on),
});
