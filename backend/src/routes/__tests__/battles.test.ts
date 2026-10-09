// 后端 API 测试：battles 路由全链路（一期 R3 风险消解的验收证据）
// 使用独立 SQLite 测试库（backend/prisma/test.db），与开发库 dev.db 完全隔离
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '../../..');
const TEST_DB_PATH = path.join(backendRoot, 'prisma', 'test.db');
const TEST_DB_URL = `file:${TEST_DB_PATH.replace(/\\/g, '/')}`;

// 必须在导入 app 之前设置：battles 路由在模块加载时创建 PrismaClient
process.env.DATABASE_URL = TEST_DB_URL;

// 建表（幂等）。Windows 下需显式 npx.cmd（execSync 的 cmd 环境不解析 .ps1 别名）
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
try {
  execSync(`${npxBin} prisma db push --skip-generate`, {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe',
  });
} catch (e) {
  const err = e as { stdout?: Buffer; stderr?: Buffer };
  throw new Error(
    `prisma db push 失败:\n${err.stdout?.toString() ?? ''}\n${err.stderr?.toString() ?? ''}`,
  );
}

const { app } = await import('../../index.js');
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

beforeEach(async () => {
  await prisma.hit.deleteMany();
  await prisma.battle.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
  for (const suffix of ['', '-journal']) {
    try {
      fs.unlinkSync(TEST_DB_PATH + suffix);
    } catch {
      // 文件可能被路由侧连接占用，留给 .gitignore 兜底，不影响测试结果
    }
  }
});

// ─── 测试数据工厂 ───

function makeHit(overrides: Record<string, unknown> = {}) {
  return {
    seq: 1,
    timeOffset: 0,
    ammoId: 'APHE',
    caliber: 88,
    distance: 500,
    impactAngle: 12,
    effectiveThickness: 100,
    shellPen: 150,
    penetrated: true,
    ricochet: false,
    missed: false,
    crewKilled: false,
    ...overrides,
  };
}

function makeBattle(overrides: Record<string, unknown> = {}) {
  return {
    playerName: '测试玩家',
    playerVehicle: 'Tiger II',
    enemyVehicle: 'T-72B3',
    mapName: '测试地图',
    result: 'victory',
    hits: [makeHit()],
    ...overrides,
  };
}

async function createBattle(overrides: Record<string, unknown> = {}) {
  const res = await request(app).post('/api/battles').send(makeBattle(overrides));
  expect(res.status).toBe(201);
  return res.body;
}

// ─── 健康检查 ───

