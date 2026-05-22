/**
 * WS Command Registration — 全モジュールのハンドラを登録
 *
 * このファイルをインポートすると、全コマンドハンドラが
 * dispatcher に登録される。
 */

import "./calendar.js";
import "./group.js";
// myplan.ts は @ludiars/schedula-module-myplan に移行
// voting.ts は @ludiars/schedula-module-voting に移行
// facility.ts は Aedilis に分離 (2026-05-20 split-from-actio)
// pm.ts は Actio に分離 (2026-05-20 split-from-actio)
import "./admin.js";
