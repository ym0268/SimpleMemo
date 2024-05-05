const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // TODO async awaitを入れる
  getSetting: async () => await ipcRenderer.invoke('local-setting-get'), // 現在の設定を取得する
  setSetting: async (data) => await ipcRenderer.invoke('local-setting-set', data), // 設定をセットする

  on: (channel, callback) => ipcRenderer.on(channel, (e, argv) => callback(e, argv)),
});
