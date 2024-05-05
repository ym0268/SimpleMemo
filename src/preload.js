const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // TODO async awaitを入れる
  showMainContextMenu: async () => await ipcRenderer.invoke('show-main-context-menu'),        // コンテキストメニュー表示
  saveFile: (data) => ipcRenderer.invoke('file-save', data),                                  // ファイル保存
  notifyChange: (pagenum) => ipcRenderer.invoke('file-unsaved', pagenum),                     // ファイル未保存通知
  clearMemo: (pagenum) => ipcRenderer.invoke('clear-memo', pagenum),                          // メモクリア
  loadFile: (fileInfo) => ipcRenderer.invoke('file-load', fileInfo),                          // ファイルを開く
  setPageNum: (pagenum) => ipcRenderer.invoke('set-pagenum', pagenum),                        // 現在のページ番号をメインプロセスにセットする
  setFontSize: (fontsize) => ipcRenderer.invoke('set-fontsize', fontsize),                    // フォントサイズ変更通知
  setLockStatusMain: (pageNum) => ipcRenderer.invoke('set-lock-status-main', pageNum),        // メインプロセスのロック状態を設定する
  updateLockStatusMain: () => ipcRenderer.invoke('update-lock-status-main'),                  // メインプロセスのロック状態を更新する

  on: (channel, callback) => ipcRenderer.on(channel, (e, argv) => callback(e, argv)),
});
