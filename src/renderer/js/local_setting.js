let settings = null;

window.onload = function () {
  /* メインプロセスにデータ取得要求 */
  window.api.getSetting();
};

// HTMLから呼び出すためLintは無効化
// eslint-disable-next-line no-unused-vars
function setSetting () {
  /* 設定をセットし、メインプロセスに送信 */
  settings.encoding = document.getElementById('new_encoding_selector').value;
  window.api.setSetting(settings);
}

// HTMLから呼び出すためLintは無効化
// eslint-disable-next-line no-unused-vars
function cancel () {
  window.close();
}

// ---------------------------------------------------
//     IPC
// ---------------------------------------------------

/**
 * 現在の設定を取得し、UIにセット
 */
window.api.on('local-setting-get-result', (event, result) => {
  settings = result;

  document.getElementById('now_encoding_label').innerHTML = settings.encoding;
  document.getElementById('new_encoding_selector').value = settings.encoding;
});
