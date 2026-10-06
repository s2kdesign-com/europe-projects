export function createActivityTracker({ send, visible, onError, context = () => null, now = Date.now }) {
  let lastSent = -Infinity, lastContext, pending = false;
  const note = async () => {
    const value = context(), key = JSON.stringify(value);
    if (!visible() || pending || (key === lastContext && now() - lastSent < 60_000)) return;
    pending = true;
    let sent = false;
    try { await send(value); lastSent = now(); lastContext = key; sent = true; }
    catch (error) { onError(error); }
    finally { pending = false; }
    // A resolution may finish/change while the previous request is in flight.
    if (sent && JSON.stringify(context()) !== key) await note();
  };
  return note;
}
