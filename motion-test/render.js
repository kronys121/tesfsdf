// usage: node render.js out.mp4 startFrame endFrame [samples] | node render.js --stills dir t1 t2 ...
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const FPS = 60;
(async () => {
  const args = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--force-color-profile=srgb'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('PAGEERR', e.message));
  await page.goto('file://' + path.join(__dirname, 'scene.html'));
  await page.evaluate(() => window.ready);
  if (args[0] === '--stills') {
    const dir = args[1];
    for (const ts of args.slice(2)) {
      const t = parseFloat(ts);
      await page.evaluate(([t, f]) => window.render(t, f), [t, Math.round(t * FPS)]);
      await page.screenshot({ path: `${dir}/s_${ts.padStart(5, '0')}.jpg`, type: 'jpeg', quality: 85 });
    }
    await browser.close(); return;
  }
  const [out, a, b, sArg] = args;
  const S = parseInt(sArg || '4'); const f0 = parseInt(a), f1 = parseInt(b);
  const shutter = 0.5; // 180 degrees
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS * S), '-c:v', 'mjpeg', '-i', '-',
    '-vf', `tmix=frames=${S},select='eq(mod(n\\,${S})\\,${S - 1})',setpts=N/${FPS}/TB`, '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = f0; f < f1; f++) {
    for (let k = 0; k < S; k++) {
      const off = S === 1 ? 0 : ((k + .5) / S - .5) * shutter;
      const t = (f + off) / FPS;
      await page.evaluate(([t, f]) => window.render(Math.max(0, t), f), [t, f]);
      const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    }
    if ((f - f0) % 60 === 0) console.error(`${out}: frame ${f} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
})();
