export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeDb } = await import('./lib/db/index')
    await initializeDb()
  }
}
