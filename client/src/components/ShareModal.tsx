import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  url: string;
  onClose: () => void;
}

// Clipboard-free fallback for browsers / contexts where navigator.clipboard.writeText() is
// unavailable (iframe, HTTP, certain in-app WebViews, permission denied). Auto-selects the
// URL on open so the user can Cmd/Ctrl+C immediately.
export function ShareModal({ url, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.select(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Select the input so the user can Ctrl+C manually.
      inputRef.current?.select();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-forest/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-card border border-forest/15 bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-sage">
              Shareable link
            </div>
            <h2 className="font-display text-[18px] italic text-forest">Share this calculation</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-stonePale hover:bg-cream hover:text-forest"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <p className="mb-2 text-[12px] text-stone">
          Copy this link. Anyone who opens it will see the exact same inputs.
        </p>

        <div className="flex gap-2">
          <input
            ref={inputRef}
            readOnly
            value={url}
            className="flex-1 rounded border-[1.5px] border-forest/15 bg-cream/40 px-2 py-1.5 font-mono text-[11px] text-ink focus:border-gold focus:outline-none"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 rounded bg-gold px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-forest shadow-gold transition-colors hover:bg-goldLight"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        {url.length > 4000 && (
          <p className="mt-2 text-[11px] text-amber-700">
            ⚠ Link is long ({url.length.toLocaleString()} chars). May not fit in some email
            clients.
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded border-[1.5px] border-forest/25 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-forest hover:border-gold hover:text-gold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
