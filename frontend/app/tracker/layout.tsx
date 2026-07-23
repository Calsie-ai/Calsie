import { Suspense, type ReactNode } from "react";

export default function TrackerLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<main aria-busy="true" aria-label="Loading application tracker" />}>
      {children}
    </Suspense>
  );
}
