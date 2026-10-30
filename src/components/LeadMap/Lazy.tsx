import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import type { MapPoint } from "./index";

const Map = lazy(() => import("./index"));

export type { MapPoint };

export function LazyLeadMap(props: { points: MapPoint[]; selectedId?: string | null; onSelect?: (id: string) => void }) {
  const fallback = <div className="h-full w-full animate-pulse rounded-xl bg-muted" />;
  return (
    <ClientOnly fallback={fallback}>
      <Suspense fallback={fallback}>
        <Map {...props} />
      </Suspense>
    </ClientOnly>
  );
}
