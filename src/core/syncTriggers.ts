import type { AppCore } from './appCore';

/** Uploads on launch, and again whenever the connection returns (ADR 0001). */
export function syncOnLaunchAndOnline(core: Pick<AppCore, 'flush'>, target: EventTarget): void {
  void core.flush();
  target.addEventListener('online', () => void core.flush());
}
