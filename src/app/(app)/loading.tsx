export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Chargement">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-28 animate-pulse rounded-xl bg-muted" />
        <div className="h-28 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
