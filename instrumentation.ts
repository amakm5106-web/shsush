export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { db } = await import('@/lib/firebase');
      const { tickRoundSystem } = await import('@/lib/roundEngine');

      // Autonomous 24/7 background round ticker runs continuously on the server
      setInterval(async () => {
        try {
          await tickRoundSystem(db, 60);
        } catch {
          // ignore transient background ticker errors
        }
      }, 5000);
    } catch (err) {
      console.warn('Instrumentation background worker startup note:', err);
    }
  }
}
