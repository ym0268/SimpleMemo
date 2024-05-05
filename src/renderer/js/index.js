/* global Mousetrap */

/* メインウィンドウ */
const WINDOW_TITLE = 'SimpleMemo';
let nowPage = 0;
const MAX_PAGENUM = 3;
let fontSize = 16;
let unsaveList = null;
// let scrollPosList = null;     /* 未使用 */
let saveNotificationId = null;
let lockStatus = null;

// TODO: 20220313 未保存フラグを立てる処理が未記載

window.onload = function () {
  setContextMenu();
  setKeyBind();
  setDragAndDrop();
  setFontSize(fontSize);
  enableTabkey();
  enableDetectChange();
  unsaveList = [...Array(MAX_PAGENUM).keys()].map(() => { return false; });    // 未保存リストをfalseで初期化
  // scrollPosList = [...Array(MAX_PAGENUM).keys()].map((d) => { return 0; });
  lockStatus = [...Array(MAX_PAGENUM).keys()].map(() => { return false; });
  document.getElementById('textarea_0').focus();  // 最初の面にフォーカス
  document.title = WINDOW_TITLE;
};

/**
 * 次の面に遷移する
 */
function nextPage () {
  stopSaveNotification();
  nowPage++;
  if (nowPage >= MAX_PAGENUM) {
    nowPage = 0;
  }
  setPage(nowPage);
}

/**
 * 前の面に遷移する
 */
function prevPage () {
  stopSaveNotification();
  nowPage--;
  if (nowPage < 0) {
    nowPage = MAX_PAGENUM - 1;
  }
  setPage(nowPage);
}

/**
 * テキスト領域の要素を取得する
 * @param {Number} pageNum
 * @returns テキスト領域
 */
function getTextarea (pageNum) {
  const id = 'textarea_' + pageNum.toString();
  return document.getElementById(id);
}

/**
 * ファイル名テキストボックスの要素を取得する
 * @param {Number} pageNum
 * @returns ファイル名テキストボックス
 */
function getFilenameTextbox (pageNum) {
  const id = 'filename_textbox_' + pageNum.toString();
  return document.getElementById(id);
}

/**
 * 表示する面をセットする
 * @param {Number} pagenum セットしたい面番号(0始まり)
 *
 */
function setPage (pagenum) {
  for (let i = 0; i < MAX_PAGENUM; i++) {
    const txtarea = getTextarea(i);
    const fnameTextbox = getFilenameTextbox(i);
    if (pagenum === i) {
      txtarea.style.display = 'block';
      fnameTextbox.style.display = 'block';
      txtarea.focus({ preventScroll: true });      // フォーカスを合わせる
    } else {
      txtarea.style.display = 'none';
      fnameTextbox.style.display = 'none';
    }
  }
  // ボタンの番号を更新
  document.getElementById('sheet_button').innerHTML = (nowPage + 1).toString();
  // メインプロセスに変更を通知
  window.api.setPageNum(nowPage);
  // ロック状態を更新
  updateLockStatus();
  // 未保存表示を更新
  updateUnsavedStatus(unsaveList[nowPage]);
}

/**
 * コンテキストメニューをテキスト入力領域にセットする
 * 画面ロード時に呼び出す
 */
function setContextMenu () {
  for (let i = 0; i < MAX_PAGENUM; i++) {
    const txtarea = getTextarea(i);
    txtarea.addEventListener('contextmenu', () => {
      window.api.showMainContextMenu();
    });
  }
}

/**
 * ファイルを保存する
 */
function saveFile () {
  // ロック中ならファイル保存しない
  if (lockStatus[nowPage]) {
    return;
  }
  const txtarea = getTextarea(nowPage);
  const fnameTextbox = getFilenameTextbox(nowPage);
  const data = {
    pagenum: nowPage,
    filename: fnameTextbox.value,
    text: txtarea.value,
  };
  window.api.saveFile(data);
}

/**
 * 保存完了通知を開始する
 * ファイル名テキストボックスの色を変更する
 * @param {String} color
 */
function startSaveNotification (color) {
  const fnameTextbox = getFilenameTextbox(nowPage);
  fnameTextbox.style.backgroundColor = color;
  saveNotificationId = window.setTimeout(stopSaveNotification, 2000);
}

/**
 * 保存完了通知を終了する
 * タイマ呼び出しを想定
 */
function stopSaveNotification () {
  if (saveNotificationId !== null) {
    clearTimeout(saveNotificationId);
    saveNotificationId = null;
  }
  const fnameTextbox = getFilenameTextbox(nowPage);
  fnameTextbox.style.backgroundColor = 'transparent';
}

