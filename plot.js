// plot.js — Plotly-based replacements for plot_results.m.
// Three views: undeformed mesh + BCs + loads, deformed shape, reactions.

"use strict";

function _bbox(xn) {
  return {
    xmin: Math.min(...xn[0]), xmax: Math.max(...xn[0]),
    ymin: Math.min(...xn[1]), ymax: Math.max(...xn[1]),
  };
}

function _Lcar(xn) {
  const b = _bbox(xn);
  return Math.max(b.xmax - b.xmin, b.ymax - b.ymin);
}

// Build line traces for the undeformed mesh (one trace, broken with nulls).
function _undeformedMeshTrace(xn, ien, nel, opts) {
  const X = [], Y = [];
  for (let e = 0; e < nel; e++) {
    X.push(xn[0][ien[0][e]], xn[0][ien[1][e]], null);
    Y.push(xn[1][ien[0][e]], xn[1][ien[1][e]], null);
  }
  return {
    x: X, y: Y,
    mode: "lines",
    line: { color: opts.color || "royalblue", width: opts.width || 3, dash: opts.dash },
    name: opts.name || "Elements",
    hoverinfo: "skip",
  };
}

function _nodeLabelTraces(xn) {
  return {
    x: xn[0], y: xn[1],
    mode: "markers+text",
    marker: { color: "royalblue", size: 10 },
    text: xn[0].map((_, i) => String(i + 1)),
    textposition: "top right",
    textfont: { size: 13 },
    name: "Nodes",
    hoverinfo: "text",
  };
}

function _elementLabelTrace(xn, ien, nel) {
  const X = [], Y = [], T = [];
  for (let e = 0; e < nel; e++) {
    X.push(0.5 * (xn[0][ien[0][e]] + xn[0][ien[1][e]]));
    Y.push(0.5 * (xn[1][ien[0][e]] + xn[1][ien[1][e]]));
    T.push(`(${e + 1})`);
  }
  return {
    x: X, y: Y, mode: "text", text: T,
    textfont: { size: 12, color: "black" },
    name: "Element labels",
    hoverinfo: "skip",
    showlegend: false,
  };
}

// ------------------- view 1: undeformed mesh + BCs + loads -------------------

function plotUndeformed(problem, divId) {
  const { xn, ien, nel, idb, f, ndf, nnp, units } = problem;
  const Lcar = _Lcar(xn);

  const traces = [];
  traces.push(_undeformedMeshTrace(xn, ien, nel, { color: "royalblue", width: 3 }));
  traces.push(_nodeLabelTraces(xn));
  traces.push(_elementLabelTrace(xn, ien, nel));

  // BC markers — show fixed nodes as red squares with a tooltip listing locked DOFs.
  const bcX = [], bcY = [], bcText = [];
  const dofLabel = ["u", "v", "θ"];
  for (let n = 0; n < nnp; n++) {
    const fixed = [];
    for (let i = 0; i < ndf; i++) if (idb[i][n] === 1) fixed.push(dofLabel[i]);
    if (fixed.length > 0) {
      bcX.push(xn[0][n]);
      bcY.push(xn[1][n]);
      bcText.push(`Node ${n + 1} fixed: ${fixed.join(", ")}`);
    }
  }
  if (bcX.length > 0) {
    traces.push({
      x: bcX, y: bcY,
      mode: "markers",
      marker: { color: "firebrick", size: 18, symbol: "square", line: { color: "darkred", width: 1.5 } },
      name: "Fixed DOFs",
      text: bcText,
      hoverinfo: "text",
    });
  }

  // Force arrows as Plotly annotations.
  let fmax = 0;
  for (let n = 0; n < nnp; n++) {
    const m = Math.hypot(f[0][n], f[1][n]);
    if (m > fmax) fmax = m;
  }
  const arrowLen = 0.18 * Lcar;
  const annotations = [];
  for (let n = 0; n < nnp; n++) {
    if (f[0][n] !== 0 || f[1][n] !== 0) {
      const m = Math.hypot(f[0][n], f[1][n]);
      const ux = f[0][n] / m, uy = f[1][n] / m;
      const dx = ux * arrowLen, dy = uy * arrowLen;
      annotations.push({
        x: xn[0][n], y: xn[1][n],
        ax: xn[0][n] - dx, ay: xn[1][n] - dy,
        xref: "x", yref: "y", axref: "x", ayref: "y",
        showarrow: true, arrowhead: 3, arrowsize: 1.4, arrowwidth: 2,
        arrowcolor: "darkgreen",
      });
      annotations.push({
        x: xn[0][n] - dx * 1.05, y: xn[1][n] - dy * 1.05,
        text: `${m.toFixed(0)} ${units.force}`,
        font: { color: "darkgreen", size: 11 },
        showarrow: false,
        xanchor: ux > 0 ? "right" : "left",
      });
    }
    if (Math.abs(f[2][n]) > 1e-6) {
      annotations.push({
        x: xn[0][n], y: xn[1][n],
        text: `M=${f[2][n].toFixed(0)}`,
        font: { color: "purple", size: 12 },
        showarrow: false, yshift: 18,
      });
    }
  }

  const layout = {
    title: "Undeformed mesh, boundary conditions, and applied loads",
    xaxis: { title: `x (${units.length})`, scaleanchor: "y", scaleratio: 1, zeroline: false },
    yaxis: { title: `y (${units.length})`, zeroline: false },
    annotations,
    margin: { t: 50, b: 60, l: 60, r: 30 },
    showlegend: true,
  };

  Plotly.newPlot(divId, traces, layout, { responsive: true, displaylogo: false });
}

