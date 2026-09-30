import { AMMO, type AmmoTypeId } from '../data/ammo';

interface Props {
  value: AmmoTypeId;
  onChange: (id: AmmoTypeId) => void;
}

export default function AmmoSelector({ value, onChange }: Props) {
  return (
    <div className="chip-row">
      {AMMO.map((a) => (
        <button
          key={a.id}
          className={`chip ${value === a.id ? 'active' : ''}`}
          onClick={() => onChange(a.id)}
          title={a.source}
        >
          {a.caliber}mm · {a.name}
        </button>
      ))}
    </div>
  );
}
