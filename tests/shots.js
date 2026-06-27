// tests/shots.js — capture clean GUI screenshots (as it would appear hosted).
"use strict";
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const url = "file://" + path.resolve(__dirname, "../index.html");
  await page.goto(url, { waitUntil: "networkidle" });
  const shot = (name) => page.screenshot({ path: path.resolve(__dirname, name), fullPage: true });

  await page.waitForTimeout(400);
  await shot("gui-landing.png");                                   // base, undeformed

  await page.click('.view-btn[data-view="deformed"]');
  await page.waitForTimeout(400); await shot("gui-deformed.png");

  await page.click('.view-btn[data-view="moment"]');
  await page.waitForTimeout(400); await shot("gui-moment.png");

  await page.selectOption("#problem-select", "custom");
  await page.waitForTimeout(400); await shot("gui-builder.png");

  await browser.close();
  console.log("shots written");
})();
