export function createActivityTracker({ send, visible, onError, now = Date.now }) {
  let lastSent = -Infinity, pending = false;
  return async () => {
    if (!visible() || pending || now() - lastSent < 60_000) return;
    pending = true;
    try { await send(); lastSent = now(); }
    catch (error) { onError(error); }
    finally { pending = false; }
  };
}
