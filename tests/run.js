// tests/run.js — analytical + sanity checks for the FEA solver.
// Run with:  node tests/run.js   (or `npm test`)
//
// Each beam test compares the solver against a closed-form result from
// elementary structural mechanics, so a regression in fea.js shows up as a
// failing case rather than a silently wrong number.

"use strict";

const { runAnalysis } = require("../fea.js");
const { buildModel } = require("../model.js");
const { PROBLEMS } = require("../problems.js");

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ✓ " + name);
  } catch (e) {
    failed++;
    console.log("  ✗ " + name);
    console.log("      " + e.message);
  }
}

// Relative comparison with an absolute floor, so values near zero still pass.
function approx(actual, expected, relTol, label) {
  const tol = relTol * Math.max(1, Math.abs(expected)) + 1e-9;
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${label || "value"}: expected ${expected}, got ${actual} (tol ${tol.toExponential(2)})`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

const E = 29000;   // ksi
const TOL = 1e-6;

// ---- 1. Axial bar: u = P L / (E A) ---------------------------------------
test("axial bar elongation = PL/EA", () => {
  const L = 100, A = 10, P = 50;
  const m = buildModel({
    nodes: [[0, 0], [L, 0]],
    elements: [{ i: 1, j: 2, E, A, Iz: 100 }],
    supports: { 1: [1, 1, 1], 2: [0, 1, 1] },   // node 2 free only in u
    loads: { 2: [P, 0, 0] },
  });
  const r = runAnalysis(m);
  approx(r.dcomp[0][1], (P * L) / (E * A), TOL, "u2");
  approx(r.Rcomp[0][0], -P, TOL, "Rx at support");   // reaction balances load
});

// ---- 2. Cantilever, transverse tip load: v = P L^3 / (3 E I) -------------
test("cantilever tip deflection = PL^3/3EI", () => {
  const L = 120, A = 10, Iz = 200, P = -10;   // downward
  const m = buildModel({
    nodes: [[0, 0], [L, 0]],
    elements: [{ i: 1, j: 2, E, A, Iz }],
    supports: { 1: [1, 1, 1] },                 // fully fixed at root
    loads: { 2: [0, P, 0] },
  });
  const r = runAnalysis(m);
  approx(r.dcomp[1][1], (P * L ** 3) / (3 * E * Iz), TOL, "tip v");
  approx(r.dcomp[2][1], (P * L ** 2) / (2 * E * Iz), TOL, "tip theta");
  // reactions: shear balances P, fixed-end moment = -P*L (about the root)
  approx(r.Rcomp[1][0], -P, TOL, "root shear");
  approx(r.Rcomp[2][0], -P * L, TOL, "root moment");
});

// ---- 3. Simply supported beam, central load: v_mid = P L^3 / (48 E I) ----
test("simply supported mid deflection = PL^3/48EI", () => {
  const L = 240, A = 10, Iz = 200, P = -20;
  const m = buildModel({
    nodes: [[0, 0], [L / 2, 0], [L, 0]],
    elements: [
      { i: 1, j: 2, E, A, Iz },
      { i: 2, j: 3, E, A, Iz },
    ],
    supports: { 1: [1, 1, 0], 3: [0, 1, 0] },   // pin + roller, rotations free
    loads: { 2: [0, P, 0] },
  });
  const r = runAnalysis(m);
  approx(r.dcomp[1][1], (P * L ** 3) / (48 * E * Iz), TOL, "mid v");
  // symmetric reactions, each carries half the load
  approx(r.Rcomp[1][0], -P / 2, TOL, "left reaction");
  approx(r.Rcomp[1][2], -P / 2, TOL, "right reaction");
});

// ---- 4. Per-element E honored (array vs scalar) --------------------------
test("scalar E and array E give identical results", () => {
  const base = {
    nodes: [[0, 0], [100, 0]],
    elements: [{ i: 1, j: 2, E, A: 10, Iz: 200 }],
    supports: { 1: [1, 1, 1] },
    loads: { 2: [0, -5, 0] },
  };
  const arrModel = buildModel(base);           // E stored per-element (array)
  const scalarModel = buildModel(base);
  scalarModel.E = E;                            // force scalar path in solver
  const a = runAnalysis(arrModel);
  const s = runAnalysis(scalarModel);
  approx(a.dcomp[1][1], s.dcomp[1][1], 1e-12, "v tip");
});

// ---- 5. Global equilibrium for every preset problem ---------------------
for (const key of Object.keys(PROBLEMS)) {
  test(`preset "${key}" satisfies global equilibrium`, () => {
    const p = PROBLEMS[key]();
    const r = runAnalysis(p);
    const sum = (M) => M.reduce((a, b) => a + b, 0);
    const sumFx = sum(p.f[0]) + sum(r.Rcomp[0]);
    const sumFy = sum(p.f[1]) + sum(r.Rcomp[1]);
    assert(Math.abs(sumFx) < 1e-4, `ΣFx = ${sumFx}`);
    assert(Math.abs(sumFy) < 1e-4, `ΣFy = ${sumFy}`);

    // Moment equilibrium about the origin (loads + reactions + reaction moments).
    let Mo = 0;
    for (let n = 0; n < p.nnp; n++) {
      Mo += p.xn[0][n] * (p.f[1][n] + r.Rcomp[1][n]);
      Mo -= p.xn[1][n] * (p.f[0][n] + r.Rcomp[0][n]);
      Mo += p.f[2][n] + r.Rcomp[2][n];
    }
    assert(Math.abs(Mo) < 1e-2, `ΣMo = ${Mo}`);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
