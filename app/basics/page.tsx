import type { PropsWithChildren } from "react";

export function Page({ children }: PropsWithChildren) {
  return (
    <div className="px-2 py-3">
      <div className="bg-surface-overlay h-full max-h-[108rem] max-w-[70rem] space-y-6 rounded-md border border-stone-600 px-6 pt-4 pb-8 shadow-md shadow-stone-900/30 sm:w-full">
        {children}
      </div>
    </div>
  );
}
