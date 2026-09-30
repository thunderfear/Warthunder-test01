import { Routes, Route, NavLink } from 'react-router-dom';
import BattleArena from './components/BattleArena';
import Hangar from './components/Hangar';
import BattleReview from './components/BattleReview';

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          WT·击中分析 <small>复刻原型</small>
        </div>
        <nav className="nav">
          <NavLink to="/battle" className={({ isActive }) => (isActive ? 'active' : '')}>
            战斗分析
          </NavLink>
          <NavLink to="/hangar" className={({ isActive }) => (isActive ? 'active' : '')}>
            机库 · 击中分析
          </NavLink>
        </nav>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<BattleArena />} />
          <Route path="/battle" element={<BattleArena />} />
          <Route path="/hangar" element={<Hangar />} />
          <Route path="/hangar/:id" element={<BattleReview />} />
        </Routes>
      </main>
    </div>
  );
}
