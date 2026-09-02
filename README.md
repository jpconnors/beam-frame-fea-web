# 2D Beam / Frame Finite Element Analysis

A browser-based 2D Euler–Bernoulli beam/frame finite-element solver — a
JavaScript port of the MATLAB FEA code

No build step and no server required: open `index.html` in any browser.
Plotly is vendored locally (`vendor/`), so it also works fully offline.

## Features

- **Preset problems** — the portal frame from Problem 3 plus the 3c (moment
  release) and 3d (diagonal brace) variants.
- **Interactive model builder** — pick *“Custom model — build your own…”* to
  define your own nodes, elements (per-element `E`, `A`, `Iz`), supports, and
  nodal loads, then run the analysis. Starts from the portal-frame template.
- **Plots** (Plotly): undeformed mesh + boundary conditions + loads, deformed
  shape (Hermite interpolation), reactions, and **axial / shear / moment
  internal-force diagrams** drawn along each member.
- **Numerical output** — nodal displacements, reactions, per-element
  axial/shear/moment in local coordinates, and a global equilibrium check.

## Project layout

| File | Purpose |
|------|---------|
| `fea.js` | Solver: element stiffness, assembly, linear solve, post-processing |
| `model.js` | `buildModel()` — turns a high-level spec into the solver's arrays |
| `problems.js` | The preset problem definitions |
| `builder.js` | Interactive model-builder UI |
| `plot.js` | Plotly views (mesh, deformed, reactions, N/V/M diagrams) |
| `app.js` | UI wiring and text results |
| `tests/run.js` | Unit tests (analytical + equilibrium checks) |
| `tests/smoke.js` | Headless-browser smoke test (requires Playwright) |

## Tests

The solver is checked against closed-form results (axial bar `PL/EA`,
cantilever `PL³/3EI`, simply-supported beam `PL³/48EI`) and global equilibrium
for every preset:

```sh
npm test
```

A headless-browser smoke test that drives every view and the model builder is
also available (install Playwright first):

```sh
npm install playwright
node tests/smoke.js
```

## Sign conventions (internal-force diagrams)

From the local end-force vector `[N1, V1, M1, N2, V2, M2]`:

- **Axial** (tension positive): `[-N1, +N2]`
- **Shear**: `[+V1, -V2]`
- **Moment** (sagging positive): `[-M1, +M2]`

With no span/distributed loads, each resultant varies linearly end-to-end.
