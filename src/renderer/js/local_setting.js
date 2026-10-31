let settings = null;

window.onload = function () {
  document.getElementById('cancel_button').addEventListener('click', cancel);
  document.getElementById('ok_button').addEventListener('click', setSetting);
  /* メインプロセスにデータ取得要求 */
  window.api.getSetting();
};

function setSetting () {
  /* 設定をセットし、メインプロセスに送信 */
  settings.encoding = document.getElementById('new_encoding_selector').value;
  window.api.setSetting(settings);
}

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

  document.getElementById('now_encoding_label').textContent = settings.encoding;
  document.getElementById('new_encoding_selector').value = settings.encoding;
});
