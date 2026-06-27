// fea.js — JS port of the MATLAB beam/frame FEA engine
// Originally: JK Guest (JHU), JP Connors (HW7, Fall 2016)
//
// Index conventions:
//   - All "internal" arrays are 0-indexed (xn, ien, idb, dcomp, etc.).
//   - The id/idr equation-number arrays use the MATLAB convention:
//       0  => constrained (no equation)
//       k  => 1-indexed equation number; we subtract 1 when indexing into K/F.

"use strict";

// ---------- linear algebra helpers ----------

function zeros2D(rows, cols) {
  const M = new Array(rows);
  for (let i = 0; i < rows; i++) M[i] = new Array(cols).fill(0);
  return M;
}

function zeros1D(n) { return new Array(n).fill(0); }

function transpose(M) {
  const r = M.length, c = M[0].length;
  const T = zeros2D(c, r);
  for (let i = 0; i < r; i++)
    for (let j = 0; j < c; j++) T[j][i] = M[i][j];
  return T;
}

function matmul(A, B) {
  const m = A.length, k = B.length, n = B[0].length;
  const C = zeros2D(m, n);
  for (let i = 0; i < m; i++) {
    for (let p = 0; p < k; p++) {
      const Aip = A[i][p];
      if (Aip === 0) continue;
      for (let j = 0; j < n; j++) C[i][j] += Aip * B[p][j];
    }
  }
  return C;
}

function matvec(A, v) {
  const m = A.length, k = v.length;
  const r = zeros1D(m);
  for (let i = 0; i < m; i++) {
    let s = 0;
    for (let p = 0; p < k; p++) s += A[i][p] * v[p];
    r[i] = s;
  }
  return r;
}

