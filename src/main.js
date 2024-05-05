'use strict';

const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const encoding = require('encoding-japanese');

// ======== ポータブルビルド ===========
// electron-builderのportableビルドを行う場合はtrue
const PORTABLE_BUILD = false;
// ====================================

let mainWindow = null;
let globalSettingWindow = null;
let localSettingWindow = null;
let reloadEncodingWindow = null;
let versionWindow = null;
let mainWindowContextMenu = null;
const MAX_PAGENUM = 3;
const MAIN_WINDOW = path.join(__dirname, 'renderer/index.html');
const MAIN_SETTING_WINDOW = path.join(__dirname, 'renderer/main_setting.html');       // 全体設定
const LOCAL_SETTING_WINDOW = path.join(__dirname, 'renderer/local_setting.html');      // 個別設定
const RELOAD_ENCODING_WINDOW = path.join(__dirname, 'renderer/reload_encoding.html');   // 読込文字コード変更
const VERSION_WINDOW = path.join(__dirname, 'renderer/version_window.html');     // バージョン情報
const FILE_WARNING_SIZE = 1 * 1024 * 1024;  // 1MB
const DIALOG_TITLE = 'SimpleMemo';

const rootDirectory = PORTABLE_BUILD ? process.env.PORTABLE_EXECUTABLE_DIR : './';
const SETTING_FILENAME = path.join(rootDirectory, 'settings.json');              // 設定ファイル

let memoManager = null;      // メモ管理オブジェクト

const USE_DEV_TOOL = false;     // デバッグ用：developer toolを表示するか

const MEMO_ERROR = {
  OK: 0,    // エラーなし

  /* ファイル系 */
  FILE_EXIST: 1,    // ファイルが存在する
  NO_ENTRY: 2,    // ファイルやディレクトリが存在しない（不正なファイル名を含む）
  NO_DIR: 3,    // ディレクトリが存在しない
  LONGPATH: 4,    // パスが長すぎます
  INV_FNAME: 5,    // ファイル名が不正
  FNAME_COLON: 6,    // ファイル名にコロンが含まれている
  NO_FILENAME: 7,    // ファイル名が入力されていない
  SAMENAME: 8,    // 開いているファイルと同名
  LARGEFILE: 9,    // ファイルサイズが巨大
  ALREDYOPEN: 10,   // すでにオープン済み
  LEAVEMEMO: 11,   // メモが残っている
  BUSY: 12,   // リソースが使用中かロックされている(EBUSY)

  /* 設定系 */
  INV_FONTSIZE: 30,   // フォントサイズの値が不正
  PARAM: 31,   // パラメータが不正

  /* その他 */
  ERROR: -1,  // その他エラー（汎用）
};

// 名前: {encoding: string, bom: boolean} (予定)
const ENCODING_TABLE = {
  UTF8: { encoding: 'UTF8', bom: false },
  UTF8_BOM: { encoding: 'UTF8', bom: true },   // encodingモジュール非対応
  SJIS: { encoding: 'SJIS', bom: null },
  JIS: { encoding: 'JIS', bom: null },
  EUCJP: { encoding: 'EUCJP', bom: null },
  UTF16: { encoding: 'UTF16', bom: null },      // UTF16BE no BOM 内部処理用
  UTF16BE: { encoding: 'UTF16BE', bom: false },
  UTF16LE: { encoding: 'UTF16LE', bom: false },
  UTF16BE_BOM: { encoding: 'UTF16BE', bom: true },
  UTF16LE_BOM: { encoding: 'UTF16LE', bom: true },
  UNICODE: { encoding: 'UNICODE', bom: null },     // 内部処理用
};

/**
 * 文字コード変換・推定
 * encoding-japaneseのラッパ
 */
class EncodingConverter {
  static bom_utf8 = new Uint8Array([0xEF, 0xBB, 0xBF]);
  static bom_utf16be = new Uint8Array([0xFE, 0xFF]);
  static bom_utf16le = new Uint8Array([0xFF, 0xFE]);

  /**
   * BOMの種類を判別する
   * @param {Buffer | String} text
   * @return {String | null} 検出したBOMの種類. BOMがなければnull
   */
  static checkBOM (text) {
    let result = null;
    let textarr = null;
    if (typeof (text) === 'string') {
      // textarr = (new TextEncoder).encode(text);            // 不可
      // textarr = Buffer.from(text, {encoding: 'binary'});   // 不可
      textarr = encoding.stringToCode(text);                  // 可
    } else {
      textarr = text;
    }
    // console.log(textarr[0].toString(16) + ', ' +  textarr[1].toString(16) + ', ' + textarr[2].toString(16));

    if ((textarr[0] === this.bom_utf8[0]) && (textarr[1] === this.bom_utf8[1]) && (textarr[2] === this.bom_utf8[2])) {
      result = 'UTF8';
    } else if ((textarr[0] === this.bom_utf16be[0]) && (textarr[1] === this.bom_utf16be[1])) {
      result = 'UTF16BE';
    } else if ((textarr[0] === this.bom_utf16le[0]) && (textarr[1] === this.bom_utf16le[1])) {
      result = 'UTF16LE';
    }
    return result;
  }

  /**
   * BOMを付加する
   * BOMがなければ付加する
   * @param {String} text 文字列
   * @param {String} enc  文字コード
   * @return {String}     BOMを付加したテキスト
   */
  static addBOM (text, enc) {
    let textarr = text;
    if (typeof (text) === 'string') {
      textarr = encoding.stringToCode(text);
    }

    const isBOM = this.checkBOM(textarr);
    // BOMがついていなければ付加
    if (isBOM == null) {
      if (enc === 'UTF8') {
        textarr = new Uint8Array([...this.bom_utf8, ...textarr]);
      } else if (enc === 'UTF16BE') {
        textarr = new Uint8Array([...this.bom_utf16be, ...textarr]);
      } else if (enc === 'UTF16LE') {
        textarr = new Uint8Array([...this.bom_utf16le, ...textarr]);
      }
    }
    const newtext = encoding.codeToString(textarr);
    return newtext;
  }

  /**
   * BOMを削除する
   * BOMがある場合は削除する
   * @param {String} text 文字列
   * @return {String}     BOMを削除した文字列
   */
  static removeBOM (text) {
    let textarr = text;
    if (typeof (text) === 'string') {
      textarr = encoding.stringToCode(text);
    }
    const enc = this.checkBOM(textarr);  // BOMがついていれば削除
    if (enc === 'UTF8') {
      textarr.splice(0, 3);   // 先頭3バイト削除
    } else if (['UTF16BE', 'UTF16LE'].includes(enc)) {
      textarr.splice(0, 2);   // 先頭2バイト削除
    }
    const newtext = encoding.codeToString(textarr);
    return newtext;
  }

