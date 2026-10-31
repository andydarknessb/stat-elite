export type InstallHint = 'hidden' | 'ios' | 'prompt' | 'menu';

/** Which install instructions to show: iOS has no install prompt, so it gets the share-sheet steps. */
export function installHint(env: { userAgent: string; standalone: boolean; installEvent: boolean }): InstallHint {
  if (env.standalone) return 'hidden';
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return 'ios';
  if (env.installEvent) return 'prompt';
  if (/Android/.test(env.userAgent)) return 'menu';
  return 'hidden';
}

/** Asks the browser to keep this origin's storage permanently, so the phone does not evict the Games. A refusal is silent. */
export async function requestPersistence(storage: StorageManager | undefined): Promise<void> {
  try {
    await storage?.persist?.();
  } catch {
    // the browser decides eviction on its own rules; nothing to show the Recorder
  }
}
