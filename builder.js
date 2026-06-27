// builder.js — interactive model builder. Lets the user define their own
// nodes, elements, supports, and nodal loads, then runs the analysis through
// the same buildModel()/runAnalysis() pipeline as the preset problems.

"use strict";

const Builder = (function () {
  const DEFAULT_E = 29000;       // ksi
  const UNITS = { length: "in", force: "kip", stress: "ksi" };

  let state = null;              // single source of truth, see defaultState()
  let rootEl = null;
  let onRun = null;             // callback(problem) supplied by app.js
  let onError = null;          // callback(message)

  // Portal-frame template (matches Problem 3 base) so the form starts usable.
  function defaultState() {
    return {
      nodes: [
        { x: 0,   y: 0   },
        { x: 0,   y: 180 },
        { x: 288, y: 180 },
        { x: 288, y: 0   },
      ],
      elements: [
        { i: 1, j: 2, E: DEFAULT_E, A: 20, Iz: 723 },
        { i: 2, j: 3, E: DEFAULT_E, A: 20, Iz: 723 },
        { i: 3, j: 4, E: DEFAULT_E, A: 20, Iz: 723 },
      ],
      supports: { 1: [1, 1, 1], 4: [1, 1, 1] },
      loads: { 2: [500, 0, 0] },
    };
  }

  // ---------- DOM <-> state ----------

  const num = (v, d = 0) => {
    const x = parseFloat(v);
    return Number.isFinite(x) ? x : d;
  };

  function syncStateFromDOM() {
    if (!rootEl) return;

    state.nodes = Array.from(rootEl.querySelectorAll(".node-row")).map((row) => ({
      x: num(row.querySelector('[data-f="x"]').value),
      y: num(row.querySelector('[data-f="y"]').value),
    }));

    state.elements = Array.from(rootEl.querySelectorAll(".elem-row")).map((row) => ({
      i:  Math.round(num(row.querySelector('[data-f="i"]').value, 1)),
      j:  Math.round(num(row.querySelector('[data-f="j"]').value, 1)),
      E:  num(row.querySelector('[data-f="E"]').value, DEFAULT_E),
      A:  num(row.querySelector('[data-f="A"]').value, 1),
      Iz: num(row.querySelector('[data-f="Iz"]').value, 1),
    }));

    const supports = {}, loads = {};
    rootEl.querySelectorAll(".support-row").forEach((row) => {
      const n = Number(row.dataset.node);
      supports[n] = [
        row.querySelector('[data-f="u"]').checked ? 1 : 0,
        row.querySelector('[data-f="v"]').checked ? 1 : 0,
        row.querySelector('[data-f="t"]').checked ? 1 : 0,
      ];
    });
    rootEl.querySelectorAll(".load-row").forEach((row) => {
      const n = Number(row.dataset.node);
      loads[n] = [
        num(row.querySelector('[data-f="Fx"]').value),
        num(row.querySelector('[data-f="Fy"]').value),
        num(row.querySelector('[data-f="M"]').value),
      ];
    });
    state.supports = supports;
    state.loads = loads;
  }

  // ---------- rendering ----------

  const esc = (v) => String(v);

  function nodeRows() {
    return state.nodes.map((n, k) => `
      <tr class="node-row">
        <td class="idx">${k + 1}</td>
        <td><input type="number" step="any" data-f="x" value="${esc(n.x)}"></td>
        <td><input type="number" step="any" data-f="y" value="${esc(n.y)}"></td>
        <td><button class="mini-btn del" data-act="del-node" data-k="${k}" title="Delete node">✕</button></td>
      </tr>`).join("");
  }

  function elemRows() {
    const nn = state.nodes.length;
    return state.elements.map((e, k) => `
      <tr class="elem-row">
        <td class="idx">${k + 1}</td>
        <td><input type="number" min="1" max="${nn}" step="1" data-f="i" value="${esc(e.i)}"></td>
        <td><input type="number" min="1" max="${nn}" step="1" data-f="j" value="${esc(e.j)}"></td>
        <td><input type="number" step="any" data-f="E"  value="${esc(e.E)}"></td>
        <td><input type="number" step="any" data-f="A"  value="${esc(e.A)}"></td>
        <td><input type="number" step="any" data-f="Iz" value="${esc(e.Iz)}"></td>
        <td><button class="mini-btn del" data-act="del-elem" data-k="${k}" title="Delete element">✕</button></td>
      </tr>`).join("");
  }

  function supportRows() {
    return state.nodes.map((_, k) => {
      const s = state.supports[k + 1] || [0, 0, 0];
      const cb = (f, c) => `<input type="checkbox" data-f="${f}" ${c ? "checked" : ""}>`;
      return `
      <tr class="support-row" data-node="${k + 1}">
        <td class="idx">${k + 1}</td>
        <td>${cb("u", s[0])}</td>
        <td>${cb("v", s[1])}</td>
        <td>${cb("t", s[2])}</td>
      </tr>`;
    }).join("");
  }

  function loadRows() {
    return state.nodes.map((_, k) => {
      const l = state.loads[k + 1] || [0, 0, 0];
      const inp = (f, val) => `<input type="number" step="any" data-f="${f}" value="${esc(val)}">`;
      return `
      <tr class="load-row" data-node="${k + 1}">
        <td class="idx">${k + 1}</td>
        <td>${inp("Fx", l[0])}</td>
        <td>${inp("Fy", l[1])}</td>
        <td>${inp("M",  l[2])}</td>
      </tr>`;
    }).join("");
  }

  function render() {
    const u = UNITS;
    rootEl.innerHTML = `
      <p class="builder-note">
        Define the model below (coordinates in ${u.length}, E in ${u.stress}, A in ${u.length}²,
        Iz in ${u.length}⁴, forces in ${u.force}, moments in ${u.force}·${u.length}),
        then press <strong>Run analysis</strong>. Check a support box to fix that DOF.
      </p>

      <div class="builder-grid">
        <section>
          <h3>Nodes</h3>
          <table class="builder-table">
            <thead><tr><th>#</th><th>x</th><th>y</th><th></th></tr></thead>
            <tbody>${nodeRows()}</tbody>
          </table>
          <button class="mini-btn add" data-act="add-node">+ Add node</button>
        </section>

        <section>
          <h3>Elements</h3>
          <table class="builder-table">
            <thead><tr><th>#</th><th>i</th><th>j</th><th>E</th><th>A</th><th>Iz</th><th></th></tr></thead>
            <tbody>${elemRows()}</tbody>
          </table>
          <button class="mini-btn add" data-act="add-elem">+ Add element</button>
        </section>

        <section>
          <h3>Supports (fixed DOFs)</h3>
          <table class="builder-table">
            <thead><tr><th>node</th><th>u</th><th>v</th><th>θ</th></tr></thead>
            <tbody>${supportRows()}</tbody>
          </table>
        </section>

        <section>
          <h3>Nodal loads</h3>
          <table class="builder-table">
            <thead><tr><th>node</th><th>Fx</th><th>Fy</th><th>M</th></tr></thead>
            <tbody>${loadRows()}</tbody>
          </table>
        </section>
      </div>

      <div class="builder-actions">
        <button class="run-btn" data-act="run">▶ Run analysis</button>
        <button class="mini-btn" data-act="reset">Reset to template</button>
      </div>
      <p class="builder-error" id="builder-error"></p>
    `;
  }

  // ---------- validation + spec ----------

  function getSpec() {
    syncStateFromDOM();
    const nn = state.nodes.length;
    if (nn < 2) throw new Error("Need at least 2 nodes.");
    if (state.elements.length < 1) throw new Error("Need at least 1 element.");

    for (let k = 0; k < state.elements.length; k++) {
      const e = state.elements[k];
      if (e.i < 1 || e.i > nn || e.j < 1 || e.j > nn)
        throw new Error(`Element ${k + 1} references a node outside 1..${nn}.`);
      if (e.i === e.j)
        throw new Error(`Element ${k + 1} has the same start and end node.`);
      const a = state.nodes[e.i - 1], b = state.nodes[e.j - 1];
      if (Math.hypot(b.x - a.x, b.y - a.y) === 0)
        throw new Error(`Element ${k + 1} has zero length.`);
      if (e.A <= 0 || e.Iz <= 0 || e.E <= 0)
        throw new Error(`Element ${k + 1} needs positive E, A, and Iz.`);
    }

    return {
      name: "Custom model",
      description: `Custom model — ${nn} nodes, ${state.elements.length} elements.`,
      units: UNITS,
      nodes: state.nodes.map((n) => [n.x, n.y]),
      elements: state.elements.map((e) => ({ ...e })),
      supports: state.nodes.map((_, k) => state.supports[k + 1] || [0, 0, 0]),
      loads: state.nodes.map((_, k) => state.loads[k + 1] || [0, 0, 0]),
    };
  }

  function run() {
    const errEl = rootEl.querySelector("#builder-error");
    if (errEl) errEl.textContent = "";
    let model;
    try {
      model = buildModel(getSpec());
    } catch (e) {
      if (errEl) errEl.textContent = e.message;
      else if (onError) onError(e.message);
      return;
    }
    onRun(model);   // app.js handles runAnalysis + rendering (and solver errors)
  }

  // ---------- events ----------

  function handleClick(ev) {
    const btn = ev.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === "run") { run(); return; }
    if (act === "reset") { state = defaultState(); render(); run(); return; }

    syncStateFromDOM();   // preserve in-progress edits before structural change
    if (act === "add-node") {
      state.nodes.push({ x: 0, y: 0 });
    } else if (act === "del-node") {
      const k = Number(btn.dataset.k);
      state.nodes.splice(k, 1);
      // drop elements that referenced the removed node; reindex the rest
      const removed = k + 1;
      state.elements = state.elements.filter((e) => e.i !== removed && e.j !== removed);
      for (const e of state.elements) {
        if (e.i > removed) e.i--;
        if (e.j > removed) e.j--;
      }
      remapNodeKeys(state.supports, removed);
      remapNodeKeys(state.loads, removed);
    } else if (act === "add-elem") {
      const nn = state.nodes.length;
      state.elements.push({ i: 1, j: Math.min(2, nn), E: DEFAULT_E, A: 20, Iz: 723 });
    } else if (act === "del-elem") {
      state.elements.splice(Number(btn.dataset.k), 1);
    } else {
      return;
    }
    render();
  }

  // Shift node-keyed maps down after node `removed` was deleted.
  function remapNodeKeys(map, removed) {
    const out = {};
    for (const key of Object.keys(map)) {
      const n = Number(key);
      if (n === removed) continue;
      out[n > removed ? n - 1 : n] = map[key];
    }
    Object.keys(map).forEach((k) => delete map[k]);
    Object.assign(map, out);
  }

  // ---------- public API ----------

  function init(opts) {
    rootEl = document.getElementById("builder");
    onRun = opts.onRun;
    onError = opts.onError;
    state = defaultState();
    rootEl.addEventListener("click", handleClick);
  }

  function show() { rootEl.classList.remove("hidden"); if (!rootEl.innerHTML.trim()) render(); }
  function hide() { rootEl.classList.add("hidden"); }
  function ensureRendered() { if (!rootEl.innerHTML.trim()) render(); }

  return { init, show, hide, run, ensureRendered };
})();
