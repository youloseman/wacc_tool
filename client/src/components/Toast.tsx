import { useEffect, useState } from 'react';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';
export interface ToastMessage {
  id: number;
  text: string;
  kind: ToastKind;
}

interface Props {
  messages: ToastMessage[];
  onDismiss: (id: number) => void;
}

// Minimal toast surface — top-right, auto-dismiss after 3s, click to dismiss early.
// Avoids the sonner dependency while covering the "share/reset/shared-loaded" feedback path.
export function ToastStack({ messages, onDismiss }: Props) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
      {messages.map((m) => (
        <ToastItem key={m.id} msg={m} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ msg, onDismiss }: { msg: ToastMessage; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(msg.id), 3000);
    return () => clearTimeout(t);
  }, [msg.id, onDismiss]);

  const color: Record<ToastKind, string> = {
    info: 'border-forest/20 bg-white text-forest',
    success: 'border-sage/30 bg-sage/5 text-sage',
    warning: 'border-amber-300 bg-amber-50 text-amber-800',
    error: 'border-red-300 bg-red-50 text-red-700',
  };

  return (
    <button
      type="button"
      onClick={() => onDismiss(msg.id)}
      className={`pointer-events-auto max-w-sm rounded-card border px-3 py-2 text-left text-[12px] shadow-sm transition ${color[msg.kind]}`}
    >
      {msg.text}
    </button>
  );
}

// Tiny hook to manage the toast queue without context/state-lib ceremony.
export function useToasts() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const push = (text: string, kind: ToastKind = 'info') => {
    setMessages((m) => [...m, { id: Date.now() + Math.random(), text, kind }]);
  };
  const dismiss = (id: number) => setMessages((m) => m.filter((x) => x.id !== id));
  return { messages, push, dismiss };
}
