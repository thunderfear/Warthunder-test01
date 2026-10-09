# AGENTS.md — 战雷击中分析项目 · AI 协作规则

本文件是 AI 助手（及新成员）开工前的必读约束。违反以下规则产生的代码应被拒绝。

## 项目概况

War Thunder 击中分析复刻原型：前端 React + Vite + Three.js + Zustand，后端 Express + Prisma + SQLite。
包管理器只用 **npm**（不使用 pnpm/yarn，尽管仓库里残留 pnpm-lock.yaml）。

## 架构分层（必须遵守）

```
frontend/src/
├── data/    # 弹药参数表、载具装甲分区（纯数据，无逻辑）
├── lib/     # 弹道/穿深/后效物理计算（纯函数，禁止依赖 React/DOM）
├── store/   # Zustand 状态（唯一的战斗状态来源）
├── api/     # 后端调用（失败必须回退 localStorage）
├── components/   # 2D UI 组件
└── components3d/ # React Three Fiber 3D 组件
```

- **状态管理**：战斗数据（命中记录、分区损伤、载具状态）必须放 Zustand store，禁止在组件内用 useState 存战斗状态。
- **物理计算**：穿透/弹道/后效计算必须放 `lib/`，禁止写进组件；`lib/` 内禁止 import React。
- **后端验证**：API 入参必须用 Zod schema 验证（见 backend/src/routes/battles.ts 模式）。

## 硬性禁令

1. **禁止创建 `.bak` / `.pre-fix` / 任何手动备份文件**。历史版本由 Git 管理（2026-09-30 已清理 19 个此类文件）。
2. **vite 配置只改 `frontend/vite.config.js`**。它是用户手动维护的事实源（Vite 解析顺序 js 优先于 ts）。禁止删除它；`vite.config.ts` 为冗余文件，不要同步修改。
3. **禁止在本地运行 `npm --prefix frontend run build`**：其中 `tsc -b` 会从 `vite.config.ts` 重新生成 `vite.config.js`，覆盖用户手动维护的事实源。前端构建只在 CI 干净环境中执行。
4. **坐标系不可混淆**：弹道坐标系（x=前, y=右, z=上）与 Three.js 场景坐标系（x=右, y=上, z=前）的转换只能发生在渲染边界（BallisticTrail/HitEffects），`lib/` 计算层只用弹道坐标系，3D 直线命中结果必须打 `coordSpace` 标记。

## 工程规范

- 提交前 husky + lint-staged 自动执行 ESLint 与 Prettier，被拦截时必须修复后重新提交，禁止绕过（不用 `--no-verify`）。
- 修改 `lib/` 下物理计算后，必须运行 `npm test`（111 个用例，约 1 秒）确认全绿；改动判定逻辑时应同步更新对应测试。
- 新增弹种：在 `data/ammo.ts` 加数据，在 `lib/penetration.ts` 的策略注册表 `POST_EFFECT_STRATEGIES` 注册后效策略。
- 环境要求：Node.js LTS；启动用根目录 `npm run dev`（或 start.bat）；进程清理用 `auto-kill.ps1`。

## 已知遗留（暂不要求修）

- `vite.config.ts` 冗余（见禁令 2，由用户决定归档时机）
- backend 无测试、无 Docker（原型项目，刻意从简）
- Prisma Hit 模型的 JSON 字符串字段（SQLite 演示场景够用）
