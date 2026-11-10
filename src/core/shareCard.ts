import type { Scores } from './appCore';
import type { ShotSpot } from './eventLog';

/** What the share card draws: the Athlete's name and photo, the Opponent, the Final Score, the Athlete's line, and with no usable photo the mark and the Shots. */
export interface CardInput {
  athlete: string;
  photo?: Blob;
  /** The jersey number, or the Athlete's initials when there is none: drawn large when there is no photo and no Shots. */
  mark: string;
  opponent: string;
  final: Scores;
  /** Left off when every number in it is zero. */
  line?: string;
  /** Each Shot's Spot (0–100 on each axis of the half court) and result: its dot on the half court when there is no photo. */
  shots: ShotSpot[];
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
