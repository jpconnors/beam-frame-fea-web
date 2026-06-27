// model.js — buildModel(): construct a problem object (the shape consumed by
// runAnalysis in fea.js) from a high-level specification. Shared by the preset
// problems, the interactive model builder, and the test suite so there is a
// single source of truth for how a model maps onto the solver's arrays.

"use strict";

// spec = {
//   name, description,
//   units:    { length, force, stress },
//   nodes:    [[x, y], ...],                         // absolute coords in units.length
//   elements: [{ i, j, E, A, Iz }, ...],            // i, j are 1-indexed node numbers
//   supports: [[u, v, th], ...] per node  OR  { nodeNo: [u, v, th] }   // truthy = fixed
//   loads:    [[Fx, Fy, M], ...] per node OR  { nodeNo: [Fx, Fy, M] }
//   prescribed: same shape as loads (optional) -> nodal prescribed displacements g
// }
function buildModel(spec) {
  const nsd = 2, ndf = 3, nen = 2;
  const nodes = spec.nodes || [];
  const elements = spec.elements || [];
  const nnp = nodes.length;
  const nel = elements.length;

  const zeros2D = (r, c) => {
    const M = new Array(r);
    for (let i = 0; i < r; i++) M[i] = new Array(c).fill(0);
    return M;
  };

  const xn = [nodes.map(p => p[0]), nodes.map(p => p[1])];

  const ien = [elements.map(e => e.i - 1), elements.map(e => e.j - 1)];
  const E  = elements.map(e => e.E);
  const A  = elements.map(e => e.A);
  const Iz = elements.map(e => e.Iz);

  const idb = zeros2D(ndf, nnp);
  const f   = zeros2D(ndf, nnp);
  const g   = zeros2D(ndf, nnp);

  const apply = (src, dst, asBool) => {
    if (!src) return;
    const entries = Array.isArray(src)
      ? src.map((row, n) => [n + 1, row])
      : Object.entries(src).map(([k, row]) => [Number(k), row]);
    for (const [nodeNo, row] of entries) {
      if (!row || nodeNo < 1 || nodeNo > nnp) continue;
      for (let d = 0; d < ndf; d++) {
        const v = row[d];
        dst[d][nodeNo - 1] = asBool ? (v ? 1 : 0) : (Number(v) || 0);
      }
    }
  };
  apply(spec.supports, idb, true);
  apply(spec.loads, f, false);
  apply(spec.prescribed, g, false);

  const fequiv = [];
  for (let i = 0; i < nel; i++) fequiv.push(new Array(nen * ndf).fill(0));

  return {
    name: spec.name || "Custom model",
    description: spec.description || "",
    units: spec.units || { length: "in", force: "kip", stress: "ksi" },
    nsd, ndf, nen, nel, nnp,
    xn, ien, E, A, Iz, fequiv, idb, f, g,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildModel };
}
