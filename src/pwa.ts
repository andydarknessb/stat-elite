export type InstallHint = 'hidden' | 'ios' | 'prompt' | 'menu';

/** Which install instructions to show: iOS has no install prompt, so it gets the share-sheet steps. */
export function installHint(env: { userAgent: string; standalone: boolean; installEvent: boolean }): InstallHint {
  if (env.standalone) return 'hidden';
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return 'ios';
  if (env.installEvent) return 'prompt';
  if (/Android/.test(env.userAgent)) return 'menu';
  return 'hidden';
}

/** Asks the browser to keep this origin's storage permanently, so the phone does not evict the Games. */
export async function requestPersistence(storage: StorageManager | undefined): Promise<void> {
  await storage?.persist?.();
}
