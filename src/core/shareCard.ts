import type { Scores } from './appCore';

/** What the share card draws: the Athlete's name and photo, the Opponent, the Final Score and the Athlete's line. */
export interface CardInput {
  athlete: string;
  photo?: Blob;
  opponent: string;
  final: Scores;
  line: string;
}

/** Draws the card in a worker, so the photo is decoded and cropped off the UI thread; resolves to a PNG. An abort terminates the worker and rejects with an AbortError. */
export function renderShareCard(input: CardInput, signal?: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('share card render aborted', 'AbortError'));
    const worker = new Worker(new URL('./shareCard.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => {
      worker.terminate();
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      finish();
      reject(new DOMException('share card render aborted', 'AbortError'));
    };
    worker.onmessage = ({ data }: MessageEvent<{ png: Blob } | { error: string }>) => {
      finish();
      if ('png' in data) resolve(data.png);
      else reject(new Error(data.error));
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    worker.postMessage(input);
  });
}
