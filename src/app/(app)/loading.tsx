// Shown the moment a sidebar link is tapped, while the next page's data loads.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-5">
      <div className="space-y-2">
        <div className="skeleton h-7 w-48" />
        <div className="skeleton h-4 w-72 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="skeleton h-28 rounded-card" />
        ))}
      </div>
      <div className="skeleton h-64 rounded-card" />
      <div className="skeleton h-48 rounded-card" />
    </div>
  );
}
