/**
 * Every deploy renames the code-split files (content hashes). A tab opened before a deploy still
 * asks for the old names, which no longer exist -> "Failed to fetch dynamically imported module".
 * The fix is to load the new index.html once. A timestamp in sessionStorage prevents a reload loop
 * if the file is missing for another reason.
 */
const KEY = 'naturax:new-version-reload-at';
const LOOP_GUARD_MS = 10_000;

/** Message patterns used by Chrome/Edge, Safari and Firefox for a failed dynamic import. */
export function isChunkLoadError(error) {
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to load module script/i.test(
    error?.message ?? '',
  );
}

/** Reloads the page unless it already did so in the last few seconds. Returns true if reloading. */
export function reloadForNewVersion() {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < LOOP_GUARD_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Storage unavailable (private mode): reload anyway; worst case the error screen shows.
  }
  window.location.reload();
  return true;
}
