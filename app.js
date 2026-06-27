// app.js — UI wiring. Picks problem, runs analysis, renders plot + text results.

"use strict";

let currentProblem = null;
let currentResults = null;
let currentView    = "undeformed";

// Right-pad/left-pad helpers to mimic MATLAB sprintf %5d / %10.5f formatting.
function padN(n, w)  { return String(n).padStart(w); }
function padF(x, w, d) {
  const s = (x === 0 ? 0 : x).toFixed(d);
  return s.padStart(w);
}

function formatResults(problem, results) {
  const { dcomp, Rcomp, axial, shear, moment, neq } = results;
  const { nnp, nel, units, name } = problem;

  const lines = [];
  lines.push(" *******                                      *******");
  lines.push(" *******     STRUCTURAL ANALYSIS COMPLETE     *******");
  lines.push(" *******                                      *******");
  lines.push("");
  lines.push(`${name}`);
  lines.push(`Units: length=${units.length}, force=${units.force}, stress=${units.stress}`);
  lines.push(`Free DOFs (size of K): ${neq}`);
  lines.push("");

  lines.push("Nodal Displacements");
  lines.push(" node         dx          dy          dθ");
  for (let n = 0; n < nnp; n++) {
    lines.push(
      padN(n + 1, 5) + "  " +
      padF(dcomp[0][n], 11, 5) + "  " +
      padF(dcomp[1][n], 11, 5) + "  " +
      padF(dcomp[2][n], 11, 5)
    );
  }
  lines.push("");

  lines.push("Nodal Reactions");
  lines.push(" node         R1           R2           M3");
  for (let n = 0; n < nnp; n++) {
    lines.push(
      padN(n + 1, 5) + "  " +
      padF(Rcomp[0][n], 11, 3) + "  " +
      padF(Rcomp[1][n], 11, 3) + "  " +
      padF(Rcomp[2][n], 11, 3)
    );
  }
  lines.push("");

  lines.push("Element Axial / Shear / Moment (local coords, ends 1 and 2)");
  lines.push(
    " elem    axial 1     shear 1    moment 1     axial 2     shear 2    moment 2"
  );
  for (let i = 0; i < nel; i++) {
    lines.push(
      padN(i + 1, 5) + "  " +
      padF(axial[i][0],  10, 3) + "  " +
      padF(shear[i][0],  10, 3) + "  " +
      padF(moment[i][0], 10, 3) + "  " +
      padF(axial[i][1],  10, 3) + "  " +
      padF(shear[i][1],  10, 3) + "  " +
      padF(moment[i][1], 10, 3)
    );
  }
  lines.push("");

  // Quick equilibrium check: sum of reactions vs sum of applied loads.
  const sumRx = Rcomp[0].reduce((a, b) => a + b, 0);
  const sumRy = Rcomp[1].reduce((a, b) => a + b, 0);
  const sumFx = problem.f[0].reduce((a, b) => a + b, 0);
  const sumFy = problem.f[1].reduce((a, b) => a + b, 0);
  lines.push("Equilibrium check (should be ~0)");
  lines.push(`  ΣFx + ΣRx = ${(sumFx + sumRx).toExponential(3)}  (ΣFx=${sumFx.toFixed(3)}, ΣRx=${sumRx.toFixed(3)})`);
  lines.push(`  ΣFy + ΣRy = ${(sumFy + sumRy).toExponential(3)}  (ΣFy=${sumFy.toFixed(3)}, ΣRy=${sumRy.toFixed(3)})`);

  return lines.join("\n");
}

function renderPlot() {
  if (!currentProblem || !currentResults) return;
  switch (currentView) {
    case "undeformed": plotUndeformed(currentProblem, "plot"); break;
    case "deformed":   plotDeformed(currentProblem, currentResults, "plot"); break;
    case "reactions":  plotReactions(currentProblem, currentResults, "plot"); break;
    case "axial":
    case "shear":
    case "moment":     plotInternalForce(currentProblem, currentResults, "plot", currentView); break;
  }
}

function selectProblem(key) {
  currentProblem = PROBLEMS[key]();
  try {
    currentResults = runAnalysis(currentProblem);
  } catch (err) {
    document.getElementById("results").textContent = "Error during analysis: " + err.message;
    console.error(err);
    return;
  }
  document.getElementById("description").textContent = currentProblem.description;
  document.getElementById("results").textContent = formatResults(currentProblem, currentResults);
  renderPlot();
}

function selectView(v) {
  currentView = v;
  document.querySelectorAll(".view-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.view === v);
  });
  renderPlot();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("problem-select").addEventListener("change", e => {
    selectProblem(e.target.value);
  });
  document.querySelectorAll(".view-btn").forEach(btn => {
    btn.addEventListener("click", () => selectView(btn.dataset.view));
  });
  selectProblem("base");
});