  /**
   * 文字コードを推定する
   * @param {String | RawType} data
   * @param {String} defaultEncoding
   * @return {Object} {encoding: 文字コード, bom: BOMの有無}
   */
  static detect (data, defaultEncoding) {
    let bom = null;
    let enc = encoding.detect(data);
    if (enc === false || !Object.keys(ENCODING_TABLE).includes(enc)) { // UNICODE許容
      // 文字コード推定失敗
      enc = defaultEncoding;
    } else {
      // UTF16 BE or LE判定
      if (enc === 'UTF16') {
        const ret = encoding.detect(data, 'UTF16BE');
        enc = ret ? 'UTF16BE' : 'UTF16LE';
      }
      // BOM有無判定
      if (['UTF8', 'UTF16', 'UTF16BE', 'UTF16LE'].includes(enc)) {
        const res = this.checkBOM(data);
        bom = res != null; // 何のBOMかまでは判定しない
      }
    }
    return { encoding: enc, bom };
  }

  /**
   * 文字コードを変換する
   * @param {RawType} data テキストデータ
   * @param {Object} params encoding-japaneseの引数. typeは'string'のみ可
   * @return {String} 変換後の文字列
   */
  static convert (data, params) {
    // typeはstringのみ対応
    if (params.type !== 'string') {
      throw new Error('[EncodingConverter.convert()] params[\'type\'] can only specify \'string\'.');
    }
    let ret = encoding.convert(data, params);
    // BOMの付加、削除（bomがnullなら何もしない）
    if (params.bom === true) {
      ret = this.addBOM(ret, params.to);
    } else if (params.bom === false) {
      ret = this.removeBOM(ret);
    }
    return ret;
  }
}

/**
 * メモクラス(TODO: クラスは別ファイルに分ける)
 *
 * ・保存済みか
 * ・保存先パス
 * ・外部読み込みファイルか
 */
