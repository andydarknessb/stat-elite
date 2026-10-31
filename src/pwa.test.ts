import { describe, expect, it, vi } from 'vitest';
import { installHint, requestPersistence } from './pwa';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

describe('installHint', () => {
  it('shows nothing once the app runs from the home screen', () => {
    expect(installHint({ userAgent: ANDROID, standalone: true, installEvent: true })).toBe('hidden');
  });

  it('explains the iOS share-sheet steps', () => {
    expect(installHint({ userAgent: IPHONE, standalone: false, installEvent: false })).toBe('ios');
  });

  it('offers the install prompt on Android once the browser has one', () => {
    expect(installHint({ userAgent: ANDROID, standalone: false, installEvent: true })).toBe('prompt');
  });

  it('points Android at the browser menu until the prompt is available', () => {
    expect(installHint({ userAgent: ANDROID, standalone: false, installEvent: false })).toBe('menu');
  });

  it('shows nothing on other browsers without an install prompt', () => {
    expect(installHint({ userAgent: DESKTOP, standalone: false, installEvent: false })).toBe('hidden');
  });
});

describe('requestPersistence', () => {
  it('asks the browser to keep storage permanently', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    await requestPersistence({ persist } as unknown as StorageManager);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('does nothing where the Storage API is missing', async () => {
    await expect(requestPersistence(undefined)).resolves.toBeUndefined();
  });
});
