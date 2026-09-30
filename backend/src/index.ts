import express from 'express';
import cors from 'cors';
import battles from './routes/battles.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/battles', battles);

const port = 3000;
app.listen(port, () => {
  console.log(`[backend] listening on http://localhost:${port}`);
});