class Memo {
  constructor (defaultSavePath, defaultEncoding = 'UTF8', autoencoding = true) {
    // 定数
    this.fname_check_pattern = /^.*[\\|/|:|\*|?|\"|<|>|\|].*$/; // ファイル名チェック用パターン（要検討）
    this.JS_ENCODE = 'UNICODE';     // Javascript内で扱うエンコード

    // グローバル設定
    this.defaultSavePath = defaultSavePath;   // デフォルトの保存先パス
    this.defaultEncoding = defaultEncoding;   // デフォルトの文字コード
    this.autoencoding = autoencoding;      // 自動文字コード識別を行うか

    // 個別設定
    this.savedirpath;            // 保存先パス
    this.encoding;               // 文字コード
    this._isExternalFile;        // 外部ファイルか
    this.filename;               // ファイル名（初回保存時にセットする） <- 不要かも
    this.saveCount;              // 保存回数
    this.savepath;               // 保存先フルパス(保存先ファイル存在判定用、保存に成功したパス）

    this.unsaved = false;        // 未保存か
    this.locked = false;         // ロック（編集不可）状態か

    this.clear();                // 情報リセット
  }

  get isExternalFile () {
    return this._isExternalFile;
  }

  /**
   * 未保存フラグを立てる
   */
  setUnsaved () {
    this.unsaved = true;
  }

  /**
   * 未保存かどうかを取得する
   * @return {Boolean} 未保存ならtrue
   */
  getUnsaved () {
    return this.unsaved;
  }

  /**
   * EncodingConverter.detect()のラッパ
   * @param {String | RawType} data
   * @param {String} defaultEncoding
   * @return {String}                 文字コード種別
   */
  detectEncoding (data, defaultEncoding) {
    const ret = EncodingConverter.detect(data, defaultEncoding);
    let enc = ret.encoding;
    if ((enc === 'UTF8') && ret.bom === true) {
      enc = 'UTF8_BOM';
    } else if ((enc === 'UTF16LE') && ret.bom === true) {
      enc = 'UTF16LE_BOM';
    } else if ((enc === 'UTF16BE') && ret.bom === true) {
      enc = 'UTF16BE_BOM';
    }
    return enc;
  }

  /**
   * 文字コードを変換する
   * @param {String} text     変換対象のテキスト
   * @param {String} target   変換先の文字コード。ENCODING_TABLEのキーから選択
   * @param {String} from     変換元の文字コード。ENCODING_TABLEのキーから選択。nullで自動推定
   * @param {Boolean} update  Memoの文字コード(this.encoding)を更新するか
   * @return {String}         変換後のテキスト
   */
  convertEncoding (text, { target, from, update = false } = {}) {
    let res = null;
    if (from == null) {
      // 文字コード自動推定
      from = this.detectEncoding(text, this.encoding);
      if (update) {
        this.encoding = from;
      }
    } else {
      // 文字コード指定
      this.encoding = update ? from : this.encoding;  // 文字コード更新
    }
    if (target !== from) {
      console.log('target=');
      console.log(ENCODING_TABLE[target]);
      console.log('from=');
      console.log(ENCODING_TABLE[from]);
      res = EncodingConverter.convert(text, {
        to: ENCODING_TABLE[target].encoding,
        from: ENCODING_TABLE[from].encoding,
        type: 'string',
        bom: ENCODING_TABLE[target].bom,
      });
    } else {
      res = text;
    }
    return res;
  }

  /**
   * ファイル情報を取得する
   * UI側で呼び出すことを想定（文字コード変更画面など）
   */
  getFileInfo () {
    /* 必要になれば増やすこと */
    const info = {
      encoding: this.encoding,
      isExternalFile: this._isExternalFile,
    };
    return info;
  }

  /**
   * 外部ファイルを読み込む
   * @param {String} filepath 読み込むファイルのパス
   * @param {Boolean} ignoreFsize ファイルサイズ判定を無視するか
   * @param {Boolean} overwrite メモが残っているとき、上書きロードするか
   * @param {String} encoding 文字コードを指定して読み込む場合に設定
   * @return {Object} 読み込んだテキストデータの情報
   *
   * @notes
   * 読み込むファイルのサイズが一定以上の場合、警告を出す
   * メモが残っている場合、警告を出す
   *
   * @bugs
   * TODO: UTF16の文字コード判別ができなくなった。
   */
  load (filepath, { ignoreFsize = false, overwrite = false, encoding = null } = {}) {
    let err = MEMO_ERROR.OK;
    let buf = null;             // 読み込んだテキスト
    if (overwrite === false && (this.unsaved === true || this.savepath !== null)) {
      // メモが残っているか確認（未保存でも記入済みの場合、保存先パスがセットされている場合（一度保存したか、外部読み込みしたか））
      err = MEMO_ERROR.LEAVEMEMO;
    } else if (!fs.existsSync(filepath)) {
      /* ファイル存在確認 */
      /* TODO: ファイルのアクセス権限判定もすべき */
      err = MEMO_ERROR.NO_ENTRY;
    } else {
      /* ファイルサイズ判定 */
      const stat = fs.statSync(filepath);
      if ((ignoreFsize === false) && (stat.size > FILE_WARNING_SIZE)) {
        err = MEMO_ERROR.LARGEFILE;
      }
    }
    if (err === MEMO_ERROR.OK) {
      try {
        // ファイル読込
        // buf = fs.readFileSync(filepath, {encoding:'binary'});
        buf = fs.readFileSync(filepath);
      } catch (e) {
        switch (e.code) {    // TODO:仮実装
          case 'EBUSY':
            err = MEMO_ERROR.BUSY;
            break;
          default:
            err = MEMO_ERROR.ERROR;
            break;
        }
      }
    }
    if (err === MEMO_ERROR.OK) {
      // 読込成功
      this.clear();
      this.setExternalFile(filepath);

      // 文字コード変換
      if (encoding !== null) {
        // 文字コード指定の場合、文字コード名チェック
        const encodingCheck = this.checkEncodingName(encoding);
        if (encodingCheck !== MEMO_ERROR.OK) {
          err = MEMO_ERROR.PARAM;
        }
      }
      if (err === MEMO_ERROR.OK) {
        let from = this.autoencoding ? null : this.encoding;    // 自動文字コード推定判定
        from = (encoding === null) ? from : encoding;              // encodingがnullでなければその文字コードで読み込み
        buf = this.convertEncoding(buf, { target: this.JS_ENCODE, from, update: true });
      }
    }

    const data = {
      text: buf,
      filename: this.filename,
      error: err,
    };
    return data;
  }

  /**
   * 外部ファイル情報をセットする
   * 外部ファイルを読み込んだ場合に実行すること
   * @param {String} fullpath 読み込んだファイルのフルパス
   * @return {Boolean} セットに成功したか（ファイルが存在しない場合はfalse）
   */
  setExternalFile (fullpath) {
    this._isExternalFile = true;
    this.savedirpath = path.dirname(fullpath);
    this.filename = path.basename(fullpath);
    this.savepath = fullpath;
  }

  /**
   * 新規ファイル情報をセットする
   * 新規ファイルを作成するときに実行すること
   * @param {String} filename
   */
  setNewFile () {
    this.savedirpath = this.defaultSavePath;
    this._isExternalFile = false;
    this.saveCount = 0;
    // this.savepath = null;  // 必要ないかも
  }

  /**
   * ファイル名に拡張子を付加する
   * 内部生成ファイルのときに.txtを付加する
   * @param {String} filename
   */
  addExtension (filename) {
    if (!this._isExternalFile) {
      filename = filename + '.txt';  // アプリ内作成ファイルの場合、拡張子を付加
    }
    return filename;
  }

  /**
   * ファイル名に不正な文字が含まれていないかチェックする
   * @param {String} filename
   */
  checkFilename (filename) {
    let err = MEMO_ERROR.OK;
    const ret = this.fname_check_pattern.test(filename);
    if (ret) {
      err = MEMO_ERROR.INV_FNAME;
    }
    return err;
  }

  /**
   * ファイルを保存する
   * @param {String} filename ファイル名（フォルダ名含まず）
   * @param {String} text     テキストデータ
   * @param {Boolean} overwrite ファイルが存在する場合に上書きするか（初回書き込みのみ有効）
   *
   * @return {Number} result 書き込み回数（書き込みに失敗した場合は負数を返す）
   *
   * @notes
   * アプリ内新規作成ファイルの場合、ファイル名に拡張子をつけない（.txtを自動付加するため）
   * ファイル名がオブジェクト内に保持しているファイル名と一致しない場合、新規ファイルとして保存する
   * 初回保存時、ファイルがすでにある場合は警告を出す（か、戻り値で教える）
   * エラーの場合は例外を起こしてもよさそう
   * 文字コード指定も行うこと
   *
   */
  save (filename, text, { overwrite = false } = {}) {
    let error = MEMO_ERROR.OK;
    let wFlag = 'wx';           // デフォルトは上書き禁止モード
    let tmpEncoding = null;    // 保存失敗時に元のencodingに戻すための変数

    if (filename === null || filename === '') {
      // ファイル名が入力されていない
      error = MEMO_ERROR.NO_FILENAME;
    } else if (!fs.existsSync(this.savedirpath)) {
      // 保存先が存在しない
      error = MEMO_ERROR.NO_DIR;
    } else if (this.checkFilename(filename) !== MEMO_ERROR.OK) {
      error = MEMO_ERROR.INV_FNAME;
    } else {
      const filenameWithExt = this.addExtension(filename); // 拡張子付加
      const savepath = path.join(this.savedirpath, filenameWithExt);

      // 外部読み込みファイル、上書き可または保存先が前回と一致した場合は上書きモード
      if ((this._isExternalFile === true) || (overwrite === true) || (savepath === this.savepath)) {
        wFlag = 'w';
      }

      // 外部ファイルではなく、新規保存だと思われる場合はデフォルトエンコーディングをセット */
      if ((this._isExternalFile === false) && (savepath !== this.savepath)) {
        tmpEncoding = this.encoding;   // 保存失敗時用
        this.encoding = this.defaultEncoding;
      }

      // 文字コード変換
      text = this.convertEncoding(text, { target: this.encoding, from: this.JS_ENCODE, update: false });

      // 保存
      try {
        fs.writeFileSync(savepath, text, { flag: wFlag, encoding: 'binary' });
        if (savepath !== this.savepath) {
          this.setNewFile();  // 新規保存
        }
        this.savepath = savepath;   // 保存先を保存
        this.saveCount++;           // 保存回数を更新
        this.unsaved = false;       // 保存済みに変更
      } catch (e) {
        this.encoding = tmpEncoding;  // エンコードを元に戻す
        switch (e.code) {
          case 'ENOENT':
            error = MEMO_ERROR.NO_ENTRY;
            break;
          case 'EEXIST':
            error = MEMO_ERROR.FILE_EXIST;
            break;
          case 'EBUSY':
            error = MEMO_ERROR.BUSY;
            break;
          default:
            console.log(e);
            error = MEMO_ERROR.ERROR;
            break;
        }
      }
    }
    const result = {
      saveCount: this.saveCount,
      isExternalFile: this._isExternalFile,
      error,
    };
    return result;
  }

  /**
   * メモの内容をクリアする
   * UI側クリア時にコールする
   */
  clear () {
    this.savedirpath = this.defaultSavePath;
    this.encoding = this.defaultEncoding;
    this._isExternalFile = false;
    this.saveCount = 0;
    this.savepath = null;
    this.unsaved = false;
  }

  /**
   * デフォルトの保存先パスをセットする
   * @param {String} newSavePath
   */
  setDefaultSavePath (newSavePath) {
    this.defaultSavePath = newSavePath;
    // 外部読み込みファイルでなければ保存先を変更する (一度保存済みのファイルも更新されるのは仕様)
    if (!this._isExternalFile) {
      this.savedirpath = newSavePath;
    }
  }

  /**
   * エンコード名が正しいかチェックする
   * @param {String} encoding
   * @return {MEMO_ERROR}
   */
  checkEncodingName (encoding) {
    let err = MEMO_ERROR.OK;
    if (encoding === 'UNICODE') {
      // UNICODEは内部処理にのみ使用
      err = MEMO_ERROR.ERROR;
    } else if (!Object.keys(ENCODING_TABLE).includes(encoding)) {
      err = MEMO_ERROR.ERROR;
    }
    return err;
  }

  /**
   * デフォルトの文字コードをセットする
   * @param {string} newEncoding
   * @return {MEMO_ERROR}
   */
  setDefaultEncoding (newEncoding) {
    const err = this.checkEncodingName(newEncoding);
    if (err === MEMO_ERROR.OK) {
      this.defaultEncoding = newEncoding;
      // 外部ファイルではなく、１度も保存していなければデフォルトエンコーディングを設定
      if ((this._isExternalFile === false) && (this.saveCount === 0)) {
        this.encoding = this.defaultEncoding;
      }
    }
    return err;
  }

  /**
   * 文字コードをセットする
   * @param {String} newEncoding
   * @return {MEMO_ERROR}
   */
  setEncoding (newEncoding) {
    const err = this.checkEncodingName(newEncoding);
    if (err === MEMO_ERROR.OK) {
      this.encoding = newEncoding;
    }
    return err;
  }

  /**
   * 文字コード自動判別をセットする
   * @param {Boolean} autoencoding
   */
  setAutoEncoding (autoencoding) {
    this.autoencoding = autoencoding;
  }
}

// メモ管理クラス
class MemoManager {
  constructor (memoNum, memoSetting) {
    this.memoNum = memoNum;
    this.memoSetting = memoSetting;
    this.memoList = [];
    this.pageNum = 0;   // 現在のページ

    const defaultSavepath = this.memoSetting.settings.savepath;
    const defaultEncoding = this.memoSetting.settings.encoding;
    const defaultAutoEncoding = this.memoSetting.settings.autoEncoding;
    for (let i = 0; i < memoNum; i++) {
      const memo = new Memo(defaultSavepath, defaultEncoding, defaultAutoEncoding);
      this.memoList.push(memo);
    }
  }

