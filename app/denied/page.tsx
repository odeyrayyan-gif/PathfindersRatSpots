export default function DeniedPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl">
        <h1 className="text-3xl font-bold">Access Denied</h1>
        <p className="mt-3 text-sm text-zinc-400">
          Your Discord account is not on the allowlist yet.
        </p>
      </div>
    </main>
  )
}