// ------------------- view 2: deformed shape (Hermite interpolation) -------------------

// Per-element local-frame interpolated displacement at sample points along ξ ∈ [-1, 1].
// Mirrors the beam case in plot_mesh_deformed in plot_results.m.
function _elementLocalDisplacement(problem, dcomp, e, xi) {
  const { xn, ien } = problem;
  const n1 = ien[0][e], n2 = ien[1][e];
  let Le = Math.hypot(xn[0][n2] - xn[0][n1], xn[1][n2] - xn[1][n1]);
  if (Le === 0) Le = 1e-6;

  const g = [
    [(xn[0][n2] - xn[0][n1]) / Le, (xn[1][n2] - xn[1][n1]) / Le],
    [0, 0],
  ];
  g[1][0] = -g[0][1];
  g[1][1] =  g[0][0];
  // ensure right-handed
  const cross = g[0][0] * g[1][1] - g[0][1] * g[1][0];
  if (cross < 0) { g[1][0] = -g[1][0]; g[1][1] = -g[1][1]; }

  const beta  = g;
  const det   = beta[0][0] * beta[1][1] - beta[0][1] * beta[1][0];
  const betap = [
    [ beta[1][1] / det, -beta[0][1] / det],
    [-beta[1][0] / det,  beta[0][0] / det],
  ];

  const Un = [
    [dcomp[0][n1], dcomp[1][n1], dcomp[2][n1]],
    [dcomp[0][n2], dcomp[1][n2], dcomp[2][n2]],
  ];

  // un = Un * betap (translational only); rotations carry over directly.
  const un = [[0, 0, 0], [0, 0, 0]];
  for (let nn = 0; nn < 2; nn++) {
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++)
        un[nn][i] += Un[nn][j] * betap[j][i];
    un[nn][2] = Un[nn][2];
  }

  const out = [];
  for (let i = 0; i < xi.length; i++) {
    const x = xi[i];
    const N1 = (1 / 4) * (1 - x) * (1 - x) * (2 + x);
    const N2 = (Le / 8) * (1 - x * x) * (1 - x);
    const N3 = (1 / 4) * (1 + x) * (1 + x) * (2 - x);
    const N4 = (Le / 8) * (-1 + x * x) * (1 + x);
    const v  = N1 * un[0][1] + N2 * un[0][2] + N3 * un[1][1] + N4 * un[1][2];
    const u  = 0.5 * ((1 - x) * un[0][0] + (1 + x) * un[1][0]);

    // Initial position along the chord
    const X0 = ((1 - x) / 2) * xn[0][n1] + ((1 + x) / 2) * xn[0][n2];
    const Y0 = ((1 - x) / 2) * xn[1][n1] + ((1 + x) / 2) * xn[1][n2];

    // Transform local (u, v) back to global
    const Ux = u * beta[0][0] + v * beta[1][0];
    const Uy = u * beta[0][1] + v * beta[1][1];
    out.push({ X0, Y0, Ux, Uy });
  }
  return out;
}

function _peakDisplacementMagnitude(problem, dcomp, xi) {
  let umax = 0;
  for (let e = 0; e < problem.nel; e++) {
    const samples = _elementLocalDisplacement(problem, dcomp, e, xi);
    for (const s of samples) {
      const m = Math.max(Math.abs(s.Ux), Math.abs(s.Uy));
      if (m > umax) umax = m;
    }
  }
  return umax;
}

