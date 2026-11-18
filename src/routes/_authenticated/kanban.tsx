import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Columns3, FolderOpen, GripVertical, Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  collectionsQuery,
  kanbanColumnQuery,
  leadsKeys,
  updateLeadStatus,
  type KanbanPage,
  type Lead,
} from "@/lib/leads-api";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/constants";
import { userMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import { EmptyState, PriorityBadge, StatusBadge } from "@/components/common";
import { CollectionFilter } from "@/components/CollectionFilter";
import { usePersistentState } from "@/lib/theme";
import { statusTone } from "@/lib/status-tone";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/kanban")({
  head: () => ({
    meta: [
      { title: "Kanban — LeadHunter" },
      { name: "description", content: "Funil de vendas em Kanban." },
    ],
  }),
  component: Kanban,
});

type Card = Pick<
  Lead,
  "id" | "name" | "city" | "state" | "phone" | "status" | "niche" | "priority"
>;
type Cache = InfiniteData<KanbanPage, number>;

function CardBody({ l, dragging }: { l: Card; dragging?: boolean }) {
  return (
    <div
      className={cn(
        "card-surface flex gap-2 p-3 text-sm",
        dragging && "rotate-2 shadow-elevated ring-2 ring-primary",
      )}
    >
      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-medium">{l.name}</p>
          <PriorityBadge priority={l.priority} compact className="shrink-0" />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {[l.city && `${l.city}${l.state ? `/${l.state}` : ""}`, l.phone]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>
      </div>
    </div>
  );
}

function DraggableCard({ l, onMove }: { l: Card; onMove: (l: Card, to: LeadStatus) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: l.id, data: l });
  return (
    <div className={cn("group relative transition-opacity", isDragging && "opacity-30")}>
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        aria-roledescription="card arrastável"
        aria-label={`${l.name}. Pressione espaço para mover.`}
        className="cursor-grab touch-manipulation rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      >
        <div className="card-interactive rounded-xl">
          <CardBody l={l} />
        </div>
      </div>
      <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
        <Button asChild size="icon" variant="ghost" className="h-7 w-7 text-xs">
          <Link to="/leads/$id" params={{ id: l.id }} aria-label={`Abrir ${l.name}`}>
            ↗
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Mover ${l.name}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-xs">Mover para</DropdownMenuLabel>
            {LEAD_STATUSES.filter((s) => s.id !== l.status).map((s) => (
              <DropdownMenuItem key={s.id} onSelect={() => onMove(l, s.id)}>
                <StatusBadge status={s.id} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function Column({
  status,
  label,
  collectionId,
  onMove,
}: {
  status: LeadStatus;
  label: string;
  collectionId: string | null;
  onMove: (l: Card, to: LeadStatus) => void;
}) {
  const q = useInfiniteQuery(kanbanColumnQuery(status, collectionId));
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];
  const total = q.data?.pages[0]?.total ?? 0;
  return (
    <section
      ref={setNodeRef}
      aria-label={`${label}: ${total} lead(s)`}
      className={cn(
        "flex w-[82vw] max-w-80 shrink-0 snap-start flex-col rounded-2xl border bg-muted/50 p-3 transition-[border-color,background-color,box-shadow] duration-150 sm:w-72",
        isOver ? "border-primary bg-accent/60 shadow-elevated" : "border-border",
      )}
    >
      <header className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span
            className={cn("h-2.5 w-2.5 rounded-full ring-1 ring-inset", statusTone(status))}
            style={{ backgroundColor: "currentColor" }}
            aria-hidden
          />
          {label}
        </h2>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs font-bold tabular-nums shadow-sm">
          {q.isLoading ? "…" : total}
        </span>
      </header>
      <div className="min-h-28 flex-1 space-y-2">
        {q.isLoading &&
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        {q.isError && <p className="text-xs text-destructive">{userMessage(q.error)}</p>}
        {rows.map((l) => (
          <DraggableCard key={l.id} l={l} onMove={onMove} />
        ))}
        {!q.isLoading && !rows.length && (
          <p
            className={cn(
              "rounded-xl border-2 border-dashed border-border p-4 text-center text-xs text-muted-foreground transition-colors",
              isOver && "border-primary text-primary",
            )}
          >
            Arraste cards para cá
          </p>
        )}
      </div>
      {q.hasNextPage && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2"
          onClick={() => void q.fetchNextPage()}
          disabled={q.isFetchingNextPage}
        >
          {q.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
          Carregar mais ({total - rows.length})
        </Button>
      )}
    </section>
  );
}

// Drop where the pointer is (intuitive with wide cards); keyboard drags fall back to overlap.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

function Kanban() {
  const qc = useQueryClient();
  const [active, setActive] = useState<Card | null>(null);
  // Remembered per browser, so the filter survives navigation and reloads.
  const [collectionId, setCollectionId] = usePersistentState<string | null>(
    "lh-kanban-collection",
    null,
  );
  const { data: cols } = useQuery(collectionsQuery);
  const current = collectionId ? cols?.find((c) => c.id === collectionId) : undefined;
  // Trust the remembered id until the list proves it no longer exists (no unfiltered flash).
  const effective = collectionId && (!cols || current) ? collectionId : null;
  // The remembered collection was deleted (or belongs to another account): show all.
  useEffect(() => {
    if (collectionId && cols && !current) setCollectionId(null);
  }, [collectionId, cols, current, setCollectionId]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Long-press on touch so vertical/horizontal scrolling still works on phones.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const move = async (card: Card, to: LeadStatus) => {
    const from = card.status as LeadStatus;
    if (from === to) return;
    const fromKey = leadsKeys.kanban(from, effective);
    const toKey = leadsKeys.kanban(to, effective);
    await Promise.all([
      qc.cancelQueries({ queryKey: fromKey }),
      qc.cancelQueries({ queryKey: toKey }),
    ]);
    const snapFrom = qc.getQueryData<Cache>(fromKey);
    const snapTo = qc.getQueryData<Cache>(toKey);
    // Optimistic update: remove from the source column, prepend to the target column.
    qc.setQueryData<Cache>(
      fromKey,
      (old) =>
        old && {
          ...old,
          pages: old.pages.map((p, i) => ({
            ...p,
            rows: p.rows.filter((r) => r.id !== card.id),
            total: i === 0 ? p.total - 1 : p.total,
          })),
        },
    );
    qc.setQueryData<Cache>(
      toKey,
      (old) =>
        old && {
          ...old,
          pages: old.pages.map((p, i) =>
            i === 0
              ? { ...p, rows: [{ ...(card as Lead), status: to }, ...p.rows], total: p.total + 1 }
              : p,
          ),
        },
    );
    try {
      await updateLeadStatus(card.id, to);
      toast.success(`“${card.name}” movido para ${LEAD_STATUSES.find((s) => s.id === to)?.label}`);
      void qc.invalidateQueries({ queryKey: leadsKeys.dashboard });
      // Other filter views (all / other collections) refetch when they are opened next.
      void qc.invalidateQueries({ queryKey: ["leads", "kanban"], refetchType: "none" });
      void qc.invalidateQueries({ queryKey: ["leads", "list"] });
      void qc.invalidateQueries({ queryKey: leadsKeys.one(card.id) });
    } catch (e) {
      // Roll back the visual change.
      qc.setQueryData(fromKey, snapFrom);
      qc.setQueryData(toKey, snapTo);
      toast.error(`Não foi possível mover: ${userMessage(e)}`);
    }
  };

  const onDragStart = (e: DragStartEvent) => setActive((e.active.data.current as Card) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const card = e.active.data.current as Card | undefined;
    const to = e.over?.id as LeadStatus | undefined;
    if (card && to) void move(card, to);
  };

  return (
    <>
      <PageHeader
        icon={Columns3}
        title="Kanban"
        subtitle="Arraste os cards entre as colunas (no celular, toque e segure). Cada mudança fica registrada no histórico do lead."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <CollectionFilter value={effective} onChange={setCollectionId} />
        {current && (
          <p className="text-xs text-muted-foreground">
            Mostrando {current.lead_count} lead(s) de “{current.name}” ·{" "}
            <Link
              to="/colecoes/$id"
              params={{ id: current.id }}
              className="font-medium text-primary hover:underline"
            >
              abrir coleção
            </Link>
          </p>
        )}
      </div>
      {current && current.lead_count === 0 && (
        <EmptyState
          icon={FolderOpen}
          title="Esta coleção ainda não tem leads"
          description="Adicione leads a ela pela pesquisa, por Meus leads ou pela página da coleção."
          className="card-surface mb-4 py-10"
          action={
            <>
              <Button asChild size="sm">
                <Link to="/busca">Pesquisar leads</Link>
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCollectionId(null)}>
                Ver todas as coleções
              </Button>
            </>
          }
        />
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(null)}
        accessibility={{
          announcements: {
            onDragStart: ({ active: a }) =>
              `Pegou ${(a.data.current as Card | undefined)?.name ?? "card"}.`,
            onDragOver: ({ over }) =>
              over
                ? `Sobre a coluna ${LEAD_STATUSES.find((s) => s.id === over.id)?.label}.`
                : "Fora das colunas.",
            onDragEnd: ({ over }) =>
              over
                ? `Solto em ${LEAD_STATUSES.find((s) => s.id === over.id)?.label}.`
                : "Movimento cancelado.",
            onDragCancel: () => "Movimento cancelado.",
          },
        }}
      >
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-4 sm:mx-0 sm:snap-none sm:px-0 [scrollbar-width:thin]">
          {LEAD_STATUSES.map((s) => (
            <Column
              key={s.id}
              status={s.id}
              label={s.label}
              collectionId={effective}
              onMove={move}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" }}>
          {active ? <CardBody l={active} dragging /> : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}