  save (idx, filename, text, { overwrite = false } = {}) {
    const memo = this.memoList[idx];
    const ret = memo.save(filename, text, { overwrite });
    ret.pagenum = idx;   // ページ番号を付加
    return ret;
  }

  load (idx, filename, { ignoreFsize = false, overwrite = false, encoding = null } = {}) {
    let err = MEMO_ERROR.OK;
    let result = null;

    // ほかの面で開いていないか確認する
    for (let i = 0; i < this.memoNum; i++) {
      if (i !== idx) {
        if (this.memoList[i].savepath === filename) {
          // すでにオープン済み
          err = MEMO_ERROR.ALREDYOPEN;
          result = { error: err };
          break;
        }
      }
    }
    if (err === MEMO_ERROR.OK) {
      result = this.memoList[idx].load(filename, { ignoreFsize, overwrite, encoding });
    }

    result.pagenum = idx;    // ページ番号を付加
    return result;
  }

  /**
   * 未保存フラグを立てる
   * @param {Number} idx 面番号
   */
  setUnsaved (idx) {
    this.memoList[idx].setUnsaved();
  }

  /**
   * 未保存の面番号リストを取得する
   */
  getUnsavedList () {
    const unsavedList = [];
    for (let i = 0; i < this.memoNum; i++) {
      if (this.memoList[i].getUnsaved() === true) {
        unsavedList.push(i);
      }
    }
    return unsavedList;
  }

  setPageNum (idx) {
    this.pageNum = idx;
  }

  setFontSize (fontsize) {
    this.memoSetting.settings.fontsize = fontsize;
  }

  /**
   * ロック状態を切り替える
   * @param {Number} idx
   * @return {Object} 対象の面番号と切り替え後のロック状態
   */
  toggleLockStatus (idx) {
    this.memoList[idx].locked = !this.memoList[idx].locked;
    const data = {
      pageNum: idx,
      locked: this.memoList[idx].locked,
    };
    return data;
  }

  /**
   * メモをクリアする
   * @param {Number} idx
   * @return {Object} クリアした面番号
   */
  clearMemo (idx) {
    if ((idx === null) || (idx === undefined) || (idx < 0) || (idx >= this.memoNum)) {
      console.error('(clearMemo) インデックスが不正です');
    }
    this.memoList[idx].clear();
    const data = {
      pageNum: idx,
    };
    return data;
  }

  /**
   * 各面のロック状態を取得する
   * @return {Array} ロック状態のリスト
   */
  getLockStatus () {
    const lockList = [];
    for (let i = 0; i < this.memoNum; i++) {
      const memo = this.memoList[i];
      lockList.push(memo.locked);
    }
    return lockList;
  }

  /**
   * 現在の全体設定を取得する
   */
  getGlobalSetting () {
    return this.memoSetting.settings;
  }

  /**
   * 現在の個別設定を取得する
   * @return {Object} pageNumに設定されている面の情報
   */
  getLocalSetting () {
    const settings = {
      pagenum: this.pageNum,
      encoding: this.memoList[this.pageNum].encoding,
    };
    return settings;
  }

  /**
   * UI用の設定を取得する
   */
  getUISetting () {
    const uiSettings = {
      fontsize: this.memoSetting.settings.fontsize,
      font: this.memoSetting.settings.font,
      topMost: this.memoSetting.settings.topMost,
    };
    return uiSettings;
  }

