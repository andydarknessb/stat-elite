import type { AppCore } from './appCore';

/** Downloads and uploads on launch, and again whenever the connection returns (ADR 0001, ADR 0004). */
export function syncOnLaunchAndOnline(core: Pick<AppCore, 'refresh'>, target: EventTarget): void {
  void core.refresh();
  target.addEventListener('online', () => void core.refresh());
}
