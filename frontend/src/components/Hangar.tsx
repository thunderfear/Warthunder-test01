import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listBattlesPaged, deleteBattle, type BattleDTO } from '../api/client';

const PAGE_SIZE = 12;

export default function Hangar() {
  const navigate = useNavigate();
  const [battles, setBattles] = useState<BattleDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  // 离线模式：任一条目来自 localStorage 回退即视为离线（双数据源收敛的可见标识）
  const offline = battles.some((b) => b.source === 'local');

  async function load(p: number, append: boolean) {
    setLoading(true);
    const { items, total: t } = await listBattlesPaged(p, PAGE_SIZE);
    setBattles((prev) => (append ? [...prev, ...items] : items));
    setTotal(t);
    setPage(p);
    setLoading(false);
  }
  useEffect(() => {
    load(1, false);
  }, []);

  async function del(id: string) {
    if (!id) return;
    await deleteBattle(id);
    load(1, false);
  }

  return (
    <div>
      <div className="panel-title">机库 · 击中分析（战斗记录）</div>
      {offline && (
        <div
          style={{
            margin: '8px 0',
            padding: '8px 12px',
            border: '1px solid #aa7700',
            borderRadius: 6,
            background: 'rgba(170,119,0,0.15)',
            color: '#ffcc66',
            fontSize: 13,
          }}
        >
          离线模式：后端不可用，当前数据来自浏览器本地存储（localStorage），恢复后端后数据可能与服务器不一致
        </div>
      )}
      {loading && battles.length === 0 ? (
        <div className="empty">加载中…</div>
      ) : battles.length === 0 ? (
        <div className="empty">
          暂无战斗记录。先到{' '}
          <a href="/battle" style={{ color: 'var(--cyan)' }}>
            战斗分析
          </a>{' '}
          开火并保存。
        </div>
      ) : (
        <>
          <div className="grid-cards">
            {battles.map((b) => (
              <div className="card" key={b.id} onClick={() => navigate(`/hangar/${b.id}`)}>
                <h3>{b.enemyVehicle}</h3>
                <div className="meta">
                  {b.createdAt ? new Date(b.createdAt).toLocaleString() : ''} · {b.mapName}
                </div>
                <div style={{ marginTop: 8 }}>
                  <span className={`tag ${b.result === '击毁' ? 'win' : 'lose'}`}>{b.result}</span>
                  <span className="tag">{b.hits.length} 发</span>
                  <span className="tag">{b.hits.filter((h) => h.penetrated).length} 击穿</span>
                  {b.source === 'local' && (
                    <span className="tag" style={{ borderColor: '#aa7700', color: '#ffcc66' }}>
                      本地
                    </span>
                  )}
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button
                    className="btn btn-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (b.id) del(b.id);
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
          {battles.length < total && (
            <div style={{ textAlign: 'center', margin: '16px 0' }}>
              <button className="btn" disabled={loading} onClick={() => load(page + 1, true)}>
                {loading ? '加载中…' : `加载更多（${battles.length}/${total}）`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
