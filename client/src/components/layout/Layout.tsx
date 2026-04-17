import type { ReactNode } from 'react';

interface LayoutProps {
  left: ReactNode;
  right: ReactNode;
}

export function Layout({ left, right }: LayoutProps) {
  // Desktop (≥ lg): two-panel side-by-side, form left + results right.
  // Mobile  (< lg): single column, results FIRST (order-1) so LinkedIn visitors see the WACC
  //                  immediately, form below (order-2) for those who want to tweak.
  return (
    <div className="flex w-full flex-col lg:h-[calc(100vh-4rem-1px)] lg:flex-row">
      <aside className="order-2 w-full overflow-y-auto border-forest/10 bg-creamDeep p-3 lg:order-1 lg:w-2/5 lg:min-w-[380px] lg:border-r lg:p-4">
        {left}
      </aside>
      <main className="order-1 flex w-full flex-col overflow-y-auto bg-cream p-3 lg:order-2 lg:w-3/5 lg:p-4">
        {right}
      </main>
    </div>
  );
}
