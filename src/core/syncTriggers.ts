import type { AppCore } from './appCore';

/**
 * Downloads and uploads on launch, and again whenever the connection returns or the page
 * comes back to the front (ADR 0001, ADR 0004). A hidden page does nothing.
 */
export function syncOnLaunchAndOnline(
  core: Pick<AppCore, 'refresh'>,
  target: EventTarget,
  doc: Pick<Document, 'visibilityState'>,
): void {
  void core.refresh();
  target.addEventListener('online', () => void core.refresh());
  target.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible') void core.refresh();
  });
}