  /**
   * (要検討）エンコード名リストを取得する
   * UNICODEは省く必要がある
   */
  // getEncodingList(){
  //     return Object.keys(ENCODING_TABLE);
  // }

  /**
   * 全体設定をセットする
   */
  setGlobalSetting (data) {
    const ret = this.memoSetting.set(data);
    if (ret === MEMO_ERROR.OK) {
      /* 各メモに値を反映 */
      for (let i = 0; i < this.memoNum; i++) {
        this.memoList[i].setDefaultSavePath(this.memoSetting.settings.savepath);
        this.memoList[i].setDefaultEncoding(this.memoSetting.settings.encoding);
        this.memoList[i].setAutoEncoding(this.memoSetting.settings.autoEncoding);
      }
    }
    return ret;
  }

  /**
   * 個別設定をセットする
   * @param {Object} data 設定情報
   * @return {MEMO_ERROR}
   */
  setLocalSetting (data) {
    const ret = this.memoList[this.pageNum].setEncoding(data.encoding);
    return ret;
  }

  /**
   * 設定をファイルから読み込む
   * @param {String} filepath
   */
  loadSetting (filepath) {
    const err = this.memoSetting.load(filepath);
    this.setGlobalSetting(this.memoSetting.settings);
    console.log('loadsetting=' + err);
  }

  /**
   * 設定をファイルに書き出す
   * @param {String} filepath
   */
  saveSetting (filepath) {
    const err = this.memoSetting.save(filepath);
    console.log('savesetting=' + err);
  }
}

// メモの設定（データ構造を規定する）
class MemoSetting {
  constructor () {
    this.VERSION = 0;
    /* 設定はプリミティブ型かつ非null */
    this.settings = {
      savepath: './',
      fontsize: 16,
      font: 'Yu Gothic UI',
      topMost: true,
      encoding: 'UTF8',
      autoEncoding: true,
      fileSizeWarningTh: 1 * 1024 * 1024,
      loadLastFile: false,
      noCloseDialog: false,
      autoSave: false,
      autoSaveSpan: 5,
      autoLock: false,
    };
  }

  /**
   * 設定ファイルが正しいか検証する
   * バージョンチェックは行わない
   * @param {Object} data
   * @return {MEMO_ERROR} 判定結果
   */
  validate (data) {
    let error = MEMO_ERROR.OK;
    if (data == null) {
      /* 非null判定エラー */
      console.log('validate_null');
      error = MEMO_ERROR.ERROR;
    } else if (Object.keys(data).length !== Object.keys(this.settings).length) {
      /* 要素数判定エラー */
      console.log('validate_num');
      error = MEMO_ERROR.ERROR;
    } else {
      for (const [key, value] of Object.entries(data)) {
        // console.log('>>' + key);
        /* キーの存在確認 */
        if (!(key in this.settings)) {
          console.log('validate_nokey');
          error = MEMO_ERROR.ERROR;
          break;
        }
        /* 値の null or undefined 確認 */
        if ((value === null) || (value === undefined)) {
          console.log('validate_val_null');
          error = MEMO_ERROR.ERROR;
          break;
        }
        /* 値の型確認 */
        if (typeof (value) !== typeof (this.settings[key])) {
          console.log('validate_type');
          error = MEMO_ERROR.ERROR;
          break;
        }
      }
    }

    // 個別に確認
    if (error === MEMO_ERROR.OK) {
      const fontsize = data.fontsize;
      if (!fs.existsSync(data.savepath)) {
        /* 保存先確認エラー */
        error = MEMO_ERROR.NO_DIR;
      } else if ((fontsize == null) || (fontsize <= 0)) {
        /* フォントサイズ確認エラー */
        error = MEMO_ERROR.INV_FONTSIZE;
      }
    }
    return error;
  }

  /**
   * 設定を読み込む
   * @param {String} filepath
   * @return {MEMO_ERROR} 設定の読込に成功したか
   */
  load (filepath) {
    let buf = null;             // JSON形式の設定格納用
    let error = MEMO_ERROR.OK;

    try {
      buf = fs.readFileSync(filepath, { encoding: 'utf8' });
    } catch (e) {
      switch (e.code) {
        case 'ENOENT':
          error = MEMO_ERROR.NO_ENTRY;
          break;
        case 'EBUSY':
          error = MEMO_ERROR.BUSY;
          break;
        default:
          error = MEMO_ERROR.ERROR;
          break;
      }
    }
    /* バージョンチェック(未実装) */
    if (error === MEMO_ERROR.OK) {
      /* 値のセット */
      const settings = JSON.parse(buf);
      error = this.set(settings);
    }
    return error;
  }

  /**
   * 設定を保存する
   * @param {String} filepath
   * @return {MEMO_ERROR} 設定の保存に成功したか
   */
  save (filepath) {
    let error = MEMO_ERROR.OK;
    const jsonstr = JSON.stringify(this.settings);
    try {
      fs.writeFileSync(filepath, jsonstr, { flag: 'w', encoding: 'utf8' });
    } catch (e) {
      switch (e.code) {
        case 'ENOENT':
          error = MEMO_ERROR.NO_ENTRY;
          break;
        default:
          error = MEMO_ERROR.ERROR;
          break;
      }
    }
    return error;
  }

  /**
   * 設定をセットする
   * @param {Object} data
   * @return {MEMO_ERROR} 設定のセットに成功したか
   */
  set (data) {
    const result = this.validate(data);
    if (result === MEMO_ERROR.OK) {
      for (const [key, value] of Object.entries(data)) {
        this.settings[key] = value;
      }
    }
    return result;
  }

