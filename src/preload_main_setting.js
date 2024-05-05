const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // TODO async awaitを入れる
  getSetting: async () => await ipcRenderer.invoke('global-setting-get'),                 // 現在の設定を取得する
  setSetting: async (data) => await ipcRenderer.invoke('global-setting-set', data),       // 設定をセットする
  // cancel: () => ipcRenderer.invoke("global-setting-cancel"),                              // 設定をキャンセルする

  on: (channel, callback) => ipcRenderer.on(channel, (e, argv) => callback(e, argv)),
});
