# War Thunder「击中分析」复刻 — 本地运行说明

把本文件夹整体放到你电脑的 **D 盘任意位置**（例如 `D:\wt-hit-analysis\`），双击 `start.bat` 即可运行。

---

## 一、你需要提前装好的东西（只需一次）

1. **Node.js（LTS 版本）**
   - 下载地址：https://nodejs.org （选 “LTS” 绿色按钮）
   - 安装时一路下一步即可，它会自动带 `npm`
   - 装完后**重启一下电脑**让命令行生效
   - 脚本使用 Node 自带的 `npm`，无需额外安装任何包管理器。

> 本项目**不需要安装任何数据库软件**。数据存在本地文件 `backend/prisma/dev.db`，脚本首次运行时自动创建。

---

## 二、运行步骤

1. 确认 `start.bat` 和 `frontend/`、`backend/`、`docs/` 在同一文件夹里。
2. **双击 `start.bat`**。
3. 会弹出**两个黑色命令行窗口**（一个后端、一个前端），首次会自动下载依赖（可能要等一两分钟）。
4. 当**前端窗口**出现 `Local: http://localhost:5173` 时，打开浏览器访问：
   - 👉 **http://localhost:5173**
5. 在战斗页选弹种、点敌方载具开火，看击中分析窗口；点「结束战斗并保存」后到机库回看。

**关闭程序**：直接关闭那两个黑色窗口即可。

---

## 三、常见问题

- **浏览器打不开 / 白屏**：等久一点，依赖第一次安装较慢；确认前端窗口已显示 5173 地址再访问。
- **端口被占用**：若 5173 或 3000 被其他程序占用，关闭占用程序后重跑 `start.bat`。
- **杀毒软件拦截**：若窗口一闪而过，可能是被杀软拦截，把本文件夹加入白名单。
- **数据在哪**：所有战斗记录存在 `backend/prisma/dev.db`，删掉该文件即可清空全部历史。

---

## 四、想换回云端同款 PostgreSQL 数据库？（可选，进阶）

默认用本地 SQLite，零配置。如需改回 PostgreSQL：

1. 把 `backend/prisma/schema.prisma` 里的
   `provider = "sqlite"` 改回 `provider = "postgresql"`
2. 把 `backend/.env` 里的
   `DATABASE_URL="file:./dev.db"` 改成你的 Postgres 连接串，例如：
   `DATABASE_URL="postgresql://用户名:密码@localhost:5432/数据库名?schema=public"`
3. 在 `backend/` 目录下运行：`npx prisma db push`
4. 重新双击 `start.bat`。

> 本项目 schema 已规避 SQLite 与 Postgres 的类型差异（未使用数组类型），可直接迁移。

---

## 五、项目结构

```
wt-hit-analysis/
├── start.bat                 # Windows 一键启动
├── README.md                 # 本说明
├── frontend/                 # 前端（React + Vite）
│   └── src/
│       ├── data/             # 弹药参数表、载具装甲分区
│       ├── lib/              # 弹道/穿深公式 + 命中模拟 + 单元测试
│       ├── components/        # 战场、X光图、分析窗口、机库、统计
│       ├── store/            # Zustand 状态
│       └── api/              # 后端调用（失败自动回退本地存储）
├── backend/                  # 后端（Express + Prisma）
│   ├── prisma/
│   │   └── schema.prisma     # 数据表（Battle / Hit）
│   └── src/                  # 接口：POST/GET/PATCH/DELETE /api/battles
└── docs/
    └── hit-analysis-model.md  # 建模原理：效果如何由公式+数据表算出
```

详细的效果计算逻辑（穿深公式、装甲类型、跳弹边界）见 `docs/hit-analysis-model.md`。
