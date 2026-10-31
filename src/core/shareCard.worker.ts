import type { CardInput } from './shareCard';

// the card's side in pixels (plan: M4, a 1200×1200 card)
const SIDE = 1200;
const MARGIN = 60;

/** One line of text, centred at height y, shrunk to fit the card's width. shortcut: no wrapping, so a long name shrinks rather than breaking, upgrade to wrapping if names get cut */
function drawLine(ctx: OffscreenCanvasRenderingContext2D, text: string, y: number, size: number) {
  let px = size;
  ctx.font = `bold ${px}px system-ui, sans-serif`;
  while (ctx.measureText(text).width > SIDE - 2 * MARGIN && px > 24) {
    px -= 4;
    ctx.font = `bold ${px}px system-ui, sans-serif`;
  }
  ctx.fillText(text, SIDE / 2, y);
}

async function drawCard({ athlete, photo, opponent, final, line }: CardInput): Promise<Blob> {
  const canvas = new OffscreenCanvas(SIDE, SIDE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.fillStyle = '#0f1216';
  ctx.fillRect(0, 0, SIDE, SIDE);
  if (photo) {
    const bitmap = await createImageBitmap(photo);
    // a square crop from the middle, so a portrait or landscape photo loses its edges, not its subject
    const side = Math.min(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIDE, SIDE);
    bitmap.close();
    // a dark band under the text keeps it readable over any photo
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, SIDE * 0.55, SIDE, SIDE * 0.45);
  }
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawLine(ctx, athlete, SIDE * 0.62, 110);
  drawLine(ctx, `vs ${opponent}`, SIDE * 0.7, 60);
  drawLine(ctx, `${final.team}–${final.opponent}`, SIDE * 0.82, 200);
  drawLine(ctx, line, SIDE * 0.92, 44);
  return canvas.convertToBlob({ type: 'image/png' });
}

self.onmessage = async ({ data }: MessageEvent<CardInput>) => {
  try {
    self.postMessage({ png: await drawCard(data) });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
