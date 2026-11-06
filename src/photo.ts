// the share card is 1200×1200, so a photo whose short side is this long fills it without stretching
const SHORT_SIDE = 1200;

/** The size a picked photo is stored at: 1200px on its short side, never up. */
export function storedSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, SHORT_SIDE / Math.min(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** The picked photo, scaled by storedSize and encoded as JPEG. A photo the browser cannot decode is returned as picked, as before. */
export async function shrinkPhoto(photo: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // from-image: a phone's photo is upright as its EXIF orientation says
    bitmap = await createImageBitmap(photo, { imageOrientation: 'from-image' });
  } catch {
    return photo;
  }
  const { width, height } = storedSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d canvas to scale the photo on');
  // a transparent PNG would encode as black
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
  if (!jpeg) throw new Error('the scaled photo would not encode as JPEG');
  return jpeg;
}
