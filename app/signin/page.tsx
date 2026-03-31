import { signIn } from "@/auth"

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl">
        <h1 className="text-3xl font-bold">Pathfinders RatSpots</h1>
        <p className="mt-3 text-sm text-zinc-400">
          Sign in with Discord to access the site.
        </p>

        <form
          action={async () => {
            "use server"
            await signIn("discord", { redirectTo: "/" })
          }}
          className="mt-6"
        >
          <button className="w-full rounded-2xl border border-indigo-500 bg-indigo-600 px-4 py-3 hover:bg-indigo-500">
            Sign in with Discord
          </button>
        </form>
      </div>
    </main>
  )
}