import { expect, test, vi } from 'vitest';
import { renderShareCard, type CardInput } from './shareCard';

const card: CardInput = {
  athlete: 'Casey',
  opponent: 'Hawks',
  final: { team: 7, opponent: 3 },
  line: '2 pts',
};

test('aborting a render terminates its unanswered worker and rejects as AbortError', async () => {
  const terminated = vi.fn();
  class FakeWorker {
    postMessage() {}
    terminate() {
      terminated();
    }
  }
  vi.stubGlobal('Worker', FakeWorker);

  const controller = new AbortController();
  const rendering = renderShareCard(card, controller.signal);
  controller.abort();

  const error = await rendering.catch((reason: unknown) => reason);
  expect((error as Error).name).toBe('AbortError');
  expect(terminated).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});