function plotDeformed(problem, results, divId) {
  const { xn, ien, nel, units } = problem;
  const { dcomp } = results;

  const xi = [];
  for (let i = -1; i <= 1.0001; i += 0.1) xi.push(Math.min(i, 1));

  const Lcar = _Lcar(xn);
  const displayFactor = 0.1;
  const umax = _peakDisplacementMagnitude(problem, dcomp, xi);
  const scale = umax > 1e-12 ? (displayFactor * Lcar) / umax : 1;

  const traces = [];

  // undeformed reference (dashed gray)
  traces.push(_undeformedMeshTrace(xn, ien, nel, {
    color: "lightgray", width: 2, dash: "dash", name: "Undeformed",
  }));

  // deformed curves (red)
  const dX = [], dY = [];
  for (let e = 0; e < nel; e++) {
    const samples = _elementLocalDisplacement(problem, dcomp, e, xi);
    for (const s of samples) {
      dX.push(s.X0 + scale * s.Ux);
      dY.push(s.Y0 + scale * s.Uy);
    }
    dX.push(null); dY.push(null);
  }
  traces.push({
    x: dX, y: dY,
    mode: "lines",
    line: { color: "crimson", width: 3 },
    name: "Deformed",
    hoverinfo: "skip",
  });

  traces.push(_nodeLabelTraces(xn));

  const layout = {
    title:
      `Undeformed (gray dashed) and deformed (red). ` +
      `Peak |U| = ${umax.toExponential(3)} ${units.length}, ` +
      `display scale ×${scale.toExponential(2)}`,
    xaxis: { title: `x (${units.length})`, scaleanchor: "y", scaleratio: 1 },
    yaxis: { title: `y (${units.length})` },
    margin: { t: 60, b: 60, l: 60, r: 30 },
  };

  Plotly.newPlot(divId, traces, layout, { responsive: true, displaylogo: false });
}

// ------------------- view 3: reactions -------------------

function plotReactions(problem, results, divId) {
  const { xn, ien, nel, nnp, idb, units } = problem;
  const { Rcomp } = results;

  const Lcar = _Lcar(xn);

  let rmax = 0;
  for (let n = 0; n < nnp; n++) {
    const m = Math.hypot(Rcomp[0][n], Rcomp[1][n]);
    if (m > rmax) rmax = m;
  }
  const arrowLen = 0.18 * Lcar;

  const traces = [];
  traces.push(_undeformedMeshTrace(xn, ien, nel, { color: "royalblue", width: 3 }));
  traces.push(_nodeLabelTraces(xn));

  const annotations = [];
  for (let n = 0; n < nnp; n++) {
    if (idb[0][n] === 0 && idb[1][n] === 0 && idb[2][n] === 0) continue;
    const Rx = Rcomp[0][n], Ry = Rcomp[1][n], Mz = Rcomp[2][n];
    const m = Math.hypot(Rx, Ry);
    if (m > 1e-6) {
      const ux = Rx / m, uy = Ry / m;
      const dx = ux * arrowLen, dy = uy * arrowLen;
      annotations.push({
        x: xn[0][n], y: xn[1][n],
        ax: xn[0][n] - dx, ay: xn[1][n] - dy,
        xref: "x", yref: "y", axref: "x", ayref: "y",
        showarrow: true, arrowhead: 3, arrowsize: 1.4, arrowwidth: 2,
        arrowcolor: "firebrick",
      });
      annotations.push({
        x: xn[0][n] - dx * 1.1, y: xn[1][n] - dy * 1.1,
        text: `R = ${m.toFixed(1)} ${units.force}<br>(${Rx.toFixed(1)}, ${Ry.toFixed(1)})`,
        font: { color: "firebrick", size: 10 },
        showarrow: false,
        xanchor: ux > 0 ? "right" : "left",
      });
    }
    if (Math.abs(Mz) > 1e-6) {
      annotations.push({
        x: xn[0][n], y: xn[1][n],
        text: `M = ${Mz.toFixed(1)}`,
        font: { color: "purple", size: 11 },
        showarrow: false, yshift: -18,
      });
    }
  }

  const layout = {
    title: "Reactions at supports",
    xaxis: { title: `x (${units.length})`, scaleanchor: "y", scaleratio: 1 },
    yaxis: { title: `y (${units.length})` },
    annotations,
    margin: { t: 50, b: 60, l: 60, r: 30 },
  };

  Plotly.newPlot(divId, traces, layout, { responsive: true, displaylogo: false });
}
