let settings = null;
let systemFontFamilies = [];

/* 全体設定ウィンドウ */
window.onload = function () {
  setDefaultValues();
  document.getElementById('font_selector').addEventListener('change', updateFontPreview);
  /* メインプロセスにデータ取得要求 */
  window.api.getSetting();
  loadSystemFonts();
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
  settings.showCharacterCount = document.getElementById('character_count_checkbox').checked;

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

/**
 * フォント選択肢を置き換える
 * @param {String[]} fontFamilies フォントファミリー名の一覧
 * @param {String} selectedFont 選択するフォント
 */
function setFontOptions (fontFamilies, selectedFont) {
  const fontSelector = document.getElementById('font_selector');
  const fonts = new Set(fontFamilies);

  // 別OSで保存されたフォントなど、現在の一覧にない設定値も失わないようにする
  if (selectedFont) {
    fonts.add(selectedFont);
  }

  fontSelector.replaceChildren();
  for (const font of fonts) {
    const option = document.createElement('option');
    option.value = font;
    option.textContent = font;
    fontSelector.appendChild(option);
  }

  fontSelector.value = selectedFont;
  updateFontPreview();
}

/**
 * 選択中のフォントをサンプル表示へ反映する
 */
function updateFontPreview () {
  const font = document.getElementById('font_selector').value;
  document.getElementById('font_preview').style.fontFamily = font;
}

/**
 * OSにインストールされているフォントの一覧を取得する
 */
async function loadSystemFonts () {
  const status = document.getElementById('font_load_status');

  status.hidden = true;
  status.textContent = '';

  try {
    const result = await window.api.getSystemFonts();
    if (result.error !== null) {
      const error = new Error(result.error.message);
      error.name = result.error.name;
      throw error;
    }

    systemFontFamilies = [...new Set(result.fonts
      .map((font) => font.trim())
      .filter((font) => font.length > 0))]
      .sort((left, right) => left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: 'base',
      }));

    const selectedFont = document.getElementById('font_selector').value;
    setFontOptions(systemFontFamilies, selectedFont);
  } catch (error) {
    console.warn('システムフォント一覧の取得に失敗しました。', error);
    if (error.name === 'NotAllowedError') {
      status.textContent = 'フォント一覧へのアクセスが許可されませんでした';
    } else {
      status.textContent = 'フォント一覧を取得できませんでした';
    }
    status.hidden = false;
  }
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
  setFontOptions(systemFontFamilies, settings.font);
  document.getElementById('fontsize_textbox').value = settings.fontsize;
  document.getElementById('encoding_selector').value = settings.encoding;
  document.getElementById('autoencoding_checkbox').checked = settings.autoEncoding;
  document.getElementById('topmost_checkbox').checked = settings.topMost;
  document.getElementById('character_count_checkbox').checked = settings.showCharacterCount;

  /* 高度な設定 */
  // 未実装
  // document.getElementById('load_lastfile_checkbox').checked = settings.loadLastFile;
  // document.getElementById('no_close_dialog_checkbox').checked = settings.noCloseDialog;
  // document.getElementById('autosave_checkbox').checked = settings.autoSave;
  // document.getElementById('autosave_input').value = settings.autoSaveSpan;
  // document.getElementById('autolock_checkbox').value = settings.autoLock;
});
