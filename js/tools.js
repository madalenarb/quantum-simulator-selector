/*
 * Side tools of the selector: a memory calculator, a side-by-side comparison of two
 * execution configurations from the measurements of Chapter 5, and the list of what lies
 * outside those measurements. Reads window.Selector and window.SelectorData.
 */
(function () {
  "use strict";

  var S = window.Selector, D = window.SelectorData;
  var N = "<i>n</i>";

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function field(labelText, control, id) {
    var w = el("div", "tfield");
    var l = el("label", "tlabel", labelText);
    l.setAttribute("for", id);
    control.id = id;
    w.appendChild(l);
    w.appendChild(control);
    return w;
  }
  function select(options, value) {
    var s = el("select", "tselect");
    options.forEach(function (o) {
      var op = el("option", "", o.t);
      op.value = o.v;
      if (o.v === value) op.selected = true;
      s.appendChild(op);
    });
    return s;
  }
  function numberInput(value, min, max) {
    var i = el("input", "tnum");
    i.type = "number"; i.min = String(min); i.max = String(max); i.step = "1"; i.value = String(value);
    i.setAttribute("inputmode", "numeric");
    return i;
  }
  function readInt(input, min, max, fallback) {
    var v = parseInt(input.value, 10);
    if (!isFinite(v)) return fallback;
    return Math.max(min, Math.min(max, v));
  }
  function gib(bytesLog2) { return Math.pow(2, bytesLog2 - 30); }

  /* ---------- memory calculator ---------- */
  var DEVICES = [
    { v: "a100-40", t: "NVIDIA A100-40 (40 GB)", gib: 40, kind: "GPU" },
    { v: "a100-80", t: "NVIDIA A100-80 (80 GB)", gib: 80, kind: "GPU" },
    { v: "x86", t: "Deucalion x86 node, 242 GiB per job", gib: 242, kind: "node" },
    { v: "i9", t: "i9-13900KS workstation, 125 GiB usable", gib: 125, kind: "machine" },
    { v: "custom", t: "Other, memory per device in GiB", gib: null, kind: "device" }
  ];
  function memoryTool(opts) {
    opts = opts || {};
    var box = el("div", "tool-body");
    box.appendChild(el("p", "tool-lede", "Memory that a state needs on each device, and the largest size each setup holds. The capacities are those of Section 5.8 and Table 4.2."));
    var grid = el("div", "tgrid");
    var nIn = numberInput(opts.n || 30, 1, 80);
    var rep = select([{ v: "sv", t: "State vector, 2ⁿ amplitudes" }, { v: "dm", t: "Density matrix, 4ⁿ elements" }], opts.dm ? "dm" : "sv");
    var prec = select([{ v: "64", t: "Double precision, 16 bytes per amplitude (measured)" }, { v: "32", t: "Single precision, 8 bytes (outside the measurements)" }], "64");
    var dev = select(DEVICES, opts.device || "a100-80");
    var custom = numberInput(64, 1, 1048576);
    var count = select([1, 2, 4, 8, 16, 32, 64].map(function (k) { return { v: String(k), t: String(k) }; }), String(opts.devices || 1));
    var quest = el("input");
    quest.type = "checkbox";
    grid.appendChild(field("Qubits", nIn, "mem-n"));
    grid.appendChild(field("Representation", rep, "mem-rep"));
    grid.appendChild(field("Precision", prec, "mem-prec"));
    grid.appendChild(field("Device", dev, "mem-dev"));
    var customField = field("GiB per device", custom, "mem-custom");
    grid.appendChild(customField);
    grid.appendChild(field("Devices holding the state", count, "mem-count"));
    var qwrap = el("label", "tcheck");
    qwrap.appendChild(quest);
    qwrap.appendChild(document.createTextNode(" QuEST distributed run, whose exchange buffer doubles the memory each device needs"));
    grid.appendChild(qwrap);
    box.appendChild(grid);
    var out = el("div", "tool-out");
    out.setAttribute("aria-live", "polite");
    box.appendChild(out);

    function update() {
      var n = readInt(nIn, 1, 80, 30);
      var isDM = rep.value === "dm";
      var bpa = prec.value === "64" ? 4 : 3;
      var d = DEVICES.filter(function (x) { return x.v === dev.value; })[0];
      customField.hidden = d.v !== "custom";
      var cap = d.gib != null ? d.gib : Math.max(1, readInt(custom, 1, 1048576, 64));
      var k = parseInt(count.value, 10);
      var buffer = quest.checked && k > 1 && !isDM;
      var total = (isDM ? 2 * n : n) + bpa;
      var share = total - Math.log2(k) + (buffer ? 1 : 0);
      var fits = gib(share) <= cap;
      var maxN = 0;
      for (var m = 1; m <= 80; m++) {
        var t = (isDM ? 2 * m : m) + bpa - Math.log2(k) + (buffer ? 1 : 0);
        if (gib(t) <= cap) maxN = m;
      }
      var unit = d.kind === "GPU" ? (k > 1 ? "GPUs" : "GPU") : d.kind === "node" ? (k > 1 ? "nodes" : "node") : (k > 1 ? "devices" : "device");
      out.innerHTML = "";
      var dl = el("dl", "tdl");
      function row(a, b, cls) { dl.appendChild(el("dt", "", a)); dl.appendChild(el("dd", cls || "", b)); }
      row(isDM ? "Density matrix" : "State vector", S.bytesLog2(total));
      row("Per " + (d.kind === "GPU" ? "GPU" : d.kind === "node" ? "node" : "device"), S.bytesLog2(share) + (buffer ? " including the exchange buffer" : "") + " of " + cap + " GiB", fits ? "ok" : "bad");
      row("Fits", fits ? "Yes, on " + k + " " + unit : "No, " + (k < 64 ? "more devices or more memory per device are needed" : "beyond 64 devices of this kind"), fits ? "ok" : "bad");
      row("Largest size here", maxN ? N + " = " + maxN + " on " + k + " " + unit : "none");
      out.appendChild(dl);
      var notes = [];
      if (k > 1 && !isDM) notes.push("Distributed state vectors split in powers of two, one share per MPI rank.");
      if (isDM && k > 1) notes.push("The density-matrix runs of the dissertation used one machine.");
      if (prec.value === "32") notes.push("Single precision halves the memory, so each device holds one more qubit, but every comparison in the dissertation is in double precision (Section 4.3.1).");
      if (buffer) notes.push("QuEST keeps an exchange buffer as large as its share on every device, so distributed it holds at most 31 qubits per A100-80 (Section 4.3.2).");
      var measured = measuredNote(d.v, k, isDM);
      if (measured) notes.push(measured);
      if (notes.length) {
        var ul = el("ul", "tnotes");
        notes.forEach(function (x) { ul.appendChild(el("li", "", x)); });
        out.appendChild(ul);
      }
    }
    [nIn, rep, prec, dev, custom, count, quest].forEach(function (c) {
      c.addEventListener("input", update);
      c.addEventListener("change", update);
    });
    update();
    return box;
  }
  function measuredNote(dev, k, isDM) {
    if (isDM) return dev === "i9" && k === 1 ? "Measured in the dissertation up to " + N + " = 13 on this machine (Figure 5.9)." : null;
    if (dev === "a100-40" && k === 1) return "Measured up to " + N + " = 31 on one A100-40 (Figure 5.1).";
    if (dev === "a100-80") {
      var top = { 1: 32, 2: 33, 4: 34, 8: 35, 16: 35 }[k];
      return top ? "Measured up to " + N + " = " + top + " on " + k + " A100-80 (Figures 5.6 and 5.7)." : null;
    }
    if (dev === "x86") return k === 1 ? "Measured up to " + N + " = 30 on one node (Figure 5.1)." : "Measured up to " + N + " = " + (28 + Math.log2(k)) + " on " + k + " nodes (Figure 5.4).";
    return null;
  }

  /* ---------- comparison of two configurations ---------- */
  var CONFIGS = [
    { v: "thread", t: "One x86 thread", cap: 33 },
    { v: "node", t: "One x86 node, 128 threads", cap: 33 },
    { v: "gpu1h", t: "One A100-40, state copied to host where the backend does so", cap: 31 },
    { v: "g1", t: "One A100-80, state kept on the GPU", cap: 32, gpus: 1 },
    { v: "g2", t: "Two A100-80 of one node", cap: 33, gpus: 2 },
    { v: "g4", t: "Four A100-80, one node", cap: 34, gpus: 4 },
    { v: "g8", t: "Eight A100-80, two nodes", cap: 35, gpus: 8 },
    { v: "g16", t: "Sixteen A100-80, four nodes", cap: 36, gpus: 16 },
    { v: "x16", t: "16 x86 nodes", cap: 37, nodes: 16 },
    { v: "x64", t: "64 x86 nodes", cap: 39, nodes: 64 }
  ];
  function cfgOf(v) { return CONFIGS.filter(function (c) { return c.v === v; })[0]; }
  // Measured times for one configuration: { n, rows: [{ b, t, note }], source } or { none: reason }.
  function measure(cfgV, c, n) {
    var cfg = cfgOf(cfgV);
    if (n > cfg.cap) return { none: "Does not hold " + N + " = " + n + "; this configuration holds up to " + N + " = " + cfg.cap + " in double precision." };
    if (cfgV === "thread" || cfgV === "node" || cfgV === "gpu1h") {
      var reg = cfgV === "gpu1h" ? "gpu" : cfgV;
      var sizes = sizesOf(D.sweep[reg][c]);
      var m = nearest(sizes, Math.max(n, S.SWEEP_MIN));
      var rows = S.sweepRank(reg, c, m).map(function (e) {
        return { b: e.b, t: e.t, note: e.note && S.excluded(reg, e.note) ? "not a full-node time" : null };
      });
      return { n: m, rows: rows, source: "Figure 5.1" + S.PANEL[reg][c] };
    }
    if (cfg.gpus) {
      if (c === "qft") {
        var out = [], sizesQ = {};
        ["CUDA-Q", "Qiskit Aer", "QuEST"].forEach(function (b) { Object.keys(D.multigpu[b]).forEach(function (k) { if (D.multigpu[b][k][cfg.gpus]) sizesQ[k] = 1; }); });
        var mq = nearest(Object.keys(sizesQ).map(Number), n);
        if (mq == null) return { none: "No multi-GPU measurement on " + cfg.gpus + " GPUs." };
        ["CUDA-Q", "Qiskit Aer", "QuEST"].forEach(function (b) {
          var t = D.multigpu[b][String(mq)] && D.multigpu[b][String(mq)][cfg.gpus];
          if (t != null) out.push({ b: b, t: t });
        });
        out.sort(function (x, y) { return x.t - y.t; });
        return { n: mq, rows: out, source: "Figures 5.6 and 5.7" };
      }
      if (c === "hea" && cfg.gpus <= 4) {
        var h = D.gpunode.hea[String(cfg.gpus)];
        var mh = nearest(Object.keys(h).map(Number), n);
        return { n: mh, rows: [{ b: "CUDA-Q", t: h[String(mh)] }], source: "Table 5.5", note: "Only CUDA-Q ran the HEA on several GPUs." };
      }
      return { none: "The multi-GPU measurements cover the QFT" + (cfg.gpus <= 4 ? " and, for CUDA-Q, the HEA" : "") + "." };
    }
    if (cfg.nodes) {
      if (c !== "qft") return { none: "The multi-node measurements cover the QFT." };
      var weakN = D.weak.n0 + Math.log2(cfg.nodes);
      var useWeak = n !== 30 && Math.abs(n - weakN) < Math.abs(n - 30);
      var series = useWeak ? D.weak.series : D.strong.series;
      var rowsN = [];
      Object.keys(series).forEach(function (b) {
        var t = series[b][String(cfg.nodes)];
        if (t != null) rowsN.push({ b: b, t: t });
      });
      rowsN.sort(function (x, y) { return x.t - y.t; });
      return { n: useWeak ? weakN : 30, rows: rowsN, source: useWeak ? "Figure 5.4" : "Table 5.3" };
    }
    return { none: "" };
  }
  function sizesOf(series) {
    var s = {};
    Object.keys(series).forEach(function (b) { series[b].forEach(function (p) { s[p[0]] = 1; }); });
    return Object.keys(s).map(Number).sort(function (a, b) { return a - b; });
  }
  function nearest(list, n) {
    if (!list.length) return null;
    var best = list[0];
    list.forEach(function (x) { if (Math.abs(x - n) < Math.abs(best - n) || (Math.abs(x - n) === Math.abs(best - n) && x > best)) best = x; });
    return best;
  }
  function compareTool(opts) {
    opts = opts || {};
    var box = el("div", "tool-body");
    box.appendChild(el("p", "tool-lede", "Measured times of two execution configurations for the same circuit and size, from the series of Chapter 5. Sizes without a measurement fall back to the nearest measured size."));
    var grid = el("div", "tgrid");
    var circ = select([{ v: "qft", t: "QFT" }, { v: "hea", t: "HEA" }, { v: "clifford", t: "Clifford circuit" }], opts.c || "qft");
    var nIn = numberInput(opts.n || 30, 2, 39);
    var cfgOpts = CONFIGS.map(function (c) { return { v: c.v, t: c.t }; });
    var a = select(cfgOpts, opts.a || "node");
    var b = select(cfgOpts, opts.b || "g4");
    grid.appendChild(field("Circuit", circ, "cmp-c"));
    grid.appendChild(field("Qubits", nIn, "cmp-n"));
    grid.appendChild(field("Configuration A", a, "cmp-a"));
    grid.appendChild(field("Configuration B", b, "cmp-b"));
    box.appendChild(grid);
    var out = el("div", "cmp-out");
    out.setAttribute("aria-live", "polite");
    box.appendChild(out);
    function card(label, cfgV, res) {
      var cd = el("div", "cmp-card");
      cd.appendChild(el("p", "cmp-k", label));
      cd.appendChild(el("p", "cmp-name", cfgOf(cfgV).t));
      if (res.none !== undefined) { cd.appendChild(el("p", "cmp-none", res.none || "No measurement.")); return cd; }
      if (!res.rows.length) { cd.appendChild(el("p", "cmp-none", "No measurement at this size.")); return cd; }
      var top = res.rows[0];
      var best = el("p", "cmp-best");
      var sw = el("span", "dot");
      sw.style.background = S.COLOURS[top.b] || "#86d4f0";
      best.appendChild(sw);
      best.appendChild(el("span", "", "<b>" + top.b + "</b> · " + S.fmtT(top.t)));
      cd.appendChild(best);
      var ol = el("ol", "cmp-list");
      res.rows.forEach(function (r) {
        ol.appendChild(el("li", r.note ? "flagged" : "", r.b + " <span>" + S.fmtT(r.t) + (r.t > top.t * 1.005 ? " · " + (r.t / top.t).toFixed(2) + "×" : "") + (r.note ? " · " + r.note : "") + "</span>"));
      });
      cd.appendChild(ol);
      cd.appendChild(el("p", "cmp-src", N + " = " + res.n + " · " + res.source + (res.note ? " · " + res.note : "")));
      return cd;
    }
    function update() {
      var c = circ.value, n = readInt(nIn, 2, 39, 30);
      var ra = measure(a.value, c, n), rb = measure(b.value, c, n);
      out.innerHTML = "";
      var pair = el("div", "cmp-pair");
      pair.appendChild(card("A", a.value, ra));
      pair.appendChild(card("B", b.value, rb));
      out.appendChild(pair);
      var line = el("p", "cmp-line");
      if (ra.rows && rb.rows && ra.rows.length && rb.rows.length) {
        var ta = ra.rows[0].t, tb = rb.rows[0].t;
        if (ra.n === rb.n) {
          var fast = ta <= tb ? "A" : "B", r = Math.max(ta, tb) / Math.min(ta, tb);
          line.innerHTML = r < 1.05 ? "At " + N + " = " + ra.n + " the fastest backends of A and B finish within 5 % of each other." :
            "At " + N + " = " + ra.n + ", configuration " + fast + " is " + (r >= 10 ? Math.round(r) : r.toFixed(1)) + " times faster with its fastest backend.";
        } else {
          line.innerHTML = "The nearest measured sizes differ (" + N + " = " + ra.n + " and " + N + " = " + rb.n + "), so the two times are not compared.";
        }
        if (ra.n !== n || rb.n !== n) line.innerHTML += " Your size, " + N + " = " + n + ", has no measurement in " + (ra.n !== n && rb.n !== n ? "either configuration" : ra.n !== n ? "A" : "B") + ".";
      }
      out.appendChild(line);
    }
    [circ, nIn, a, b].forEach(function (x) { x.addEventListener("input", update); x.addEventListener("change", update); });
    update();
    return box;
  }

  /* ---------- outside the measurements ---------- */
  function outside(A, res) {
    var outs = [];
    (res && res.blocks || []).forEach(function (b) { b.outcomes.forEach(function (o) { outs.push(o.rec); }); });
    var regimes = outs.map(function (r) { return String(r.regime); }).join(" | ");
    var names = outs.map(function (r) { return r.b; });
    var unsure = (res && res.blocks || []).some(function (b) { return b.unsure && b.unsure.length; });
    var classes = (res && res.blocks || []).map(function (b) { return b.cls; });
    var distributed = /A100-80|x86 nodes/.test(regimes);
    var gpu = /A100/.test(regimes);
    var big = A && A.n != null && (A.n >= 35 || /32 to 64|64 x86/.test(regimes));
    return [
      { t: "Single precision", on: A && A.noise !== "yes" && outs.some(function (r) { return r.kind === "sv"; }),
        d: "Every comparison here is in double precision. Single precision halves the memory, so each device holds one more qubit, and halves the bytes moved in each pass, but its rounding error lowers the fidelity measurably beyond about 20 qubits and 50 gates (Section 4.3.1)." },
      { t: "Other processors, GPUs and interconnects", on: true,
        d: "The rankings come from AMD EPYC 7742 nodes and A100 GPUs on Deucalion and from an i9-13900KS workstation; on other hardware the crossover sizes may lie elsewhere, and other studies find that the ranking also varies with the workload (Section 5.8)." },
      { t: "More than sixteen GPUs or 64 nodes", on: !!big,
        d: "The GPU series end at sixteen A100-80 and the CPU series at 64 x86 nodes. Beyond them, the scaling steps of Tables 5.3 and 5.7 are the only guide." },
      { t: "Tuned transport between nodes", on: /across|A100-80 over/.test(regimes) || (A && A.n >= 35 && gpu),
        d: "Across nodes each GPU swapped about 0.9 GB/s under the default UCX settings of Deucalion, two orders of magnitude below NVLink, so a tuned transport could change the order across nodes (Section 5.4.2)." },
      { t: "Noise on GPUs and trajectory sampling", on: A && A.noise === "yes",
        d: "The noise study used density matrices on a CPU workstation, depolarising noise of p = 0.01 and the QFT. GPU noise simulation and trajectory sampling, which keeps the memory of a state vector, are proposed as future work (Section 6.3)." },
      { t: "Circuits outside the benchmark set", on: unsure,
        d: "The timed circuits are the QFT, the HEA, the Clifford circuit and, for tensor networks, GHZ. Other circuits are placed by structure, and their ranking may differ." },
      { t: "Distributed series of one circuit", on: distributed && classes.some(function (c) { return c && c !== "dense"; }),
        d: "The multi-node CPU series and the comparison of all three multi-GPU backends use the QFT; on several GPUs, CUDA-Q alone also ran the HEA (Table 5.5)." },
      { t: "Other builds and settings", on: names.some(function (b) { return b === "QuEST" || b === "Qulacs" || b === "Qiskit Aer"; }),
        d: "QuEST ran its own GPU kernels without cuQuantum, Qiskit Aer its own CUDA kernels with cuStateVec disabled, and the single-node Qulacs runs applied each gate without its optimiser (Section 4.3.1); other builds can rank differently." }
    ];
  }

  window.Tools = { memoryTool: memoryTool, compareTool: compareTool, outside: outside, CONFIGS: CONFIGS, measure: measure };
})();
