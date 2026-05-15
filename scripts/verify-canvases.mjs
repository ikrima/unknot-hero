import { chromium } from "playwright-core";

const appUrl = process.env.KNOT_HERO_URL ?? "http://127.0.0.1:5173/";
const chromePath = process.env.CHROME_PATH ?? "/opt/google/chrome-unstable/chrome";
const viewports = [
  { name: "desktop", width: 1440, height: 960 },
  { name: "mobile", width: 390, height: 844 }
];

const browser = await chromium.launch({
  executablePath: chromePath,
  args: ["--no-sandbox"]
});

const results = [];
try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    await page.goto(appUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => {
      const ids = ["perspective-pane", "diagram-pane", "top-pane", "front-pane", "projection-wheel"];
      return ids.every((id) => {
        const canvas = document.getElementById(id);
        return canvas && canvas.width > 0 && canvas.height > 0;
      });
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `/tmp/knot-hero-${viewport.name}.png`, fullPage: true });
    const stats = await page.evaluate(() => {
      const ids = ["perspective-pane", "diagram-pane", "top-pane", "front-pane", "projection-wheel"];

      const summarize = (data) => {
        let minR = 255;
        let maxR = 0;
        let minG = 255;
        let maxG = 0;
        let minB = 255;
        let maxB = 0;
        let alpha = 0;
        let samples = 0;
        const step = Math.max(4, Math.floor(data.length / 50000) * 4);

        for (let index = 0; index < data.length; index += step) {
          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];
          const a = data[index + 3];
          minR = Math.min(minR, r);
          maxR = Math.max(maxR, r);
          minG = Math.min(minG, g);
          maxG = Math.max(maxG, g);
          minB = Math.min(minB, b);
          maxB = Math.max(maxB, b);
          if (a > 0) {
            alpha += 1;
          }
          samples += 1;
        }

        return {
          variance: maxR - minR + maxG - minG + maxB - minB,
          alphaRatio: Number((alpha / samples).toFixed(3)),
          samples
        };
      };

      const sample2d = (canvas) => {
        const context = canvas.getContext("2d");
        if (!context) {
          return null;
        }
        return summarize(context.getImageData(0, 0, canvas.width, canvas.height).data);
      };

      const sampleWebGl = (canvas) => {
        const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        if (!context) {
          return null;
        }
        const data = new Uint8Array(canvas.width * canvas.height * 4);
        context.readPixels(0, 0, canvas.width, canvas.height, context.RGBA, context.UNSIGNED_BYTE, data);
        return summarize(data);
      };

      return ids.map((id) => {
        const canvas = document.getElementById(id);
        const rect = canvas.getBoundingClientRect();
        const pixels = sample2d(canvas) ?? sampleWebGl(canvas);
        return {
          id,
          cssWidth: Math.round(rect.width),
          cssHeight: Math.round(rect.height),
          backingWidth: canvas.width,
          backingHeight: canvas.height,
          variance: pixels?.variance ?? 0,
          alphaRatio: pixels?.alphaRatio ?? 0
        };
      });
    });
    results.push({ viewport: viewport.name, stats });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));

const failures = results.flatMap((entry) =>
  entry.stats
    .filter((stat) => stat.cssWidth <= 0 || stat.cssHeight <= 0 || stat.variance < 20 || stat.alphaRatio < 0.95)
    .map((stat) => `${entry.viewport}:${stat.id}`)
);

if (failures.length > 0) {
  throw new Error(`Canvas verification failed: ${failures.join(", ")}`);
}
