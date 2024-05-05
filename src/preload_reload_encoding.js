const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // TODO async awaitを入れる
  getNowEncoding: async () => await ipcRenderer.invoke('now-encoding-get'),               // 現在のエンコードを取得する
  reloadEncoding: async (data) => await ipcRenderer.invoke('reload-encoding', data),      // 指定した文字コードで再読み込み

  on: (channel, callback) => ipcRenderer.on(channel, (e, argv) => callback(e, argv)),
});
