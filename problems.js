// problems.js — direct ports of the three data_beam.m variants.
// Coordinates entered in feet, multiplied by 12 to get inches (matches MATLAB).

"use strict";

function _zeros2D(r, c) {
  const M = new Array(r);
  for (let i = 0; i < r; i++) M[i] = new Array(c).fill(0);
  return M;
}

// 1-indexed convenience: fix DOFs of a node (1-indexed) given a list of DOF numbers (1-indexed).
function _fix(idb, node1, dofs1) {
  for (const d of dofs1) idb[d - 1][node1 - 1] = 1;
}

function _setForce(f, node1, dof1, value) {
  f[dof1 - 1][node1 - 1] = value;
}

// ---------------- Problem 3 — Base case ----------------
function problemBase() {
  const nsd = 2, ndf = 3, nen = 2, nel = 3, nnp = 4;

  const xn = [
    [0, 0, 24, 24].map(v => v * 12),   // x in inches
    [0, 15, 15, 0].map(v => v * 12)    // y in inches
  ];

  // 1-indexed connectivity matching MATLAB, then converted.
  const ien1 = [
    [1, 2, 3],   // local node 1 of each element
    [2, 3, 4]    // local node 2 of each element
  ];
  const ien = ien1.map(row => row.map(n => n - 1));

  const E = 29000;                  // ksi
  const A  = [20, 20, 20];          // in^2
  const Iz = [723, 723, 723];       // in^4

  const idb = _zeros2D(ndf, nnp);
  _fix(idb, 1, [1, 2, 3]);  // node 1 fully fixed
  _fix(idb, 4, [1, 2, 3]);  // node 4 fully fixed

  const g = _zeros2D(ndf, nnp);

  const f = _zeros2D(ndf, nnp);
  _setForce(f, 2, 1, 500);  // 500 kip horizontal at node 2

  const fequiv = [];
  for (let i = 0; i < nel; i++) fequiv.push(new Array(nen * ndf).fill(0));

  return {
    name: "Problem 3 — Base case",
    description:
      "Rigid portal frame: 24 ft × 15 ft, fully fixed at nodes 1 and 4. " +
      "All members E=29000 ksi, A=20 in², Iz=723 in⁴. " +
      "Lateral load of 500 kips applied horizontally at node 2.",
    units: { length: "in", force: "kip", stress: "ksi" },
    nsd, ndf, nen, nel, nnp, xn, ien, E, A, Iz, fequiv, idb, f, g,
  };
}

// ---------------- Problem 3c — drastically modified Iz ----------------
function problemC() {
  const p = problemBase();
  p.name = "Problem 3c — Element 2 effectively a hinge";
  p.description =
    "Same geometry/loads as base. Iz of element 2 reduced by ×10⁷ (effectively a hinge); " +
    "Iz of elements 1 and 3 increased by ×10⁷. Demonstrates the limiting case of a " +
    "moment release in the beam.";
  p.Iz = [723 * 1e7, 723 / 1e7, 723 * 1e7];
  return p;
}

// ---------------- Problem 3d — 4-element frame with diagonal ----------------
function problemD() {
  const nsd = 2, ndf = 3, nen = 2, nel = 4, nnp = 4;

  const xn = [
    [0, 0, 24, 24].map(v => v * 12),
    [0, 15, 15, 0].map(v => v * 12)
  ];

  const ien1 = [
    [1, 2, 3, 2],   // local node 1
    [2, 3, 4, 4]    // local node 2  (element 4 = diagonal node 2 → node 4)
  ];
  const ien = ien1.map(row => row.map(n => n - 1));

  const E  = 29000;
  const A  = [10, 20, 10, 10];
  const Iz = [340, 723, 340, 340];

  const idb = _zeros2D(ndf, nnp);
  _fix(idb, 1, [1, 2, 3]);
  _fix(idb, 4, [1, 2, 3]);

  const g = _zeros2D(ndf, nnp);
  const f = _zeros2D(ndf, nnp);
  _setForce(f, 2, 1, 500);

  const fequiv = [];
  for (let i = 0; i < nel; i++) fequiv.push(new Array(nen * ndf).fill(0));

  return {
    name: "Problem 3d — 4-element frame with diagonal brace",
    description:
      "Adds a diagonal element (node 2 → node 4) to the portal frame; columns reduced " +
      "to A=10 in², Iz=340 in⁴ while the beam keeps A=20 in², Iz=723 in⁴. Same 500-kip " +
      "lateral load at node 2.",
    units: { length: "in", force: "kip", stress: "ksi" },
    nsd, ndf, nen, nel, nnp, xn, ien, E, A, Iz, fequiv, idb, f, g,
  };
}

const PROBLEMS = {
  base: problemBase,
  c:    problemC,
  d:    problemD,
};