  /**
   * 設定を取得する
   * @return {Object} 設定
   */
  get () {
    return this.settings;
  }
}

function createWindow () {
  mainWindow = new BrowserWindow({
    width: USE_DEV_TOOL ? 500 : 250,
    // width: 500,
    height: 250,
    useContentSize: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, './preload.js'),
    },
  });
  mainWindow.setMenu(null);  // メニューバー非表示
  mainWindow.loadFile(MAIN_WINDOW);
  if (USE_DEV_TOOL) {
    mainWindow.openDevTools();
  }
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.on('close', (e) => {
    // TODO: 保存済みでなければ表示する
    /* 未保存面の面番号表示 */
    let message = '';
    const unsavedList = memoManager.getUnsavedList();
    if (unsavedList.length > 0) {
      for (let i = 0; i < unsavedList.length; i++) {
        message = message + `${parseInt(unsavedList[i]) + 1}面 `;
      }
      message = message + 'が未保存です\n';
    }
    message = message + '終了しますか？';

    const ret = dialog.showMessageBoxSync(mainWindow, {
      title: DIALOG_TITLE,
      message,
      type: 'info',
      defaultId: 1,
      buttons: ['OK', 'キャンセル'],
      noLink: true,
    });
    if (ret === 1) {
      e.preventDefault(); // キャンセルなら終了しない
    } else {
      // 設定を保存して終了
      memoManager.saveSetting(SETTING_FILENAME);
    }
  });
  mainWindow.on('ready-to-show', () => {
    setUISetting(memoManager.getUISetting());   // UIの設定を反映
    console.log('ready-to-show');   // DEBUG
  });
  memoManager = new MemoManager(MAX_PAGENUM, new MemoSetting());
  memoManager.loadSetting(SETTING_FILENAME);
  mainWindowContextMenu = createContextMenu();
}

app.on('ready', createWindow);

// mac os 対応
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// アプリがアクティブになった時の処理
app.on('actiivate', () => {
  // メインウィンドウが閉じられている場合は新しく開く
  if (mainWindow === null) {
    createWindow();
  }
});

/**
 * 全体設定画面を作成する
 */
function createGlobalSettingWindow () {
  const mainWindowPos = mainWindow.getPosition();
  globalSettingWindow = new BrowserWindow({
    x: mainWindowPos[0],
    y: mainWindowPos[1],
    width: USE_DEV_TOOL ? 750 : 550,
    height: 350,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload_main_setting.js'),
    },
  });
  globalSettingWindow.setMenu(null);  // メニューバー非表示
  globalSettingWindow.loadFile(MAIN_SETTING_WINDOW);
  if (USE_DEV_TOOL) {
    globalSettingWindow.openDevTools();
  }
  globalSettingWindow.on('closed', () => {
    globalSettingWindow = null;
  });
}

/**
 * 個別設定画面を作成する
 */
function createLocalSettingWindow () {
  const mainWindowPos = mainWindow.getPosition();
  localSettingWindow = new BrowserWindow({
    x: mainWindowPos[0],
    y: mainWindowPos[1],
    width: USE_DEV_TOOL ? 600 : 400,
    height: 250,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload_local_setting.js'),
    },
  });
  localSettingWindow.setMenu(null);  // メニューバー非表示
  localSettingWindow.loadFile(LOCAL_SETTING_WINDOW);
  if (USE_DEV_TOOL) {
    localSettingWindow.openDevTools();
  }
  localSettingWindow.on('closed', () => {
    localSettingWindow = null;
  });
}

/**
 * 読込文字コード変更画面を作成する
 */
function createReloadEncodingWindow () {
  const mainWindowPos = mainWindow.getPosition();
  reloadEncodingWindow = new BrowserWindow({
    x: mainWindowPos[0],
    y: mainWindowPos[1],
    width: USE_DEV_TOOL ? 600 : 400,
    height: 250,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload_reload_encoding.js'),
    },
  });
  reloadEncodingWindow.setMenu(null);  // メニューバー非表示
  reloadEncodingWindow.loadFile(RELOAD_ENCODING_WINDOW);
  if (USE_DEV_TOOL) {
    reloadEncodingWindow.openDevTools();
  }
  reloadEncodingWindow.on('closed', () => {
    reloadEncodingWindow = null;
  });
}

/**
 * バージョン情報画面を作成する
 */
function createVersionWindow () {
  const mainWindowPos = mainWindow.getPosition();
  versionWindow = new BrowserWindow({
    x: mainWindowPos[0],
    y: mainWindowPos[1],
    width: USE_DEV_TOOL ? 450 : 250,
    height: 200,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // preload: path.join(__dirname, 'preload_local_setting.js')
    },
  });
  versionWindow.setMenu(null);  // メニューバー非表示
  versionWindow.loadFile(VERSION_WINDOW);
  if (USE_DEV_TOOL) {
    versionWindow.openDevTools();
  }
  versionWindow.on('closed', () => {
    versionWindow = null;
  });
}

/**
 * メモのコンテキストメニューを作成する
 * @returns コンテキストメニュー
 */
function createContextMenu () {
  const template = [
    {
      label: '切り取り',
      role: 'cut',
      id: 'cut',
    },
    {
      label: 'コピー',
      role: 'copy',
      id: 'copy',
    },
    {
      label: '貼り付け',
      role: 'paste',
      id: 'paste',
    },
    {
      type: 'separator',
    },
    {
      label: '常に手前に表示',
      click: () => {
        /* 現在の設定を切り替える */
        const flag = memoManager.memoSetting.settings.topMost;
        memoManager.memoSetting.settings.topMost = !flag;
        mainWindow.setAlwaysOnTop(!flag);
      },
      id: 'topmost',
      type: 'checkbox',
      checked: memoManager.memoSetting.settings.topMost,
    },
    {
      /* 面単位で切り替わる */
      label: 'ロック',
      click: setLockStatus,
      id: 'lock',
      type: 'checkbox',
      checked: memoManager.memoList[memoManager.pageNum].locked,   // 修正予定
    },
    {
      label: 'クリア',
      id: 'clear',
      submenu: [
        {
          label: 'クリア',
          click: clearMemo,
        },
      ],
    },
    {
      type: 'separator',
    },
    {
      label: '全体設定',
      id: 'globalSetting',
      click: createGlobalSettingWindow,
    },
    {
      label: '個別設定',
      id: 'localSetting',
      click: createLocalSettingWindow,
    },
    {
      label: '読取文字コード変更',
      id: 'loadEncoding',
      click: createReloadEncodingWindow,
    },
    {
      label: 'バージョン情報',
      id: 'versionInfo',
      click: createVersionWindow,
    },
    // {
    //     label: 'デバッグ表示',
    //     id: 'debug',
    //     type: 'checkbox',
    //     checked: true
    // }
  ];
  const menu = Menu.buildFromTemplate(template);
  return menu;
}

/**
 * メインプロセスのロック状態を設定する
 */
function setLockStatusMain (pageNum) {
  /* ロック状態を切り替え */
  memoManager.toggleLockStatus(pageNum);
}

/**
 * メインプロセスのロック状態を更新する
 * ロック状態更新時、面切り替え時に呼び出す
 */
