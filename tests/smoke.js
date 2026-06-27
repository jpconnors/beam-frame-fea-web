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

  // ---- exercise the interactive model builder ----
  await page.selectOption("#problem-select", "custom");
  await page.waitForTimeout(200);
  const builderVisible = await page.isVisible("#builder");
  console.log("builder visible:", builderVisible);
  const nNodeRows = await page.$$eval(".node-row", (r) => r.length);
  console.log("builder node rows:", nNodeRows);

  // edit a load on the valid template topology and run
  await page.fill('.load-row[data-node="2"] [data-f="Fx"]', "250");
  await page.click('[data-act="run"]');
  await page.waitForTimeout(300);
  const afterRunResults = await page.textContent("#results");
  const builderRan = /STRUCTURAL ANALYSIS COMPLETE/.test(afterRunResults);
  console.log("builder produced results:", builderRan);
  await page.screenshot({ path: path.resolve(__dirname, "smoke-builder.png"), fullPage: true });

  // structural edits: add then delete a node should round-trip the row count
  await page.click('[data-act="add-node"]');
  await page.waitForTimeout(100);
  const addedRows = await page.$$eval(".node-row", (r) => r.length);
  await page.click('.node-row:last-child [data-act="del-node"]');
  await page.waitForTimeout(100);
  const delRows = await page.$$eval(".node-row", (r) => r.length);
  console.log(`rows: add -> ${addedRows}, delete -> ${delRows}`);

  // an inadequately-supported model must fail gracefully (no crash, shows message)
  await page.click('[data-act="add-node"]');           // orphan node 5
  await page.waitForTimeout(100);
  await page.click('[data-act="run"]');
  await page.waitForTimeout(200);
  const gracMsg = await page.textContent("#results");
  const graceful = /not adequately supported|Error during analysis/.test(gracMsg);
  console.log("singular model handled gracefully:", graceful);

  await page.click('[data-act="reset"]');
  await page.waitForTimeout(200);
  const resetRows = await page.$$eval(".node-row", (r) => r.length);
  console.log("rows after reset:", resetRows);

  if (!builderVisible || nNodeRows !== 4 || !builderRan ||
      addedRows !== 5 || delRows !== 4 || !graceful || resetRows !== 4) {
    console.log("builder checks FAILED");
    process.exit(1);
  }

  await browser.close();

  // Ignore CDN/network noise (Plotly is loaded from a CDN, which may be
  // unreachable in sandboxed CI); fail only on errors from our own scripts.
  // "Singular global stiffness matrix" is expected — the builder test deliberately
  // runs an under-supported model and asserts it is handled gracefully (see `graceful`).
  const real = errors.filter(
    (e) => !/plot\.ly|net::|Failed to load resource|ERR_|Plotly is not defined|Singular global stiffness matrix/.test(e)
  );
  if (real.length) {
    console.log("SCRIPT ERRORS:\n  " + real.join("\n  "));
    process.exit(1);
  }
  if (!hasResults) { console.log("results did not render"); process.exit(1); }
  console.log("\nsmoke OK");
})();
