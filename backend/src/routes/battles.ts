import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();
const router = Router();

/* ── Zod Schemas ─────────────────────────────────────────────── */

const HitSchema = z.object({
  seq: z.number().int(),
  timeOffset: z.number().int(),
  ammoId: z.string().min(1),
  caliber: z.number().positive(),
  distance: z.number().positive(),
  impactAngle: z.number(),
  effectiveThickness: z.number(),
  shellPen: z.number(),
  zoneKey: z.string().nullable().optional(),
  zoneLabel: z.string().nullable().optional(),
  armorType: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  penetrated: z.boolean(),
  ricochet: z.boolean(),
  missed: z.boolean(),
  postPenDamage: z.number().int().optional().default(0),
  crewKilled: z.boolean(),
  armorNeutralized: z.boolean().optional().default(false),
  resultText: z.string().optional().default(''),
  postEffectDetails: z.string().nullable().optional(),
  chainEvents: z.string().nullable().optional(),
  vehicleState: z.string().nullable().optional(),
  overpressureKPa: z.number().nullable().optional(),
  crewKilledList: z.string().nullable().optional(),
});

const CreateBattleSchema = z.object({
  playerName: z.string().min(1, '玩家名称不能为空'),
  playerVehicle: z.string().min(1, '玩家载具不能为空'),
  enemyVehicle: z.string().min(1, '敌方载具不能为空'),
  mapName: z.string().min(1, '地图名称不能为空'),
  result: z.string().optional(),
  hits: z.array(HitSchema).min(1, '至少需要一次命中记录'),
});

const UpdateBattleSchema = z
  .object({
    result: z.string().optional(),
    notes: z.string().optional(),
    playerName: z.string().min(1).optional(),
    playerVehicle: z.string().min(1).optional(),
    enemyVehicle: z.string().min(1).optional(),
    mapName: z.string().min(1).optional(),
  })
  .strict();

/* ── Helpers ─────────────────────────────────────────────────── */

function safeError(error: unknown): string {
  return process.env.NODE_ENV === 'production'
    ? '服务器内部错误'
    : (error instanceof Error ? error.message : String(error));
}

function mapHit(h: any) {
  return {
    seq: h.seq,
    timeOffset: h.timeOffset,
    ammoId: h.ammoId,
    caliber: h.caliber,
    distance: h.distance,
    impactAngle: h.impactAngle,
    effectiveThickness: h.effectiveThickness,
    shellPen: h.shellPen,
    zoneKey: h.zoneKey ?? null,
    zoneLabel: h.zoneLabel ?? null,
    armorType: h.armorType ?? null,
    category: h.category ?? null,
    penetrated: !!h.penetrated,
    ricochet: !!h.ricochet,
    missed: !!h.missed,
    postPenDamage: h.postPenDamage ?? 0,
    crewKilled: !!h.crewKilled,
    armorNeutralized: !!h.armorNeutralized,
    resultText: h.resultText ?? '',
    postEffectDetails: h.postEffectDetails ?? null,
    chainEvents: h.chainEvents ?? null,
    vehicleState: h.vehicleState ?? null,
    overpressureKPa: h.overpressureKPa ?? null,
    crewKilledList: h.crewKilledList ?? null,
  };
}

/* ── Routes ──────────────────────────────────────────────────── */

// POST /battles — 创建战斗记录（含输入验证）
router.post('/', async (req, res) => {
  try {
    const parsed = CreateBattleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: '输入验证失败',
        details: parsed.error.issues,
      });
    }

    const b = parsed.data;
    const created = await prisma.battle.create({
      data: {
        playerName: b.playerName,
        playerVehicle: b.playerVehicle,
        enemyVehicle: b.enemyVehicle,
        mapName: b.mapName,
        result: b.result ?? '',
        hits: { create: b.hits.map(mapHit) },
      },
      include: { hits: true },
    });
    res.status(201).json(created);
  } catch (e) {
    console.error('创建战斗记录失败:', e);
    res.status(500).json({ error: safeError(e) });
  }
});

// GET /battles — 获取战斗列表（含错误处理）
router.get('/', async (_req, res) => {
  try {
    const battles = await prisma.battle.findMany({
      include: { hits: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(battles);
  } catch (e) {
    console.error('获取战斗列表失败:', e);
    res.status(500).json({ error: safeError(e) });
  }
});

// GET /battles/:id — 获取单条战斗记录
router.get('/:id', async (req, res) => {
  try {
    const b = await prisma.battle.findUnique({
      where: { id: req.params.id },
      include: { hits: true },
    });
    if (!b) return res.status(404).json({ error: 'not found' });
    res.json(b);
  } catch (e) {
    console.error('获取战斗详情失败:', e);
    res.status(500).json({ error: safeError(e) });
  }
});

// PATCH /battles/:id — 更新战斗记录（含字段白名单验证）
router.patch('/:id', async (req, res) => {
  try {
    const parsed = UpdateBattleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: '输入验证失败',
        details: parsed.error.issues,
      });
    }

    const b = await prisma.battle.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    res.json(b);
  } catch (e) {
    console.error('更新战斗记录失败:', e);
    res.status(500).json({ error: safeError(e) });
  }
});

// DELETE /battles/:id — 删除战斗记录
router.delete('/:id', async (req, res) => {
  try {
    await prisma.battle.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    console.error('删除战斗记录失败:', e);
    res.status(500).json({ error: safeError(e) });
  }
});

export default router;