function updateLockStatusMain () {
  const lockList = memoManager.getLockStatus();
  /* コンテキストメニューをロック */
  mainWindowContextMenu.getMenuItemById('cut').enabled = !lockList[memoManager.pageNum];
  mainWindowContextMenu.getMenuItemById('paste').enabled = !lockList[memoManager.pageNum];
  mainWindowContextMenu.getMenuItemById('lock').checked = lockList[memoManager.pageNum];
  mainWindowContextMenu.getMenuItemById('clear').enabled = !lockList[memoManager.pageNum];
}

// ---------------------------------------------------
//     IPC
// ---------------------------------------------------

// コンテキストメニュー
ipcMain.handle('show-main-context-menu', (event) => {
  mainWindowContextMenu.popup(BrowserWindow.fromWebContents(event.sender));
});

/**
 * ファイル保存
 *
 * data = {
 *  pagenum: Number,    // ページ番号
 *  filename: String,   // ファイル名テキストボックスの値
 *  text: String        // 本文
 * }
 */
ipcMain.handle('file-save', (event, data) => {
  let result = memoManager.save(data.pagenum, data.filename, data.text);  // デバッグ（上書き機能追加予定）
  console.log(result);
  switch (result.error) {
    case MEMO_ERROR.OK:
      break;
    case MEMO_ERROR.NO_FILENAME:
      console.log('NOFILE');
      dialog.showMessageBoxSync(mainWindow, {
        message: 'ファイル名を入力してください',
        type: 'warning',
        title: DIALOG_TITLE,
      });
      break;
    case MEMO_ERROR.INV_FNAME:
      console.log('INV_FNAME');
      dialog.showMessageBox(mainWindow, {
        message: 'ファイル名が不正です',
        type: 'warning',
        title: DIALOG_TITLE,
      });
      break;
    case MEMO_ERROR.FILE_EXIST: {
      console.log('FILE_EXIST');
      const options = {
        message: 'ファイルが存在します。上書きしますか？',
        type: 'warning',
        defaultId: 1,
        buttons: ['OK', 'キャンセル'],
        title: DIALOG_TITLE,
        noLink: true,
      };
      const ret = dialog.showMessageBoxSync(mainWindow, options);
      if (ret === 0) { // OKなら上書き
        result = memoManager.save(data.pagenum, data.filename, data.text, { overwrite: true });
      }
      // TODO: ダイアログ表示中に保存先を消されたらどうする？
      break;
    }
    case MEMO_ERROR.NO_ENTRY:
      console.log('NO_ENTRY');
      dialog.showMessageBox(mainWindow, {
        message: 'ファイル名に不正な文字または文字列が含まれています',
        title: DIALOG_TITLE,
        type: 'warning',
      });
      break;
    case MEMO_ERROR.NO_DIR:
      console.log('NO_DIR');
      dialog.showMessageBox(mainWindow, {
        message: '保存先フォルダが存在しません。再設定してください',
        type: 'warning',
        title: DIALOG_TITLE,
      });
      break;
    case MEMO_ERROR.BUSY:
      console.log('BUSY');
      dialog.showMessageBoxSync(mainWindow, {
        message: 'ファイルが開かれています。閉じてから再試行してください',
        title: DIALOG_TITLE,
        type: 'warning',
      });
      break;
    default:
      dialog.showErrorBox('保存エラー', '想定しないエラーが発生しました');
      break;
  }
  // 保存結果を返す
  event.sender.send('save-result', result);
});

/**
 * ファイルを読み込む
 * data = {
 *      pagenum: Number,    // ページ番号
 *      path: String,       // ファイルのフルパス
 * }
 */
ipcMain.handle('file-load', (event, data) => {
  const memoData = loadMemo(data);
  if (memoData != null && memoData.error === 0) {
    // メモデータを返す
    event.sender.send('file-load-result', memoData);
  }
});

function loadMemo (data, { ignoreFsize = false, overwrite = false } = {}) {
  let memoData = null;
  let ret = null;  // ダイアログの戻り値用
  memoData = memoManager.load(data.pagenum, data.path, { ignoreFsize, overwrite });
  switch (memoData.error) {
    case MEMO_ERROR.OK:
      /* 読込成功 */
      break;
    case MEMO_ERROR.ALREDYOPEN:
      /* 既に開いています */
      dialog.showMessageBoxSync(mainWindow, {
        message: 'このメモはすでに開いています',
        type: 'info',
        title: DIALOG_TITLE,
      });
      break;
    case MEMO_ERROR.LEAVEMEMO:
      /* メモが残っています。開きますか？ */
      ret = dialog.showMessageBoxSync(mainWindow, {
        message: 'メモが残っています。開きますか？',
        type: 'info',
        buttons: ['OK', 'キャンセル'],
        title: DIALOG_TITLE,
        noLink: true,
      });
      if (ret === 0) {  // OK
        memoData = loadMemo(data, { ignoreFsize, overwrite: true });
      }
      break;
    case MEMO_ERROR.NO_ENTRY:
      /* ファイルが存在しない */
      dialog.showMessageBoxSync(mainWindow, {
        message: 'ファイルが存在しません',
        type: 'warning',
        title: DIALOG_TITLE,
      });
      break;
    case MEMO_ERROR.LARGEFILE:
      /* ファイルサイズが巨大です。アプリが不安定になる場合があります */
      ret = dialog.showMessageBoxSync(mainWindow, {
        // TODO: ファイルサイズをダイアログに表示する？
        message: 'ファイルサイズが巨大です。アプリが不安定になる場合があります\n開きますか？',
        buttons: ['OK', 'キャンセル'],
        type: 'warning',
        title: DIALOG_TITLE,
        noLink: true,
      });
      if (ret === 0) {  // OK
        memoData = loadMemo(data, { ignoreFsize: true, overwrite });
      }
      break;
    case MEMO_ERROR.BUSY:
      /* ファイルは使用中です。ファイルを閉じてから再試行してください */
      dialog.showMessageBoxSync(mainWindow, {
        message: 'ファイルは使用中です。ファイルを閉じてから再試行してください',
        type: 'warning',
        title: DIALOG_TITLE,
      });
      break;
    case MEMO_ERROR.ERROR:
    default:
      /* その他エラー */
      dialog.showMessageBoxSync(mainWindow, {
        message: '予期しない読み込みエラーが発生しました',
        type: 'error',
        title: DIALOG_TITLE,
      });
      break;
  }
  return memoData;
}

/**
 * 現在の全体設定の値を送る
 */
ipcMain.handle('global-setting-get', (event) => {
  const settings = memoManager.getGlobalSetting();
  event.sender.send('global-setting-get-result', settings);
});

