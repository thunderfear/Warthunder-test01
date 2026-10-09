import express from 'express';
import cors from 'cors';
import battles from './routes/battles.js';

export const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/battles', battles);

// 测试环境（vitest / supertest）下只导出 app 不监听端口
if (!process.env.VITEST) {
  const port = 3000;
  app.listen(port, () => {
    // eslint-disable-next-line no-console -- 服务启动日志，属必要输出
    console.log(`[backend] listening on http://localhost:${port}`);
  });
}
