const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('findApi', {
  findInPage: (query, options) => ipcRenderer.invoke('find-in-page', query, options),
  closeFindBar: () => ipcRenderer.invoke('close-find-bar'),
  onFindResult: (callback) => ipcRenderer.on('find-in-page-result', (event, result) => callback(result)),
  onFocusFind: (callback) => ipcRenderer.on('focus-find', (event, restart) => callback(restart)),
  onFindAgain: (callback) => ipcRenderer.on('find-again', (event, forward) => callback(forward)),
  onRestartFind: (callback) => ipcRenderer.on('restart-find', () => callback()),
});