/**
 * 全体設定の設定を受信し、反映する
 */
ipcMain.handle('global-setting-set', (event, data) => {
  console.log(data);
  const ret = memoManager.setGlobalSetting(data);
  switch (ret) {
    case MEMO_ERROR.OK:
      /* UIの設定を更新 */
      setUISetting(memoManager.getUISetting());
      /* 設定完了 */
      globalSettingWindow.close();
      break;
    case MEMO_ERROR.NO_DIR:
      /* 保存先が存在しない */
      dialog.showMessageBoxSync(globalSettingWindow, {
        message: '保存先が存在しません',
        type: 'warning',
        title: DIALOG_TITLE,
      });
      break;
    case MEMO_ERROR.INV_FONTSIZE:
      dialog.showMessageBoxSync(globalSettingWindow, {
        message: 'フォントサイズが不正です。\n1以上の値を入力してください。',
        type: 'warning',
        title: DIALOG_TITLE,
      });
      break;
    case MEMO_ERROR.ERROR:
    default:
      /* その他エラー */
      dialog.showMessageBoxSync(globalSettingWindow, {
        message: `全体設定のセットに失敗しました。\nデータ構造が一致していない可能性があります (${ret})`,
        type: 'error',
        title: DIALOG_TITLE,
      });
  }
});

/**
 * 個別設定ウィンドウに現在の設定を渡す
 */
ipcMain.handle('local-setting-get', (event) => {
  const settings = memoManager.getLocalSetting();
  event.sender.send('local-setting-get-result', settings);
});

/**
 * 個別設定を反映する
 */
ipcMain.handle('local-setting-set', (event, data) => {
  console.log(data);
  const err = memoManager.setLocalSetting(data);
  switch (err) {
    case MEMO_ERROR.OK:
      /* 成功 */
      localSettingWindow.close();
      break;
    case MEMO_ERROR.ERROR:
    default:
      /* エラー */
      dialog.showMessageBoxSync(localSettingWindow, {
        message: `個別設定のセットに失敗しました。バグです。  (${err})`,
        type: 'error',
        title: DIALOG_TITLE,
      });
  }
});

/**
 * 読込文字コード変更ウィンドウに現在の設定を渡す
 */
ipcMain.handle('now-encoding-get', (event) => {
  // 個別設定と同じ
  const settings = memoManager.getLocalSetting();
  event.sender.send('now-encoding-get-result', settings);
});

/**
 * 読込文字コードを変更する
 */
ipcMain.handle('reload-encoding', (event, data) => {
  const pageNum = data.pagenum;
  if (!memoManager.memoList[pageNum].isExternalFile) {
    dialog.showMessageBoxSync(reloadEncodingWindow, {
      message: '外部読込ファイルではないため実行できません',
      type: 'info',
      title: DIALOG_TITLE,
    });
  } else {
    const encoding = data.encoding;
    const filename = memoManager.memoList[pageNum].savepath;  // 初回読み込み時に設定したフルパス
    const memoData = memoManager.load(pageNum, filename, { ignoreFsize: true, overwrite: true, encoding });    // 一度読み込んでいるため、ファイルサイズ・上書き判定は無視
    switch (memoData.error) {
      case MEMO_ERROR.OK:
        /* 読込成功 */
        reloadEncodingWindow.close();
        break;
      case MEMO_ERROR.NO_ENTRY:
        /* ファイルが存在しない */
        dialog.showMessageBoxSync(reloadEncodingWindow, {
          message: 'ファイルが存在しません。\n移動、名前変更、削除された可能性があります。',
          type: 'warning',
          title: DIALOG_TITLE,
        });
        break;
      case MEMO_ERROR.BUSY:
        /* ファイルは使用中です。ファイルを閉じてから再試行してください */
        dialog.showMessageBoxSync(reloadEncodingWindow, {
          message: 'ファイルは使用中です。ファイルを閉じてから再試行してください',
          type: 'warning',
          title: DIALOG_TITLE,
        });
        break;
      case MEMO_ERROR.ERROR:
      default:
        /* その他エラー */
        dialog.showMessageBoxSync(reloadEncodingWindow, {
          message: `予期しない読み込みエラーが発生しました (${memoData.error})`,
          type: 'error',
          title: DIALOG_TITLE,
        });
        break;
    }
    // メモデータをメインウィンドウに返す
    mainWindow.webContents.send('file-load-result', memoData);
  }
});

/**
 * 現在のページ番号をセットする
 */
ipcMain.handle('set-pagenum', (event, pagenum) => {
  memoManager.setPageNum(pagenum);
});

/**
 * フォントサイズをセットする
 */
ipcMain.handle('set-fontsize', (event, fontsize) => {
  memoManager.setFontSize(fontsize);
});

// 未保存フラグを立てる
ipcMain.handle('file-unsaved', (event, pagenum) => {
  memoManager.setUnsaved(pagenum);
});

/**
 * メインプロセスのロック状態を設定する
 */
ipcMain.handle('set-lock-status-main', (event, pagenum) => {
  setLockStatusMain(pagenum);
});

/**
 * メインプロセスのロック状態を更新する
 */
ipcMain.handle('update-lock-status-main', (event) => {
  updateLockStatusMain();
});

/**
 * メモのロック状態を送信する
 * コンテキストメニューから呼ぶことを想定
 */
function setLockStatus () {
  /* メインプロセスのロック状態を設定 */
  setLockStatusMain(memoManager.pageNum);
  /* メインプロセスのロック状態を更新 */
  updateLockStatusMain();
  /* ロック状態リストを取得 */
  const lockList = memoManager.getLockStatus();
  /* レンダラープロセスに送信 */
  mainWindow.webContents.send('set-lock-status', lockList);
}

/**
 * メモをクリアし、情報を送信する
 */
function clearMemo () {
  const data = memoManager.clearMemo(memoManager.pageNum);
  mainWindow.webContents.send('clear-memo', data);
}

/**
 * UIの設定をセットする
 * @param {Object} settings
 */
function setUISetting (settings) {
  mainWindow.webContents.send('set-settings', settings);
  mainWindow.setAlwaysOnTop(settings.topMost); // 常に手前に表示
}

// /**
//  * ウィンドウの常に手前に表示の設定を行う
//  * 削除予定
//  * @param {Boolean} flag
//  */
// function setAlwaysOnTop(flag){
//     /* メモ設定を更新 */
//     memoManager.memoSetting.settings['topMost'] = flag;
//     /* ウィンドウに反映 */
//     mainWindow.setAlwaysOnTop(flag);
// }
