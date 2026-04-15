import type { ReactNode } from 'react';

interface LayoutProps {
  left: ReactNode;
  right: ReactNode;
}

export function Layout({ left, right }: LayoutProps) {
  // Heights: header 4rem (h-16) + 1px gold divider. Inputs pane on creamDeep, results on cream.
  return (
    <div className="flex h-[calc(100vh-4rem-1px)] w-full">
      <aside className="w-2/5 min-w-[380px] overflow-y-auto border-r border-forest/10 bg-creamDeep p-4">
        {left}
      </aside>
      <main className="flex w-3/5 flex-col overflow-y-auto bg-cream p-4">{right}</main>
    </div>
  );
}
