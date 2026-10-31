let settings = null;

window.onload = function () {
  document.getElementById('cancel_button').addEventListener('click', cancel);
  document.getElementById('ok_button').addEventListener('click', reloadEncoding);
  /* メインプロセスにデータ取得要求 */
  window.api.getNowEncoding();
};

function reloadEncoding () {
  /* 設定をセットし、メインプロセスに送信 */
  settings.encoding = document.getElementById('new_encoding_selector').value;
  window.api.reloadEncoding(settings);
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
window.api.on('now-encoding-get-result', (event, result) => {
  settings = result;

  document.getElementById('now_encoding_label').textContent = settings.encoding;
  document.getElementById('new_encoding_selector').value = settings.encoding;
});