// /**
//  * キーを解析し、目的のキーが入力されたかを判定する
//  * デフォルトはオプションキーはFalse
//  * @param {KeyboardEvent} event
//  * @param {Boolean} targetKey
//  * @param {Boolean} ctrlKey
//  * @param {Boolean} shiftKey
//  * @param {Boolean} metakey
//  * @param {Boolean} isComposing
//  *
//  * @return {Boolean} キーが一致したか
//  */
// function keyParser(event, targetKey, ctrlKey=false, shiftKey=false, isComposing=false){
//     return (event.key==targetKey && ctrlKey==ctrlKey && shiftKey==shiftKey && isComposing==isComposing);
// }

/**
 * フォントサイズを指定する（px）
 * @param {Number} size
 */
function setFontSize (size) {
  if (size > 0) {
    for (let i = 0; i < MAX_PAGENUM; i++) {
      const txtarea = getTextarea(i);
      txtarea.style.fontSize = size.toString() + 'px';
      console.log('size=' + size.toString());
    }
    fontSize = size;

    // フォントサイズをメインプロセスに通知
    window.api.setFontSize(fontSize);
  }
}

/**
 * ファイル名テキストボックスとテキストエリアのフォーカスを切り替える
 */
function switchTextboxFocus () {
  const txtarea = getTextarea(nowPage);
  const fnameTextbox = getFilenameTextbox(nowPage);
  if (document.activeElement === txtarea) {
    fnameTextbox.focus({ preventScroll: true });
  } else {
    txtarea.focus({ preventScroll: true });
  }
}

/**
 * ロック状態を更新し、メインプロセスに通知する
 * UI側からロック状態を更新することを想定（ショートカットキーなど）
 */
function setLockStatus (pageNum) {
  /* ロック状態をトグル */
  lockStatus[pageNum] = !lockStatus[pageNum];
  window.api.setLockStatusMain(pageNum);
}

/**
 * ロック状態を更新する
 * 面切り替え時に呼び出す
 */
function updateLockStatus () {
  updateLockStatusUI();
  window.api.updateLockStatusMain();
}

/**
 * 未保存表示を更新する
 * @param {Boolean} unsaved 未保存ならtrue
 * @note
 * 未保存の場合、ウィンドウ名に'*'をつける
 */
function updateUnsavedStatus (unsaved) {
  let title = WINDOW_TITLE;
  if (unsaved === true) {
    title = '*' + title;
  }
  document.title = title;
}

// function handleKeyPress(event){
//     if(keyParser(event, "s", ctrlKey=true)){
//         saveFile();
//     }
//     if(keyParser(event, ".", ctrlKey=true, shiftKey=true)){
//         // フォントサイズ大
//         setFontSize(fontSize+1);
//         console.log("fontsize big");
//     }
//     if(keyParser(event, ",", ctrlKey=true, shiftKey=true)){
//         // フォントサイズ小
//         setFontSize(fontSize-1);
//         console.log("fontsize small");
//     }
//     if(keyParser(event,"Tab", ctrlKey=true, shiftKey=false)){
//         // 面移動
//         nextPage();
//         console.log("next page");
//     }
//     if(keyParser(event, "Tab", ctrlKey=true, shiftKey=true)){
//         // 面移動（逆）
//         prevPage();
//         console.log("prev page")
//     }
// }

/* いろいろお試し */
// window.addEventListener("keyup", handleKeyPress, true);
// window.addEventListener("change", (e) => {console.log("hoge")});
// window.addEventListener("input", (e) => {console.log("input! data=(%s) isComposing=%s detail=%s", e.data, e.isComposing, e.detail)});

// ---------------------------------------------------
//     UI初期設定
// ---------------------------------------------------

/**
 * キーバインドをセットする
 */
function setKeyBind () {
  Mousetrap.bind('ctrl+s', saveFile);
  Mousetrap.bind('ctrl+tab', nextPage);
  Mousetrap.bind('ctrl+shift+tab', prevPage);
  Mousetrap.bind('ctrl+shift+.', () => {
    setFontSize(fontSize + 1);
  });
  Mousetrap.bind('ctrl+shift+,', () => {
    setFontSize(fontSize - 1);
  });
  Mousetrap.bind('ctrl+t', switchTextboxFocus);
  Mousetrap.bind('ctrl+l', () => {
    setLockStatus(nowPage);
    updateLockStatus();
  });
}

/**
 * ドラッグアンドドロップの設定を行う
 */
function setDragAndDrop () {
  for (let i = 0; i < MAX_PAGENUM; i++) {
    const txtarea = getTextarea(i);
    txtarea.ondrop = function (e) {
      /* ファイルのドラッグアンドドロップなら1以上となる */
      if (e.dataTransfer.files.length > 0) {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        const data = {
          path: file.path,
          pagenum: nowPage,
        };
        console.log(data);
        window.api.loadFile(data);
        // return true;
      }
    };
  }
}

