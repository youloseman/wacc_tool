import type { ReactNode } from 'react';

interface LayoutProps {
  left: ReactNode;
  right: ReactNode;
}

export function Layout({ left, right }: LayoutProps) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full">
      <aside className="w-2/5 min-w-[380px] overflow-y-auto border-r border-slate-200 bg-surface p-4">
        {left}
      </aside>
      <main className="flex w-3/5 flex-col overflow-y-auto p-4">{right}</main>
    </div>
  );
}
