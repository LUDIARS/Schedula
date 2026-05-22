/**
 * Schedule module — カレンダー・マイプラン
 *
 * タスク menuGroup は Actio に分離 (2026-05-20 split-from-actio)。
 */
import type { ModuleDefinition } from "../module-registry";

export const scheduleModule: ModuleDefinition = {
  id: "schedule",
  name: "スケジュール",
  description: "カレンダー・マイプランなど予定系機能",
  menuGroups: [
    {
      id: "schedule",
      label: "スケジュール",
      icon: "C",
      order: 100,
      category: "event",
      items: [
        { to: "/calendar", label: "カレンダー", icon: "C", removable: true, order: 0 },
        { to: "/my-plan", label: "マイプラン", icon: "M", removable: true, order: 1 },
      ],
    },
  ],
};
