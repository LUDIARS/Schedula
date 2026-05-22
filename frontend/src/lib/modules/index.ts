/**
 * Module registration — 全モジュールをレジストリに登録
 *
 * アプリ起動時にこのファイルをインポートすることで、
 * 全モジュールのメニュー・ブロック・ルートが登録される。
 *
 * 新モジュール追加手順:
 *   1. modules/my-module.ts を作成
 *   2. このファイルにインポートを追加
 *   3. registerAllModules() 内で moduleRegistry.registerModule() を呼ぶ
 */
import { moduleRegistry } from "../module-registry";
import { coreModule } from "./core";
import { scheduleModule } from "./schedule";
import { groupModule } from "./group";
import { m1SchoolModule } from "./m1-school";
// reservation は Aedilis に、pm は Actio に分離 (2026-05-20 split-from-actio)
import { machinaModule } from "./machina";
import { notificationModule } from "./notification";
import { integrationModule } from "./integration";
import { adminModule } from "./admin";
import { cocoiruModule } from "./cocoiru";

let registered = false;

/** 全モジュールをレジストリに登録 (冪等) */
export function registerAllModules(): void {
  if (registered) return;
  registered = true;

  moduleRegistry.registerModule(coreModule);
  moduleRegistry.registerModule(scheduleModule);
  moduleRegistry.registerModule(groupModule);
  moduleRegistry.registerModule(m1SchoolModule);
  moduleRegistry.registerModule(machinaModule);
  moduleRegistry.registerModule(notificationModule);
  moduleRegistry.registerModule(integrationModule);
  moduleRegistry.registerModule(adminModule);
  moduleRegistry.registerModule(cocoiruModule);
}