/**
 * ロック状態を反映する
 * 面切り替え後に呼び出す
 */
function updateLockStatusUI () {
  if (lockStatus.length === MAX_PAGENUM) {
    const saveButton = document.getElementById('save_button');
    saveButton.disabled = lockStatus[nowPage];
    for (let i = 0; i < lockStatus.length; i++) {
      const filenameBox = getFilenameTextbox(i);
      const txtarea = getTextarea(i);
      filenameBox.readOnly = lockStatus[i];
      txtarea.readOnly = lockStatus[i];
    }
  }
}

/**
 * タブ入力を有効化するコールバック
 */
function onTabKey (e) {
  /* tabキーのkeyCodeは9, 面移動でtabキーを使うため、ctrl同時押しは抑止する. （念のためaltも） */
  if ((e.keyCode === 9) &&
        (e.altKey === false) &&
        (e.ctrlKey === false)) {
    /* デフォルト動作を停止 */
    e.preventDefault();
    const obj = e.target;

    /* カーソル位置、カーソルの左右の文字列を取得 */
    const cursorPosition = obj.selectionStart;
    const cursorLeft = obj.value.substr(0, cursorPosition);
    const cursorRight = obj.value.substr(cursorPosition, obj.value.length);

    /* タブ文字を挟む */
    obj.value = cursorLeft + '\t' + cursorRight;

    /* カーソル位置をタブ文字の後ろに移動 */
    obj.selectionEnd = cursorPosition + 1;
  }
}

/**
 * タブ入力を有効化する
 */
function enableTabkey () {
  for (let i = 0; i < MAX_PAGENUM; i++) {
    const txtarea = getTextarea(i);
    txtarea.addEventListener('keydown', onTabKey);
  }
}

/**
 * 変更通知を行うコールバック（未保存検知用）
 */
function notifyChangeCB () {
  window.api.notifyChange(nowPage);
  unsaveList[nowPage] = true;        // 未保存フラグを立てる
  updateUnsavedStatus(true);          // 未保存表示に更新
}

/**
 * 変更通知を有効化する(未保存検知用)
 */
function enableDetectChange () {
  for (let i = 0; i < MAX_PAGENUM; i++) {
    const txtarea = getTextarea(i);
    txtarea.addEventListener('input', notifyChangeCB);
  }
}

// ---------------------------------------------------
//     IPC
// ---------------------------------------------------

// 何面のセーブが成功したか確認する
window.api.on('save-result', (event, result) => {
  if (result.error !== 0) {
    // エラー発生
    console.log('error');
    // startSaveNotification("red");
  } else if (result.isExternalFile === true) {
    // 外部ファイル保存
    console.log('external file');
    startSaveNotification('LightSalmon');
    unsaveList[result.pagenum] = false;
  } else if (result.saveCount === 1) {
    // 初回保存
    console.log('first save');
    startSaveNotification('Aqua');
    unsaveList[result.pagenum] = false;
  } else {
    // 上書き保存
    console.log('overwrite');
    startSaveNotification('GreenYellow');
    unsaveList[result.pagenum] = false;
  }
  // 未保存表示更新
  updateUnsavedStatus(unsaveList[nowPage]);
});

window.api.on('file-load-result', (event, result) => {
  if (result !== null || result.error === 0) {  // 読込成功
    console.log('読込成功');
    const txtarea = getTextarea(result.pagenum);
    const filenameBox = getFilenameTextbox(result.pagenum);
    console.log(filenameBox);

    txtarea.value = result.text;
    filenameBox.value = result.filename;
  }
});

/**
 * ロック状態を受け取り、各面に反映する
 */
window.api.on('set-lock-status', (event, lockList) => {
  console.log(lockList);
  lockStatus = lockList;
  updateLockStatusUI();
});

/**
 * メモクリア情報を受け取り、面に反映する
 */
window.api.on('clear-memo', (event, data) => {
  const pagenum = data.pageNum;
  const txtarea = getTextarea(pagenum);
  const filenameTextbox = getFilenameTextbox(pagenum);
  txtarea.value = '';
  filenameTextbox.value = '';
  unsaveList[pagenum] = false;
  updateUnsavedStatus(unsaveList[nowPage]);
});

/**
 * 設定をセットする
 * ・フォントサイズ
 * ・フォント
 */
window.api.on('set-settings', (event, settings) => {
  for (let i = 0; i < MAX_PAGENUM; i++) {
    const txtarea = getTextarea(i);
    txtarea.style.fontSize = setFontSize(settings.fontsize);
    txtarea.style.fontFamily = settings.font;
  }
});
