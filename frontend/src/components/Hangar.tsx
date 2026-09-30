import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listBattles, deleteBattle, type BattleDTO } from '../api/client';

export default function Hangar() {
  const navigate = useNavigate();
  const [battles, setBattles] = useState<BattleDTO[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setBattles(await listBattles());
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function del(id: string) {
    if (!id) return;
    await deleteBattle(id);
    load();
  }

  return (
    <div>
      <div className="panel-title">机库 · 击中分析（战斗记录）</div>
      {loading ? (
        <div className="empty">加载中…</div>
      ) : battles.length === 0 ? (
        <div className="empty">
          暂无战斗记录。先到 <a href="/battle" style={{ color: 'var(--cyan)' }}>战斗分析</a> 开火并保存。
        </div>
      ) : (
        <div className="grid-cards">
          {battles.map((b) => (
            <div className="card" key={b.id} onClick={() => navigate(`/hangar/${b.id}`)}>
              <h3>{b.enemyVehicle}</h3>
              <div className="meta">
                {(b.createdAt ? new Date(b.createdAt).toLocaleString() : '')} · {b.mapName}
              </div>
              <div style={{ marginTop: 8 }}>
                <span className={`tag ${b.result === '击毁' ? 'win' : 'lose'}`}>{b.result}</span>
                <span className="tag">{b.hits.length} 发</span>
                <span className="tag">{b.hits.filter((h) => h.penetrated).length} 击穿</span>
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
      )}
    </div>
  );
}
