/**
 * Runs `run` every `ms` milliseconds, but only while the tab is visible. When the tab comes back after
 * being hidden for longer than `ms`, it refreshes once straight away. Returns the function that stops it.
 * Hidden tabs used to keep polling, which kept the database busy for pages nobody was looking at.
 */
export function pollWhileVisible(run: () => void, ms: number): () => void {
  let last = Date.now();
  const tick = () => {
    if (document.visibilityState !== "visible") return;
    last = Date.now();
    run();
  };
  const timer = window.setInterval(tick, ms);
  const onVisible = () => {
    if (Date.now() - last >= ms) tick();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
