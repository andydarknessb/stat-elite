import type { CardInput } from './shareCard';
import { HALF_COURT, THREE_POINT_LINE } from './court';
import barlowCondensed from '@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2?url';

// the card's side in pixels (plan: M4, a 1200×1200 card)
const SIDE = 1200;
const MARGIN = 60;
// the top 55%: with no photo, the half court or the jersey number fills it
const TOP = SIDE * 0.55;

// Barlow Condensed from the precached file, so it draws with no signal; a failed load leaves the font stack's system-ui
async function loadFont(): Promise<void> {
  try {
    const face = new FontFace('Barlow Condensed', `url(${barlowCondensed})`, { weight: '700' });
    (self as typeof self & { fonts: FontFaceSet }).fonts.add(await face.load());
  } catch {
    // no font: the card draws in system-ui, as before
  }
}

/** One line of text, centred at height y, shrunk to fit the card's width. shortcut: no wrapping, so a long name shrinks rather than breaking, upgrade to wrapping if names get cut */
function drawLine(ctx: OffscreenCanvasRenderingContext2D, text: string, y: number, size: number) {
  let px = size;
  ctx.font = `bold ${px}px "Barlow Condensed", system-ui, sans-serif`;
  while (ctx.measureText(text).width > SIDE - 2 * MARGIN && px > 24) {
    px -= 4;
    ctx.font = `bold ${px}px "Barlow Condensed", system-ui, sans-serif`;
  }
  ctx.fillText(text, SIDE / 2, y);
}

// a photo the browser cannot decode leaves the card photo-less rather than failing it
async function decode(photo: Blob): Promise<ImageBitmap | undefined> {
  try {
    return await createImageBitmap(photo);
  } catch {
    return undefined;
  }
}

// the half court to scale in the top 55%, then one dot per Shot: made in the make green, missed in the miss red
function drawCourt(ctx: OffscreenCanvasRenderingContext2D, shots: CardInput['shots']) {
  const { widthFt, lengthFt, basketFt } = HALF_COURT;
  const scale = Math.min((SIDE - 2 * MARGIN) / widthFt, (TOP - 2 * MARGIN) / lengthFt);
  ctx.save();
  ctx.translate((SIDE - widthFt * scale) / 2, MARGIN);
  ctx.scale(scale, scale);
  ctx.strokeStyle = '#a9b2c6';
  ctx.lineWidth = 0.25;
  ctx.strokeRect(0, 0, widthFt, lengthFt);
  ctx.stroke(new Path2D(THREE_POINT_LINE));
  ctx.beginPath();
  ctx.arc(widthFt / 2, basketFt, 0.75, 0, 2 * Math.PI);
  ctx.stroke();
  for (const { x, y, made } of shots) {
    ctx.fillStyle = made ? '#3fb950' : '#f0605a';
    ctx.beginPath();
    ctx.arc((x / 100) * widthFt, (y / 100) * lengthFt, 1.5, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
}

async function drawCard({ athlete, photo, mark, opponent, final, line, shots }: CardInput): Promise<Blob> {
  await loadFont();
  const canvas = new OffscreenCanvas(SIDE, SIDE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, SIDE, SIDE);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const bitmap = photo ? await decode(photo) : undefined;
  if (bitmap) {
    try {
      // a square crop from the middle, so a portrait or landscape photo loses its edges, not its subject
      const side = Math.min(bitmap.width, bitmap.height);
      ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIDE, SIDE);
    } finally {
      bitmap.close();
    }
    // a dark band under the text keeps it readable over any photo
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, SIDE * 0.55, SIDE, SIDE * 0.45);
  } else if (shots.length > 0) {
    // only a basketball Game has Shots, so the court draws for basketball alone
    drawCourt(ctx, shots);
  } else {
    ctx.fillStyle = '#a9b2c6';
    drawLine(ctx, mark, SIDE * 0.275, 400);
  }
  ctx.fillStyle = '#ffffff';
  drawLine(ctx, athlete, SIDE * 0.62, 110);
  drawLine(ctx, `vs ${opponent}`, SIDE * 0.7, 60);
  ctx.fillStyle = '#f5b841';
  drawLine(ctx, `${final.team}–${final.opponent}`, SIDE * 0.82, 200);
  ctx.fillStyle = '#ffffff';
  if (line) drawLine(ctx, line, SIDE * 0.92, 44);
  return canvas.convertToBlob({ type: 'image/png' });
}

self.onmessage = async ({ data }: MessageEvent<CardInput>) => {
  try {
    self.postMessage({ png: await drawCard(data) });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
