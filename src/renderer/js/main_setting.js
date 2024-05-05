let settings = null;

/* 全体設定ウィンドウ */
window.onload = function () {
  setDefaultValues();
  /* メインプロセスにデータ取得要求 */
  window.api.getSetting();
};

// HTMLから呼び出すためLintは無効化
// eslint-disable-next-line no-unused-vars
function setSetting () {
  console.log('set');

  /* 基本設定 */
  settings.savepath = document.getElementById('savepath_textbox').value;
  settings.font = document.getElementById('font_selector').value;
  settings.fontsize = parseInt(document.getElementById('fontsize_textbox').value);
  settings.encoding = document.getElementById('encoding_selector').value;
  settings.autoEncoding = document.getElementById('autoencoding_checkbox').checked;
  settings.topMost = document.getElementById('topmost_checkbox').checked;

  /* 高度な設定 */
  // TODO

  // 設定を送信
  window.api.setSetting(settings);
}

// HTMLから呼び出すためLintは無効化
// eslint-disable-next-line no-unused-vars
function cancel () {
  window.close();
}

/**
 * 初期値をセットする
 */
function setDefaultValues () {
}

// ---------------------------------------------------
//     IPC
// ---------------------------------------------------

/**
 * 現在の設定を取得
 */
window.api.on('global-setting-get-result', (event, result) => {
  settings = result;  // グローバルにセット（ここで設定しない値もあるため）

  /* 基本設定 */
  document.getElementById('savepath_textbox').value = settings.savepath;
  document.getElementById('font_selector').value = settings.font;
  document.getElementById('fontsize_textbox').value = settings.fontsize;
  document.getElementById('encoding_selector').value = settings.encoding;
  document.getElementById('autoencoding_checkbox').checked = settings.autoEncoding;
  document.getElementById('topmost_checkbox').checked = settings.topMost;

  /* 高度な設定 */
  document.getElementById('load_lastfile_checkbox').checked = settings.loadLastFile;
  document.getElementById('no_close_dialog_checkbox').checked = settings.noCloseDialog;
  document.getElementById('autosave_checkbox').checked = settings.autoSave;
  document.getElementById('autosave_input').value = settings.autoSaveSpan;
  document.getElementById('autolock_checkbox').value = settings.autoLock;
});
