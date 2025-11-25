import type { PropsWithChildren } from "react";

export function Page({ children }: PropsWithChildren) {
  return (
    <div className="flex h-full flex-col px-2 py-3">
      <div className="border-1 h-full max-h-[77rem] max-w-[50rem] space-y-4 rounded-md border-gray-500 bg-gray-700 px-6 pb-8 pt-4 shadow-md shadow-gray-600 sm:w-full">
        {children}
      </div>
    </div>
  );
}
