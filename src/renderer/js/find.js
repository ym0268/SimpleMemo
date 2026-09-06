/* global Mousetrap */

let isComposing = false;
let compositionEndSearchId = null;

/**
 * Chromiumのページ内検索を開始または継続する
 * @param {Boolean} forward 前方検索の場合はtrue
 * @param {Boolean} newSession 新しい検索の場合はtrue
 */
function startFind (forward, newSession) {
  const query = document.getElementById('find_textbox').value;
  window.findApi.findInPage(query, {
    forward,
    findNext: newSession,
  });
}

/**
 * 検索欄にフォーカスを移す
 * @param {Boolean} selectAll 検索文字列を全選択する場合はtrue
 */
function focusFindTextbox (selectAll) {
  const findTextbox = document.getElementById('find_textbox');
  findTextbox.focus({ preventScroll: true });
  if (selectAll) {
    findTextbox.select();
  }
}

/**
 * 検索バー上で使用するキーバインドをセットする
 */
function setKeyBind () {
  Mousetrap.bind('ctrl+t', () => {
    window.findApi.focusMainEditor();
    return false;
  });
  Mousetrap.bind('ctrl+tab', () => {
    window.findApi.changePage(true);
    return false;
  });
  Mousetrap.bind('ctrl+shift+tab', () => {
    window.findApi.changePage(false);
    return false;
  });
}

window.onload = function () {
  const findTextbox = document.getElementById('find_textbox');

  setKeyBind();

  findTextbox.addEventListener('compositionstart', () => {
    isComposing = true;
  });
  findTextbox.addEventListener('compositionend', () => {
    isComposing = false;
    compositionEndSearchId = window.setTimeout(() => {
      compositionEndSearchId = null;
      startFind(true, true);
    }, 0);
  });
  findTextbox.addEventListener('input', (event) => {
    if (!isComposing && !event.isComposing) {
      if (compositionEndSearchId !== null) {
        window.clearTimeout(compositionEndSearchId);
        compositionEndSearchId = null;
      }
      startFind(true, true);
    }
  });
  findTextbox.addEventListener('keydown', (event) => {
    if (isComposing || event.isComposing) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      startFind(!event.shiftKey, false);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      window.findApi.closeFindBar();
    } else if (event.key === 'F3') {
      event.preventDefault();
      startFind(!event.shiftKey, false);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      focusFindTextbox(true);
    }
  });

  for (const button of document.querySelectorAll('#find_bar button')) {
    button.addEventListener('mousedown', (event) => event.preventDefault());
  }
  document.getElementById('find_previous_button').addEventListener('click', () => startFind(false, false));
  document.getElementById('find_next_button').addEventListener('click', () => startFind(true, false));
  document.getElementById('find_close_button').addEventListener('click', () => window.findApi.closeFindBar());
};

window.findApi.onFindResult((result) => {
  document.getElementById('find_result').textContent = `${result.activeMatchOrdinal}/${result.matches}`;
});

window.findApi.onFocusFind((restart) => {
  focusFindTextbox(true);
  if (restart) {
    startFind(true, true);
  }
});
window.findApi.onFindAgain((forward) => startFind(forward, false));
window.findApi.onRestartFind(() => startFind(true, true));
