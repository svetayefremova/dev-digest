// Drive the running DevDigest web app in headless system Chrome and report
// only what was asked: step results, page errors and failed API calls.
//
//   node check.mjs <url> '<steps JSON>'
//
// Steps (run in order):
//   {"click": "Original order"}            click a button by accessible name, else by text
//   {"see": "4 files"}                     assert the text is visible (PASS/FAIL line)
//   {"absent": "src/a.ts"}                 assert the text is NOT visible
//   {"count": "blocker"}                   print how many elements contain the text
//   {"shot": "out.png", "clip": "<css>"}   screenshot; clip to the first match of a CSS
//                                          selector (keeps images small), else viewport
//   {"wait": 500}                          wait N ms
// Exit code 1 if any "see"/"absent" step fails or the page throws.
import { chromium } from 'playwright-core';

const [url, stepsJson = '[]'] = process.argv.slice(2);
if (!url) {
  console.error("usage: node check.mjs <url> '<steps JSON>'");
  process.exit(2);
}
const steps = JSON.parse(stepsJson);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
const apiErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('response', (r) => {
  if (r.url().includes(':3001') && r.status() >= 400) apiErrors.push(`${r.status()} ${r.url()}`);
});

let failed = false;
try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  for (const step of steps) {
    if (step.click) {
      const byRole = page.getByRole('button', { name: step.click }).first();
      const target = (await byRole.count()) > 0 ? byRole : page.getByText(step.click).first();
      await target.click();
      await page.waitForTimeout(300);
      console.log(`click  ${step.click}`);
    } else if (step.see || step.absent) {
      const text = step.see ?? step.absent;
      const visible = await page.getByText(text).first().isVisible().catch(() => false);
      const ok = step.see ? visible : !visible;
      if (!ok) failed = true;
      console.log(`${ok ? 'PASS' : 'FAIL'}   ${step.see ? 'see' : 'absent'} "${text}"`);
    } else if (step.count) {
      console.log(`count  "${step.count}" = ${await page.getByText(step.count).count()}`);
    } else if (step.shot) {
      // The app scrolls inside <main>, so element screenshots of tall elements
      // come out partly blank. Clip a page screenshot to the element's visible box.
      const box = step.clip
        ? await page.locator(step.clip).first().evaluate((el) => {
            el.scrollIntoView({ block: 'start' });
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          })
        : null;
      if (box) {
        const vh = page.viewportSize().height;
        const y = Math.max(0, box.y);
        await page.screenshot({
          path: step.shot,
          clip: { x: Math.max(0, box.x), y, width: box.width, height: Math.min(box.height, vh - y) },
        });
      } else await page.screenshot({ path: step.shot });
      console.log(`shot   ${step.shot}`);
    } else if (step.wait) {
      await page.waitForTimeout(step.wait);
    }
  }
} finally {
  await browser.close();
}

console.log(`page errors: ${pageErrors.length ? pageErrors.join(' | ') : 'none'}`);
console.log(`api errors:  ${apiErrors.length ? apiErrors.join(' | ') : 'none'}`);
if (failed || pageErrors.length) process.exit(1);
