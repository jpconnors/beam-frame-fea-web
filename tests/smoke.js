// tests/smoke.js — headless browser smoke test: load the page, exercise every
// view button, capture console errors, and screenshot the diagram views.
"use strict";

const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  const url = "file://" + path.resolve(__dirname, "../index.html");
  await page.goto(url, { waitUntil: "networkidle" });

  // Plotly comes from a CDN; wait for it but don't fail the whole run if blocked.
  const plotlyLoaded = await page.evaluate(() => typeof window.Plotly !== "undefined");
  console.log("Plotly loaded:", plotlyLoaded);

  const views = await page.$$eval(".view-btn", (bs) => bs.map((b) => b.dataset.view));
  console.log("views:", views.join(", "));

  for (const v of views) {
    await page.click(`.view-btn[data-view="${v}"]`);
    await page.waitForTimeout(200);
  }
  // also flip through each preset problem
  for (const opt of ["base", "c", "d"]) {
    await page.selectOption("#problem-select", opt);
    await page.waitForTimeout(200);
  }

  const resultsText = await page.textContent("#results");
  const hasResults = /STRUCTURAL ANALYSIS COMPLETE/.test(resultsText);
  console.log("results rendered:", hasResults);

  await page.selectOption("#problem-select", "base");
  for (const v of ["deformed", "moment", "shear", "axial", "reactions"]) {
    await page.click(`.view-btn[data-view="${v}"]`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.resolve(__dirname, `smoke-${v}.png`) });
  }

  await browser.close();

  // Ignore CDN/network noise (Plotly is loaded from a CDN, which may be
  // unreachable in sandboxed CI); fail only on errors from our own scripts.
  const real = errors.filter(
    (e) => !/plot\.ly|net::|Failed to load resource|ERR_|Plotly is not defined/.test(e)
  );
  if (real.length) {
    console.log("SCRIPT ERRORS:\n  " + real.join("\n  "));
    process.exit(1);
  }
  if (!hasResults) { console.log("results did not render"); process.exit(1); }
  console.log("\nsmoke OK");
})();
