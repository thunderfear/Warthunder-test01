import type { ToastMessage } from './Toast';

const icons: Record<string, string> = {
  success: '✅',
  error: '❌',
  info: 'ℹ️',
};

export default function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: ToastMessage[];
  onRemove: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => onRemove(t.id)}>
          <span className="toast-icon">{icons[t.type]}</span>
          <span className="toast-text">{t.text}</span>
        </div>
      ))}
    </div>
  );
}
