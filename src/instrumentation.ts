/**
 * Runs once when the server starts: creates/updates database tables and seeds default data,
 * so the site works even on a brand-new or wiped database.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { ensureSeeded } = await import("./db/seed");
    await ensureSeeded();
    console.info("[db] schema & seed ready");
  } catch (e) {
    console.error("[db] startup bootstrap failed (will retry on first request)", e);
  }
}