describe('GET /api/health', () => {
  it('返回 { ok: true }', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

// ─── POST /api/battles ───

describe('POST /api/battles', () => {
  it('正路径：201 创建战斗并持久化 hits', async () => {
    const res = await request(app).post('/api/battles').send(makeBattle());
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.hits).toHaveLength(1);

    const inDb = await prisma.battle.findUnique({
      where: { id: res.body.id },
      include: { hits: true },
    });
    expect(inDb).not.toBeNull();
    expect(inDb!.hits).toHaveLength(1);
    expect(inDb!.hits[0].ammoId).toBe('APHE');
  });

  it('mapHit：armorNeutralized 缺省落库为 false（防历史缺陷复发）', async () => {
    const battle = await createBattle();
    const hit = await prisma.hit.findFirst({ where: { battleId: battle.id } });
    expect(hit!.armorNeutralized).toBe(false);
    expect(battle.hits[0].armorNeutralized).toBe(false);
  });

  it('mapHit：JSON 字符串字段完整透传（postEffectDetails / chainEvents / vehicleState / crewKilledList）', async () => {
    const battle = await createBattle({
      hits: [
        makeHit({
          postEffectDetails: '{"spallCone":{"angleDeg":42}}',
          chainEvents: '[{"type":"engine_fire"}]',
          vehicleState: 'engine_fire',
          crewKilledList: '["车长","炮手"]',
        }),
      ],
    });
    const hit = battle.hits[0];
    expect(hit.postEffectDetails).toBe('{"spallCone":{"angleDeg":42}}');
    expect(hit.chainEvents).toBe('[{"type":"engine_fire"}]');
    expect(hit.vehicleState).toBe('engine_fire');
    expect(hit.crewKilledList).toBe('["车长","炮手"]');
  });

  it('mapHit：全字段映射（armorNeutralized=true / ricochet / overpressureKPa / postPenDamage）', async () => {
    const battle = await createBattle({
      hits: [
        makeHit({
          seq: 3,
          timeOffset: 1200,
          armorNeutralized: true,
          ricochet: true,
          postPenDamage: 45,
          overpressureKPa: 66.6,
          zoneKey: 'turret_front',
          zoneLabel: '炮塔正面',
          armorType: 'composite',
          category: 'armor',
          resultText: '测试文案',
        }),
      ],
    });
    const hit = await prisma.hit.findFirst({ where: { battleId: battle.id } });
    expect(hit!.seq).toBe(3);
    expect(hit!.timeOffset).toBe(1200);
    expect(hit!.armorNeutralized).toBe(true);
    expect(hit!.ricochet).toBe(true);
    expect(hit!.postPenDamage).toBe(45);
    expect(hit!.overpressureKPa).toBeCloseTo(66.6);
    expect(hit!.zoneKey).toBe('turret_front');
    expect(hit!.armorType).toBe('composite');
    expect(hit!.resultText).toBe('测试文案');
  });

  it('mapHit：可选字段缺省值（postPenDamage=0 / resultText="" / 可空字段=null）', async () => {
    const battle = await createBattle();
    const hit = battle.hits[0];
    expect(hit.postPenDamage).toBe(0);
    expect(hit.resultText).toBe('');
    expect(hit.zoneKey).toBeNull();
    expect(hit.zoneLabel).toBeNull();
    expect(hit.armorType).toBeNull();
    expect(hit.postEffectDetails).toBeNull();
    expect(hit.overpressureKPa).toBeNull();
  });

  it('400：playerName 为空字符串', async () => {
    const res = await request(app)
      .post('/api/battles')
      .send(makeBattle({ playerName: '' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('输入验证失败');
  });

  it('400：缺少 playerName 字段', async () => {
    const body = makeBattle() as Record<string, unknown>;
    delete body.playerName;
    const res = await request(app).post('/api/battles').send(body);
    expect(res.status).toBe(400);
  });

  it('400：hits 为空数组（至少需要一次命中记录）', async () => {
    const res = await request(app)
      .post('/api/battles')
      .send(makeBattle({ hits: [] }));
    expect(res.status).toBe(400);
  });

  it('400：hit 缺少 ammoId', async () => {
    const hit = makeHit() as Record<string, unknown>;
    delete hit.ammoId;
    const res = await request(app)
      .post('/api/battles')
      .send(makeBattle({ hits: [hit] }));
    expect(res.status).toBe(400);
  });

  it('400：caliber 非正数', async () => {
    const res = await request(app)
      .post('/api/battles')
      .send(makeBattle({ hits: [makeHit({ caliber: -88 })] }));
    expect(res.status).toBe(400);
  });

  it('400：penetrated 非布尔值', async () => {
    const res = await request(app)
      .post('/api/battles')
      .send(makeBattle({ hits: [makeHit({ penetrated: 'yes' })] }));
    expect(res.status).toBe(400);
  });
});

// ─── GET /api/battles ───

describe('GET /api/battles', () => {
  it('返回数组且包含 hits', async () => {
    await createBattle();
    const res = await request(app).get('/api/battles');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].hits).toHaveLength(1);
  });

  it('多场战斗全部列出', async () => {
    await createBattle({ playerName: '玩家A' });
    await createBattle({ playerName: '玩家B' });
    await createBattle({ playerName: '玩家C' });
    const res = await request(app).get('/api/battles');
    expect(res.body).toHaveLength(3);
    const names = res.body.map((b: { playerName: string }) => b.playerName).sort();
    expect(names).toEqual(['玩家A', '玩家B', '玩家C']);
  });

  it('分页：page=1&pageSize=2 返回 2 条且 total=3', async () => {
    await createBattle({ playerName: '玩家A' });
    await createBattle({ playerName: '玩家B' });
    await createBattle({ playerName: '玩家C' });
    const res = await request(app).get('/api/battles?page=1&pageSize=2');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(3);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(2);
  });

  it('分页：page=2 返回剩余 1 条', async () => {
    await createBattle({ playerName: '玩家A' });
    await createBattle({ playerName: '玩家B' });
    await createBattle({ playerName: '玩家C' });
    const res = await request(app).get('/api/battles?page=2&pageSize=2');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(3);
  });

  it('分页：页码越界返回空 items 但 total 正确', async () => {
    await createBattle();
    const res = await request(app).get('/api/battles?page=99&pageSize=10');
    expect(res.body.items).toHaveLength(0);
    expect(res.body.total).toBe(1);
  });

  it('分页：非法参数回退为全量数组（向后兼容）', async () => {
    await createBattle();
    const res = await request(app).get('/api/battles?page=abc&pageSize=-1');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
  });
});

// ─── GET /api/battles/:id ───

describe('GET /api/battles/:id', () => {
  it('200：按 id 返回战斗（含 hits）', async () => {
    const battle = await createBattle();
    const res = await request(app).get(`/api/battles/${battle.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(battle.id);
    expect(res.body.hits).toHaveLength(1);
  });

  it('404：id 不存在', async () => {
    const res = await request(app).get('/api/battles/not-exist-id');
    expect(res.status).toBe(404);
  });
});

// ─── PATCH /api/battles/:id ───

describe('PATCH /api/battles/:id', () => {
  it('200：更新 result', async () => {
    const battle = await createBattle();
    const res = await request(app).patch(`/api/battles/${battle.id}`).send({ result: 'defeat' });
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('defeat');
  });

  it('200：更新 notes（一期新增列，修复 Zod 与 schema 不一致缺陷）', async () => {
    const battle = await createBattle();
    const res = await request(app)
      .patch(`/api/battles/${battle.id}`)
      .send({ notes: '弹药架殉爆值得复盘' });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBe('弹药架殉爆值得复盘');
  });

  it('400：strict 白名单拒绝未知字段', async () => {
    const battle = await createBattle();
    const res = await request(app).patch(`/api/battles/${battle.id}`).send({ hackerField: 'x' });
    expect(res.status).toBe(400);
  });

  it('400：playerName 为空字符串', async () => {
    const battle = await createBattle();
    const res = await request(app).patch(`/api/battles/${battle.id}`).send({ playerName: '' });
    expect(res.status).toBe(400);
  });

  it('500：id 不存在（当前行为记录，三期可优化为 404）', async () => {
    const res = await request(app).patch('/api/battles/not-exist-id').send({ result: 'x' });
    expect(res.status).toBe(500);
  });
});

// ─── DELETE /api/battles/:id ───

describe('DELETE /api/battles/:id', () => {
  it('200：删除后 GET 返回 404，hits 级联删除', async () => {
    const battle = await createBattle();
    const res = await request(app).delete(`/api/battles/${battle.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const getRes = await request(app).get(`/api/battles/${battle.id}`);
    expect(getRes.status).toBe(404);

    const hitCount = await prisma.hit.count({ where: { battleId: battle.id } });
    expect(hitCount).toBe(0);
  });

  it('500：id 不存在（当前行为记录，三期可优化为 404）', async () => {
    const res = await request(app).delete('/api/battles/not-exist-id');
    expect(res.status).toBe(500);
  });
});
