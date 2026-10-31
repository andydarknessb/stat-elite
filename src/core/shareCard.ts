import type { Scores } from './appCore';

/** What the share card draws: the Athlete's name and photo, the Opponent, the Final Score and the Athlete's line. */
export interface CardInput {
  athlete: string;
  photo?: Blob;
  opponent: string;
  final: Scores;
  line: string;
}

/** Draws the card in a worker, so the photo is decoded and cropped off the UI thread; resolves to a PNG. */
export function renderShareCard(input: CardInput): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./shareCard.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<{ png: Blob } | { error: string }>) => {
      worker.terminate();
      if ('png' in data) resolve(data.png);
      else reject(new Error(data.error));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message));
    };
    worker.postMessage(input);
  });
}