// Solve A*x = b via Gaussian elimination with partial pivoting.
// A is n×n, b is length n. Returns x of length n.
function solveLinear(A, b) {
  const n = b.length;
  const M = new Array(n);
  for (let i = 0; i < n; i++) {
    M[i] = A[i].slice();
    M[i].push(b[i]);  // augmented column
  }
  for (let i = 0; i < n; i++) {
    let maxRow = i, maxVal = Math.abs(M[i][i]);
    for (let k = i + 1; k < n; k++) {
      const v = Math.abs(M[k][i]);
      if (v > maxVal) { maxVal = v; maxRow = k; }
    }
    if (maxVal < 1e-14) throw new Error("Singular global stiffness matrix");
    if (maxRow !== i) { const tmp = M[i]; M[i] = M[maxRow]; M[maxRow] = tmp; }
    for (let k = i + 1; k < n; k++) {
      const f = M[k][i] / M[i][i];
      if (f === 0) continue;
      M[k][i] = 0;
      for (let j = i + 1; j <= n; j++) M[k][j] -= f * M[i][j];
    }
  }
  const x = zeros1D(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

// ---------- ports of the .m files ----------

// Ke_beam.m — element stiffness in global coords for a 2D Euler-Bernoulli beam.
// ienE: [globalNodeOfLocal1, globalNodeOfLocal2] (0-indexed).
function elementStiffness(E, A, Iz, xn, ienE, nen, ndf, nsd) {
  const x = zeros2D(nsd, nen);
  for (let i = 0; i < nen; i++)
    for (let d = 0; d < nsd; d++) x[d][i] = xn[d][ienE[i]];

  const ex = x[0][1] - x[0][0];
  const ey = x[1][1] - x[1][0];
  const l = Math.sqrt(ex * ex + ey * ey);
  const c = ex / l, s = ey / l;

  const al  = A / l;
  const il  = Iz / l;
  const il2 = Iz / (l * l);
  const il3 = Iz / (l * l * l);

  const ke = [
    [ E*al,         0,           0, -E*al,         0,           0],
    [    0,  12*E*il3,   6*E*il2,     0, -12*E*il3,   6*E*il2 ],
    [    0,   6*E*il2,    4*E*il,     0,  -6*E*il2,    2*E*il ],
    [-E*al,         0,           0,  E*al,         0,           0],
    [    0, -12*E*il3,  -6*E*il2,     0,  12*E*il3,  -6*E*il2 ],
    [    0,   6*E*il2,    2*E*il,     0,  -6*E*il2,    4*E*il ]
  ];

  let Te;
  if (nsd === 2) {
    Te = [
      [ c,  s, 0, 0, 0, 0],
      [-s,  c, 0, 0, 0, 0],
      [ 0,  0, 1, 0, 0, 0],
      [ 0,  0, 0,  c,  s, 0],
      [ 0,  0, 0, -s,  c, 0],
      [ 0,  0, 0,  0,  0, 1]
    ];
  } else {
    throw new Error("Only nsd=2 supported");
  }

  const Ke = matmul(matmul(transpose(Te), ke), Te);
  return { Ke, ke, Te, length: l };
}

// number_eq.m — assign equation numbers to free DOFs.
function numberEq(idb, nnp, ndf) {
  const id = zeros2D(ndf, nnp);
  let neq = 0;
  for (let n = 0; n < nnp; n++) {
    for (let i = 0; i < ndf; i++) {
      if (idb[i][n] === 0) {
        neq++;
        id[i][n] = neq;
      }
    }
  }
  return { id, neq };
}

// get_local_id.m — element-level localization map.
function getLocalId(id, ienE, nen, ndf) {
  const LM = zeros1D(nen * ndf);
  for (let j = 0; j < nen; j++)
    for (let i = 0; i < ndf; i++)
      LM[j * ndf + i] = id[i][ienE[j]];
  return LM;
}

// addstiff.m — assemble Ke into K (mutates K in place).
function addStiff(K, Ke, LM, nee) {
  for (let j = 0; j < nee; j++) {
    if (LM[j] > 0) {
      for (let i = 0; i < nee; i++) {
        if (LM[i] > 0) K[LM[i] - 1][LM[j] - 1] += Ke[i][j];
      }
    }
  }
}

// addforce.m — assemble fe into F (mutates F in place).
function addForceVec(F, fe, LM, nee) {
  for (let i = 0; i < nee; i++) {
    if (LM[i] > 0) F[LM[i] - 1] += fe[i];
  }
}

// add_loads_to_force.m — applied nodal loads → F.
function addLoadsToForce(F, fn, id, nnp, ndf) {
  for (let n = 0; n < nnp; n++)
    for (let i = 0; i < ndf; i++)
      if (id[i][n] > 0) F[id[i][n] - 1] += fn[i][n];
}

// add_d2dcomp.m — splice du into the complete displacement (mutates dcomp).
function addD2Dcomp(dcomp, du, id, nnp, ndf) {
  for (let n = 0; n < nnp; n++)
    for (let i = 0; i < ndf; i++)
      if (id[i][n] > 0) dcomp[i][n] += du[id[i][n] - 1];
}

// get_de_from_dcomp.m — extract element DOF vector.
function getDeFromDcomp(dcomp, ienE, nen, ndf) {
  const de = zeros1D(nen * ndf);
  for (let i = 0; i < nen; i++)
    for (let j = 0; j < ndf; j++)
      de[i * ndf + j] = dcomp[j][ienE[i]];
  return de;
}

// main_beam.m — top-level driver. Returns all post-processed quantities.
function runAnalysis(p) {
  const { nsd, ndf, nen, nel, nnp, xn, ien, E, A, Iz, fequiv, idb, f, g } = p;
  const nee = nen * ndf;

  // 1) equation numbering
  const { id, neq } = numberEq(idb, nnp, ndf);

  // 2) per-element stiffness + transformation
  const elems = [];
  for (let i = 0; i < nel; i++) {
    const nodes = [ien[0][i], ien[1][i]];
    const Ei = Array.isArray(E) ? E[i] : E;   // accept scalar (uniform) or per-element E
    const stiff = elementStiffness(Ei, A[i], Iz[i], xn, nodes, nen, ndf, nsd);
    elems.push({ ...stiff, nodes });
  }

  // 3) localization map per element
  const LM = elems.map(el => getLocalId(id, el.nodes, nen, ndf));

  // 4) build F and K, solve for du
  const FequivPerElem = new Array(nel);
  let du = [];

  if (neq > 0) {
    const F = zeros1D(neq);
    addLoadsToForce(F, f, id, nnp, ndf);

    for (let i = 0; i < nel; i++) {
      // Contribution from prescribed displacements g:  F -= Ke * dse
      const dseI = getDeFromDcomp(g, elems[i].nodes, nen, ndf);
      const FseI = matvec(elems[i].Ke, dseI).map(v => -v);
      addForceVec(F, FseI, LM[i], nee);

      // Equivalent fixed-end forces (local fequiv → global):  F += Te' * fequiv
      const feLocal = (fequiv && fequiv[i]) ? fequiv[i] : zeros1D(nee);
      const FeqI = matvec(transpose(elems[i].Te), feLocal);
      FequivPerElem[i] = FeqI;
      addForceVec(F, FeqI, LM[i], nee);
    }

    const K = zeros2D(neq, neq);
    for (let i = 0; i < nel; i++) addStiff(K, elems[i].Ke, LM[i], nee);

    du = solveLinear(K, F);
  } else {
    for (let i = 0; i < nel; i++) FequivPerElem[i] = zeros1D(nee);
  }

  // 5) complete displacement field: dcomp = g (prescribed) + expanded du (free)
  const dcomp = zeros2D(ndf, nnp);
  for (let n = 0; n < nnp; n++)
    for (let i = 0; i < ndf; i++) dcomp[i][n] = g[i][n];
  addD2Dcomp(dcomp, du, id, nnp, ndf);

  // 6) element forces: Fe = Ke*de - Fequiv (global), feLocal = Te*Fe (local)
  const Fe = new Array(nel);
  const feLocal = new Array(nel);
  const axial  = zeros2D(nel, nen);
  const shear  = zeros2D(nel, nen);
  const moment = zeros2D(nel, nen);

  for (let i = 0; i < nel; i++) {
    const de = getDeFromDcomp(dcomp, elems[i].nodes, nen, ndf);
    const FeI = matvec(elems[i].Ke, de);
    for (let j = 0; j < nee; j++) FeI[j] -= FequivPerElem[i][j];
    Fe[i] = FeI;

    const flocI = matvec(elems[i].Te, FeI);
    feLocal[i] = flocI;

    axial[i][0]  = flocI[0]; shear[i][0]  = flocI[1]; moment[i][0] = flocI[2];
    axial[i][1]  = flocI[3]; shear[i][1]  = flocI[4]; moment[i][1] = flocI[5];
  }

  // 7) reactions: idbr = 1 - idb, then assemble R from Fe using LMR
  const idbr = zeros2D(ndf, nnp);
  for (let n = 0; n < nnp; n++)
    for (let i = 0; i < ndf; i++) idbr[i][n] = 1 - idb[i][n];
  const { id: idr, neq: neqr } = numberEq(idbr, nnp, ndf);

  const R = zeros1D(neqr);
  for (let i = 0; i < nel; i++) {
    const LMR = getLocalId(idr, elems[i].nodes, nen, ndf);
    addForceVec(R, Fe[i], LMR, nee);
  }

  const Rcomp = zeros2D(ndf, nnp);
  addD2Dcomp(Rcomp, R, idr, nnp, ndf);

  return {
    dcomp, Rcomp, axial, shear, moment,
    elems, neq, neqr, id, idr,
    Fe, feLocal,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    runAnalysis, elementStiffness, numberEq, getLocalId,
    solveLinear, transpose, matmul, matvec, zeros1D, zeros2D,
  };
}
