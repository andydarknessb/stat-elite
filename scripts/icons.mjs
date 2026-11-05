// Renders public/mark.svg into the PWA icons. Run: node scripts/icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const NAVY = '#0B1020';
const NAVY_RGB = [11, 16, 32];
const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const svg = readFileSync(join(publicDir, 'mark.svg'), 'utf8').replace('<svg ', '<svg width="100%" height="100%" ');

// The maskable mark sits in the central 80% safe zone: a circle of radius 205 on the 512 canvas.
const MASKABLE_MARK = 320;
const SAFE_RADIUS = 205;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  async function render(size, { markSize = size, field = 'transparent' } = {}) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!doctype html><html><head><style>html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;background:${field}}` +
        `body{display:flex;align-items:center;justify-content:center}div{width:${markSize}px;height:${markSize}px}</style></head>` +
        `<body><div>${svg}</div></body></html>`,
    );
    return page.screenshot({ omitBackground: field === 'transparent' });
  }

  // Decodes the PNG bytes in the browser and counts pixels outside the safe circle that are not opaque navy.
  function countOffField(png) {
    return page.evaluate(
      ([b64, size, radius, rgb]) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onerror = reject;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const px = ctx.getImageData(0, 0, size, size).data;
            let outside = 0;
            for (let y = 0; y < size; y++) {
              for (let x = 0; x < size; x++) {
                if (Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) <= radius) continue;
                const i = (y * size + x) * 4;
                if (px[i] !== rgb[0] || px[i + 1] !== rgb[1] || px[i + 2] !== rgb[2] || px[i + 3] !== 255) outside++;
              }
            }
            resolve(outside);
          };
          img.src = `data:image/png;base64,${b64}`;
        }),
      [png.toString('base64'), 512, SAFE_RADIUS, NAVY_RGB],
    );
  }

  const maskable = await render(512, { markSize: MASKABLE_MARK, field: NAVY });
  const outside = await countOffField(maskable);
  if (outside > 0) {
    console.error(
      `icon-maskable-512.png: ${outside} pixels outside the radius-${SAFE_RADIUS} safe circle are not ${NAVY}. ` +
        'The mark leaves the safe zone. Nothing written.',
    );
    process.exitCode = 1;
  } else {
    const icons = {
      'icon-192.png': await render(192),
      'icon-512.png': await render(512),
      'apple-touch-icon.png': await render(180, { field: NAVY }),
      'icon-maskable-512.png': maskable,
    };
    for (const [name, png] of Object.entries(icons)) writeFileSync(join(publicDir, name), png);
    console.log(`wrote ${Object.keys(icons).join(', ')}`);
  }
} finally {
  await browser.close();
}
