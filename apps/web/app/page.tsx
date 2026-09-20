import Link from "next/link";

export default function Home() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link
        href="/clients"
        className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow"
      >
        <h2 className="text-lg font-semibold">Clients</h2>
        <p className="mt-1 text-sm text-slate-600">
          View and add clients to your studio.
        </p>
      </Link>
      <Link
        href="/bookings"
        className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow"
      >
        <h2 className="text-lg font-semibold">Bookings</h2>
        <p className="mt-1 text-sm text-slate-600">
          Track shoots through your pipeline, from inquiry to delivered.
        </p>
      </Link>
    </div>
  );
}
