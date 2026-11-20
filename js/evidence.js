/*
 * Evidence behind each outcome: the measurements of Chapter 5 as a small chart, every
 * backend measured at the size asked, ranked with one observation each, and the
 * references into the dissertation. Values come from js/data.js; estimates beyond the
 * measured range are computed here and always marked as such.
 *
 * Evidence.model(rec, ctx) builds a plain description (testable without a browser);
 * Evidence.render(model) turns it into DOM, and Evidence.chartSVG(chart, width) draws the chart.
 */
(function () {
  "use strict";

  var S = window.Selector;
  var D = window.SelectorData;
  var N = "<i>n</i>";

  /* ---------- observations, one per backend and regime (Chapter 5) ---------- */
  var OBS = {
    // single-node sweeps, Figure 5.1
    "sweep|thread|Qulacs": "Hand-written AVX2 kernels, one gate per pass. When the state outgrows the 16 MiB L3 of one core at " + N + " = 21, its time per gate rises three- to fourfold.",
    "sweep|thread|qft|Qiskit Aer": "Fuses the 1378 QFT gates into about 106 blocks at " + N + " = 26, which puts it ahead of Qulacs from " + N + " = 21 to 28.",
    "sweep|thread|hea|Qiskit Aer": "Fusion leaves about 105 blocks of 858 gates at " + N + " = 26, but each takes as long as about twelve Qulacs gates, so it stays about 1.5 times slower.",
    "sweep|thread|clifford|Qiskit Aer": "About three times slower than Qulacs on this circuit.",
    "sweep|thread|qft|QuEST": "Low fixed costs, 3 to 12 µs per gate at " + N + " = 9. From " + N + " = 21 it takes two to three times as long per gate as Qulacs.",
    "sweep|thread|hea|QuEST": "Compiler-vectorised kernels. From " + N + " = 21 it takes two to three times as long per gate as Qulacs.",
    "sweep|thread|clifford|QuEST": "Leads Qulacs from " + N + " = 13 to 28, 1.4 to 1.9 times faster from " + N + " = 16.",
    "sweep|thread|qibojit": "Kernels compiled just in time with Numba. From " + N + " = 21 it takes two to three times as long per gate as Qulacs.",
    "sweep|thread|Qibo NumPy": "Generic NumPy operations that can copy the state, six to thirteen times slower than qibojit from " + N + " = 17.",
    "sweep|thread|CUDA-Q": "The CPU fallback (qpp-cpu) of a GPU framework, two to three orders of magnitude slower than Qulacs from " + N + " = 12.",
    "sweep|node|qft|Qiskit Aer": "Leads from " + N + " = 18. Fusion cuts the operation count thirteenfold at " + N + " = 26, and at " + N + " = 30 it runs about 60 times faster than on one thread.",
    "sweep|node|hea|Qiskit Aer": "Leads from " + N + " = 22 and runs about 65 times faster than on one thread at " + N + " = 30.",
    "sweep|node|clifford|Qiskit Aer": "Leads from " + N + " = 26 and runs almost 100 times faster than on one thread at " + N + " = 30.",
    "sweep|node|Qulacs": "Second on the QFT and the HEA at the largest sizes. On the 30-qubit QFT it stops gaining at 16 threads, consistent with a memory-bandwidth limit (Section 5.2).",
    "sweep|node|clifford|Qulacs": "Behind QuEST at " + N + " = 28, the largest size both reached. Up to " + N + " = 13 it runs up to thirty-five times slower than on one thread, as the overhead of dividing these small state updates among threads outweighs the work saved.",
    "sweep|node|qft|QuEST": "Applies one unfused gate per pass over the state.",
    "sweep|node|hea|QuEST": "Its speedup over one thread reaches at most about 13 at " + N + " = 28.",
    "sweep|node|clifford|QuEST": "Fastest on this circuit up to " + N + " = 25 and second at " + N + " = 28, where its speedup over one thread reaches at most about 13.",
    "sweep|node|qibojit": "The slowest of the four backends at the largest sizes.",
    "sweep|gpu|Qulacs": "Lowest fixed costs, 13 to 20 µs per gate between " + N + " = 12 and 18, and leads every circuit up to " + N + " = 23. Its timed call excludes any copy to host memory.",
    "sweep|gpu|QuEST": "Second fastest up to " + N + " = 16, at 22 to 30 µs per gate. Between " + N + " = 16 and 17 its time rises six- to sevenfold, a step consistent with the temporary device array that it allocates before each non-diagonal gate, once the state reaches 2 MiB. Its timed call excludes the copy to host memory.",
    "sweep|gpu|qft|Qiskit Aer": "Leads the QFT from " + N + " = 24 to 30 although its time includes the copy to host memory, consistent with its fusion of controlled rotations into diagonal operations.",
    "sweep|gpu|hea|Qiskit Aer": "Processes the whole circuit in one call with fusion; its time includes the copy to host memory.",
    "sweep|gpu|clifford|Qiskit Aer": "The slowest of the five on this circuit at every size up to " + N + " = 30, although from " + N + " = 27 QuEST takes almost as long. Its time includes the copy to host memory.",
    "sweep|gpu|qft|CUDA-Q": "One call per circuit with fusion and just-in-time compilation, 1.1 to 1.7 times behind Qiskit Aer from " + N + " = 24 to 30. Its time includes the copy to host memory.",
    "sweep|gpu|CUDA-Q": "One call per circuit with fusion and just-in-time compilation, the fastest on this circuit from " + N + " = 25. Its time includes the copy to host memory.",
    "sweep|gpu|qibojit": "GPU kernels through CuPy at 0.1 to 0.4 ms per gate between " + N + " = 12 and 18. Its timed call excludes the copy to host memory.",
    // multi-node CPU, Table 5.3 and Figure 5.4
    "strong|Qiskit Aer": "128 ranks per node, one per core. The fastest from one to 16 nodes, 3.7 to 6.3 times ahead of mpiQulacs.",
    "strong|mpiQulacs": "One rank per node with 128 threads. Scales furthest, 53 times faster on 64 nodes than on one.",
    "strong|QuEST": "One rank per node with 128 threads, 21 times faster on 64 nodes than on one.",
    "strong|Qiskit Aer, one rank per node": "Its distributed engine keeps one core per node busy, about an order of magnitude behind mpiQulacs.",
    "weak|mpiQulacs": "From one to 64 nodes its time rises to about 2.5 times the one-node value while the state grows 64 times.",
    "weak|QuEST": "The same 2.5-fold rise, with a dip from four to eight nodes that exceeds the spread between its repetitions.",
    "weak|Qiskit Aer": "128 ranks per node. The fastest at every step it covers, up to 16 nodes and " + N + " = 32, with a lead that narrows as nodes are added.",
    "weak|Qiskit Aer, one rank per node": "One busy core per node.",
    // multi-GPU, Figures 5.6 and 5.7
    "mgpu|CUDA-Q": "Updates the state through cuStateVec and leads Qiskit Aer by 3.6 to 4.2 times on four GPUs from " + N + " = 32 to 34. Crossing to a second node slows it about eight times at each of those sizes.",
    "mgpu|Qiskit Aer": "Exchanges through the CUDA IPC transport of UCX inside a node. From eight to sixteen GPUs it approximately halves its runtime, and it leads on sixteen.",
    "mgpu|QuEST": "Gains the most within a node but stays the slowest at every GPU count, and holds at most 31 qubits of the state per GPU in distributed runs.",
    "gpunode|CUDA-Q": "Dividing the state shortens the run more as the state grows; four GPUs cut the HEA time at " + N + " = 32 by over two-thirds (Table 5.5).",
    // density matrix, Figure 5.9
    "dm|Qiskit Aer": "Stays closest to the fourfold growth per qubit and is about twenty-five times faster than the other two at " + N + " = 13.",
    "dm|Qibo NumPy": "Starts twenty to fifty times faster, but its runtime grows with the matrix from " + N + " = 3 and more steeply than fourfold per qubit. It applies the same noise channel to the same gates as Qiskit Aer.",
    "dm|Qulacs": "Its parameter is the probability of a Pauli error, a channel stronger by a factor of 4/3 on a single qubit at the same p, and on each CNOT it is applied only to the target, so its fidelity sits just slightly below the other two.",
    // stabiliser, Figure 5.11
    "stab|Qiskit Aer Stabilizer": "Stays below 0.1 s through " + N + " = 60 on one x86 thread and returns samples.",
    "stab|Qibo Clifford": "Stays below 0.1 s through " + N + " = 60 and builds the tableau without sampling.",
    "stab|CUDA-Q Stim": "Exceeds 0.1 s from " + N + " = 51, since it pays the dispatch and just-in-time compilation of the framework in every repetition.",
    "stab|State vector": "Doubles with every qubit; a 60-qubit state would need 16 EiB.",
    // tensor network, Figure 5.12
    "tn|CUDA-Q · GHZ": "Schmidt rank two across any cut. Completed runs at every tested size up to " + N + " = 500, where the runtime reaches about an hour.",
    "tn|CUDA-Q · HEA, one layer": "A single ring keeps the Schmidt rank at most four across each cut of the qubit chain. Completed runs at every tested size up to " + N + " = 500.",
    "tn|CUDA-Q · HEA, twenty layers": "Additional layers can increase the bond dimensions needed, and " + N + " = 36 is the largest size with a completed repetition.",
    "tn|CUDA-Q · QFT": "Slower than the faster state-vector reference at every measured size; completed up to " + N + " = 24, and every repetition at " + N + " = 26 exceeded the time limit.",
    "tn|Qibo · HEA, one layer": "Returns the full state, faster than CUDA-Q at all shared sizes, with its last completed runs at " + N + " = 28.",
    "tn|Qibo · QFT": "Returns the full state; its last completed runs are at " + N + " = 28, and at " + N + " = 30 the intermediate tensors exceed GPU memory.",
    "tn|Qulacs state vector · QFT": "State-vector reference on one A100-40 (Section 5.1).",
    "tn|Qiskit Aer state vector · QFT": "State-vector reference on one A100-40, with the copy to host memory (Section 5.1)."
  };
  function obs(type, reg, c, b) {
    return OBS[type + "|" + reg + "|" + c + "|" + b] || OBS[type + "|" + reg + "|" + b] || OBS[type + "|" + b] || "";
  }

  /* ---------- series helpers ---------- */
  function sorted(points) { return points.slice().sort(function (a, b) { return a[0] - b[0]; }); }
  function objToPoints(o) {
    return sorted(Object.keys(o || {}).map(function (k) { return [Number(k), o[k]]; }));
  }
  // Value of a measured series at x: measured, interpolated in a short gap, estimated beyond its end, or none.
  function valueAt(points, x, opts) {
    opts = opts || {};
    var p = sorted(points);
    if (!p.length) return { kind: "none", note: "" };
    for (var i = 0; i < p.length; i++) if (p[i][0] === x) return { t: p[i][1], kind: "measured" };
    var first = p[0], last = p[p.length - 1];
    if (x < first[0]) return { kind: "none", note: "series starts at " + opts.xName + " = " + first[0] };
    if (x > last[0]) {
      if (opts.estimate && p.length >= 2 && (opts.cap == null || x <= opts.cap)) {
        var prev = p[p.length - 2];
        var per = Math.pow(last[1] / prev[1], 1 / (last[0] - prev[0]));
        var ratio = Math.max(opts.minRatio || 2, per);
        return { t: last[1] * Math.pow(ratio, x - last[0]), kind: "estimate", from: last, ratio: ratio };
      }
      return { kind: "none", note: opts.endNote || ("series ends at " + opts.xName + " = " + last[0]) };
    }
    for (var j = 1; j < p.length; j++) {
      if (p[j][0] > x) {
        var a = p[j - 1], b = p[j];
        if (opts.maxGap != null && b[0] - a[0] > opts.maxGap) return { kind: "none", note: "no point at this size" };
        var f = (x - a[0]) / (b[0] - a[0]);
        return { t: a[1] * Math.pow(b[1] / a[1], f), kind: "interp", from: a, to: b };
      }
    }
    return { kind: "none", note: "" };
  }

  var DASHES = ["", "6 4", "2 4", "9 4 2 4", "1 3"];
  // Colour, marker and line of each series, as in the figures of Chapter 5. The
  // tensor-network series follow the legend of Figure 5.12.
  var TN_STYLE = {
    "CUDA-Q · GHZ": { colour: "#009988", marker: "tri", label: "CUDA-Q TN, GHZ" },
    "CUDA-Q · HEA, one layer": { colour: "#0077BB", marker: "tri", label: "CUDA-Q TN, HEA L = 1" },
    "CUDA-Q · HEA, twenty layers": { colour: "#AA3377", marker: "tri", label: "CUDA-Q TN, HEA L = 20" },
    "CUDA-Q · QFT": { colour: "#DDAA33", marker: "tri", label: "CUDA-Q TN, QFT" },
    "Qibo · HEA, one layer": { colour: "#33BBEE", marker: "plus", label: "Qibo cuTN, HEA L = 1" },
    "Qibo · QFT": { colour: "#555555", marker: "plus", label: "Qibo cuTN, QFT" },
    "Qulacs state vector · QFT": { colour: "#EE7733", marker: "diamond", dash: DASHES[1], label: "Qulacs SV, QFT" },
    "Qiskit Aer state vector · QFT": { colour: "#CC3311", marker: "circle", dash: DASHES[2], label: "Qiskit Aer SV, QFT" }
  };
  var MARKERS = { "Qulacs": "diamond", "mpiQulacs": "diamond", "Qiskit Aer": "circle", "QuEST": "square", "CUDA-Q": "tri", "Qibo": "plus", "Qibo NumPy": "plus", "qibojit": "cross" };
  function baseName(name) { return name.split(" · ")[0].split(",")[0]; }
  function styleOf(name) {
    if (TN_STYLE[name]) return TN_STYLE[name];
    var base = baseName(name);
    return {
      colour: S.COLOURS[name] || S.COLOURS[base] || "#595959",
      marker: MARKERS[name] || MARKERS[base] || "circle",
      label: name.replace(/ · /g, ", ")
    };
  }
  function colourOf(name) { return styleOf(name).colour; }
  function labelOf(name) { return styleOf(name).label; }
  // One plotted series; opts: emph, dash, label.
  function serie(name, points, opts) {
    var st = styleOf(name), o = opts || {};
    return { name: o.label || st.label, colour: st.colour, marker: st.marker, dash: o.dash !== undefined ? o.dash : (st.dash || ""), points: points, emph: !!o.emph };
  }

  /* ---------- models per evidence type ---------- */
  function rowsFrom(entries, pick) {
    var best = null;
    entries.forEach(function (e) { if (e.t != null && (best === null || e.t < best)) best = e.t; });
    entries.sort(function (x, y) {
      if (x.t == null && y.t == null) return 0;
      if (x.t == null) return 1;
      if (y.t == null) return -1;
      return x.t - y.t;
    });
    var rank = 0;
    entries.forEach(function (e) {
      if (e.t != null) { rank++; e.rank = rank; e.ratio = e.t / best; }
      e.pick = e.b === pick || e.pickMatch === true;
    });
    return entries;
  }

  function sweepModel(rec, ctx) {
    var k = rec.evk, reg = k.reg, c = k.c;
    var series = D.sweep[reg][c];
    var names = Object.keys(series);
    var end = 0;
    names.forEach(function (b) { var p = series[b]; end = Math.max(end, p[p.length - 1][0]); });
    var nUse = Math.max(ctx.n, S.SWEEP_MIN);
    var cap = reg === "gpu" ? 31 : 33;
    var entries = names.map(function (b) {
      var pts = series[b];
      var lastN = pts[pts.length - 1][0];
      var v = valueAt(pts, nUse, {
        xName: "n", estimate: reg !== "gpu" && lastN === end, cap: cap, minRatio: 2, maxGap: 2,
        endNote: reg === "gpu" && nUse === 31 ? "no result at this size" : null
      });
      var note = (D.notes[reg + "|" + c + "|" + b] || {})[String(nUse)] || null;
      return { b: b, t: v.t, kind: v.kind, note: note || v.note, excluded: S.excluded(reg, note), obs: obs("sweep", reg, c, b), v: v };
    });
    var foot = ["Times as plotted in Figure 5.1" + S.PANEL[reg][c] + ", the fastest repetition at each size."];
    if (reg === "gpu") foot.push("The times of Qiskit Aer and CUDA-Q include the copy of the state to host memory; those of Qulacs, qibojit and QuEST do not (Section 4.4.1).");
    if (nUse !== ctx.n) foot.push("Your size lies below the smallest size measured, so the ranking shows " + N + " = " + nUse + ".");
    if (entries.some(function (e) { return e.kind === "estimate"; })) foot.push("≈ marks an estimate beyond the sweep, which ends at " + N + " = " + end + ", assuming the time at least doubles with each added qubit.");
    if (entries.some(function (e) { return e.kind === "interp"; })) foot.push("~ marks a value interpolated between the neighbouring measured sizes.");
    return {
      title: S.CIRCUIT_NAME[c] + " " + WHERE_SHORT[reg],
      refs: ["Figure 5.1" + S.PANEL[reg][c], "Section 5.1"],
      at: N + " = " + nUse,
      rows: rowsFrom(entries, rec.b),
      foot: foot,
      chart: {
        xName: "n", xLabel: "Number of qubits", yLabel: "Simulation time (s)", xScale: "lin",
        series: names.map(function (b) { return serie(b, series[b], { emph: b === rec.b }); }),
        marker: { x: Math.min(Math.max(ctx.n, S.SWEEP_MIN), cap), label: "n = " + ctx.n },
        extensions: entries.filter(function (e) { return e.kind === "estimate"; }).map(function (e) {
          return { colour: colourOf(e.b), from: e.v.from, to: [nUse, e.t] };
        })
      }
    };
  }
  var WHERE_SHORT = { thread: "on one x86 thread", node: "on one x86 node with 128 threads", gpu: "on one A100-40" };

  function strongModel(rec, ctx) {
    var nodes = rec.evk.nodes;
    var ser = D.strong.series;
    var entries = Object.keys(ser).map(function (b) {
      var pts = objToPoints(ser[b]);
      var v = valueAt(pts, nodes, { xName: "nodes", endNote: "this layout reached 16 nodes" });
      var single = (D.strong.singleJob[b] || []).indexOf(String(nodes)) !== -1;
      return { b: b, t: v.t, kind: v.kind, note: v.kind === "none" ? v.note : single ? "measured in a single job" : null, obs: obs("strong", "", "", b) };
    });
    var foot = ["QFT at " + N + " = 30 on Deucalion x86 nodes, the fastest of all repetitions across all jobs (Table 5.3)."];
    if (ctx.n !== 30) foot.push("Strong scaling was measured at " + N + " = 30; your query has " + N + " = " + ctx.n + ".");
    return {
      title: "Strong scaling",
      refs: ["Table 5.3", "Figure 5.3", "Section 5.3"],
      at: nodes + " nodes",
      rows: rowsFrom(entries, rec.b),
      foot: foot,
      chart: {
        xName: "nodes", xLabel: "Nodes", yLabel: "Time (s)", xScale: "log2", xTicks: [1, 2, 4, 8, 16, 32, 64],
        series: Object.keys(ser).map(function (b) {
          return serie(b, objToPoints(ser[b]), { emph: b === rec.b, dash: b.indexOf("one rank") !== -1 ? DASHES[1] : "" });
        }),
        marker: { x: nodes, label: nodes + " nodes" }
      }
    };
  }

  function weakModel(rec, ctx) {
    var nodes = rec.evk.nodes;
    var ser = D.weak.series;
    var nAt = D.weak.n0 + Math.log2(nodes);
    var extra = Math.max(0, ctx.n - nAt);
    var entries = Object.keys(ser).map(function (b) {
      var pts = objToPoints(ser[b]);
      var v = valueAt(pts, nodes, { xName: "nodes", endNote: "this layout reached 16 nodes and " + N + " = 32" });
      var e = { b: b, t: v.t, kind: v.kind, note: v.kind === "none" ? v.note : null, obs: obs("weak", "", "", b) };
      if (extra > 0 && e.t != null) { e.t = e.t * Math.pow(2, extra); e.kind = "estimate"; }
      return e;
    });
    var foot = ["QFT with 28 qubits per node, from " + N + " = 28 on one node to " + N + " = 34 on 64 nodes, values read from Figure 5.4."];
    if (extra > 0) foot.push("≈ marks an estimate for " + N + " = " + ctx.n + " on the same 64 nodes, doubling the time for each added qubit, since each node then holds twice the state.");
    return {
      title: "Weak scaling",
      refs: ["Figure 5.4", "Section 5.3"],
      at: nodes + " nodes, " + N + " = " + (extra > 0 ? ctx.n : nAt),
      rows: rowsFrom(entries, rec.b),
      foot: foot,
      chart: {
        xName: "nodes", xLabel: "Nodes (n = 28 + log₂ nodes)", yLabel: "Time (s)", xScale: "log2", xTicks: [1, 2, 4, 8, 16, 32, 64],
        series: Object.keys(ser).map(function (b) {
          return serie(b, objToPoints(ser[b]), { emph: b === rec.b, dash: b.indexOf("one rank") !== -1 ? DASHES[1] : "" });
        }),
        marker: { x: nodes, label: nodes + " nodes" },
        hline: { y: D.weak.noMpiRef, label: "Qiskit Aer, one node without MPI" }
      }
    };
  }

  // Times of one backend over GPU counts at size m, measured, interpolated between 30 and 32, or estimated past 35.
  function mgpuAt(b, m) {
    var byN = D.multigpu[b] || {};
    if (byN[String(m)]) return { kind: "measured", byG: byN[String(m)] };
    var out = {}, kind = null;
    if (m === 31 && byN["30"] && byN["32"]) {
      Object.keys(byN["30"]).forEach(function (g) { if (byN["32"][g]) out[g] = Math.sqrt(byN["30"][g] * byN["32"][g]); });
      kind = "interp";
    } else if (m === 36 && byN["35"]) {
      Object.keys(byN["35"]).forEach(function (g) {
        if (!svFits(36, Number(g)) || (b === "QuEST" && !questFits(36, Number(g)))) return;
        var r = byN["34"] && byN["34"][g] ? Math.max(2, byN["35"][g] / byN["34"][g]) : 2;
        out[g] = byN["35"][g] * r;
      });
      kind = Object.keys(out).length ? "estimate" : null;
    }
    return kind ? { kind: kind, byG: out } : null;
  }
  // One A100-80 holds 32 qubits; distributed, QuEST holds at most 31 per GPU (its exchange buffer).
  function questFits(m, g) { return m - Math.log2(g) <= (g === 1 ? 32 : 31); }
  function svFits(m, g) { return m + 4 - Math.log2(g) <= 36 + Math.log2(80 / 64); }

  function mgpuModel(rec, ctx) {
    var c = rec.evk.c;
    if (c === "hea") return gpunodeModel(rec, ctx);
    var gpus = rec.evk.gpus;
    var m = ctx.n < 30 ? 30 : ctx.n;
    var backs = ["CUDA-Q", "Qiskit Aer", "QuEST"];
    var data = {};
    backs.forEach(function (b) { data[b] = mgpuAt(b, m); });
    var entries = backs.map(function (b) {
      var d = data[b];
      var t = d && d.byG[String(gpus)];
      var note = null;
      if (t == null) {
        if (b === "QuEST" && !questFits(m, gpus)) note = "holds at most 31 qubits per GPU, so it needs " + Math.pow(2, m - 31) + " GPUs at " + N + " = " + m;
        else note = "no result for this configuration";
      }
      return { b: b, t: t == null ? null : t, kind: t == null ? "none" : d.kind, note: note, obs: obs("mgpu", "", "", b) };
    });
    var foot = ["QFT on A100-80 nodes with four GPUs each, the state kept on the GPUs, one MPI rank per GPU, the median of ten repetitions (Figures 5.6 and 5.7)."];
    if (c === "clifford") foot.unshift("Multi-GPU runs used the QFT; the ranking below is the QFT one.");
    if (m !== ctx.n) foot.push("The multi-GPU series start at " + N + " = 30, so the ranking shows that size.");
    if (m === 31) foot.push("~ marks a value interpolated between " + N + " = 30 and 32.");
    if (m === 36) foot.push("≈ marks an estimate for " + N + " = 36 from the " + N + " = 35 run, at least doubling with the added qubit.");
    var counts = [1, 2, 4, 8, 16];
    return {
      title: "Multi-GPU runs at " + N + " = " + m,
      refs: ["Figures 5.6 and 5.7", "Table 5.7", "Section 5.4"],
      at: gpus + " GPU" + (gpus > 1 ? "s" : "") + ", " + N + " = " + m,
      rows: rowsFrom(entries, rec.b),
      foot: foot,
      chart: {
        xName: "GPUs", xLabel: "GPUs (four per node)", yLabel: "Time (s)", xScale: "log2", xTicks: counts,
        series: backs.filter(function (b) { return data[b]; }).map(function (b) {
          return serie(b, objToPoints(data[b].byG), {
            label: b + (data[b].kind === "measured" ? "" : data[b].kind === "interp" ? " (interpolated)" : " (estimate)"),
            emph: b === rec.b, dash: data[b].kind === "measured" ? "" : DASHES[1]
          });
        }),
        marker: { x: gpus, label: gpus + " GPU" + (gpus > 1 ? "s" : "") },
        vline: { x: 4, label: "one full node" }
      }
    };
  }

  function gpunodeModel(rec, ctx) {
    var h = D.gpunode.hea;
    var m = Math.min(Math.max(ctx.n, 28), 34);
    var entries = ["1", "2", "4"].map(function (g) {
      var v = valueAt(objToPoints(h[g]), m, { xName: "n", maxGap: 2, endNote: "does not hold the state" });
      return {
        b: "CUDA-Q · " + g + " GPU" + (g === "1" ? "" : "s"), t: v.t, kind: v.kind, note: v.kind === "none" ? (m > (g === "1" ? 32 : g === "2" ? 33 : 34) ? "does not hold the state" : v.note) : null,
        obs: g === "4" ? obs("gpunode", "", "", "CUDA-Q") : "", pickMatch: g === "4"
      };
    });
    var foot = ["HEA on one, two and four A100-80 GPUs of one node, the median of ten repetitions (Table 5.5).", "The multi-GPU runs of Qiskit Aer and QuEST used the QFT (Figures 5.6 and 5.7)."];
    if (m !== ctx.n) foot.push("These runs cover " + N + " = 28 to 34, so the table shows " + N + " = " + m + ".");
    if (entries.some(function (e) { return e.kind === "interp"; })) foot.push("~ marks a value interpolated between the neighbouring measured sizes.");
    return {
      title: "CUDA-Q within one node",
      refs: ["Table 5.5", "Figure 5.5", "Section 5.4.1"],
      at: N + " = " + m,
      rows: rowsFrom(entries, null),
      foot: foot,
      chart: {
        xName: "n", xLabel: "Qubits n", yLabel: "Time (s)", xScale: "lin", xTicks: [28, 30, 32, 33, 34],
        series: ["1", "2", "4"].map(function (g, i) {
          return serie("CUDA-Q · " + g + " GPU" + (g === "1" ? "" : "s"), objToPoints(h[g]), { emph: g === "4", dash: DASHES[2 - i] });
        }),
        marker: { x: m, label: "n = " + ctx.n }
      }
    };
  }

  function dmModel(rec, ctx) {
    var names = { "Qiskit Aer": "Qiskit Aer", "Qibo": "Qibo NumPy", "Qulacs": "Qulacs" };
    var m = Math.max(ctx.n, 3);
    var entries = Object.keys(D.dm.time).map(function (k) {
      var pts = D.dm.time[k];
      var v = valueAt(pts, m, { xName: "n", estimate: true, cap: S.LIMITS.dm, minRatio: 4, maxGap: 2, endNote: "does not fit one x86 job" });
      if (v.kind === "none" && k === "Qulacs" && m >= 10 && m <= 12) v.note = "no points from " + N + " = 10 to 12 (Figure 5.9)";
      var fid = valueAt(D.dm.fidelity[k], m, { xName: "n" });
      var o = obs("dm", "", "", names[k]);
      if (fid.kind === "measured") o = "Fidelity " + fid.t.toFixed(3) + " at this size. " + o;
      return { b: names[k], t: v.t, kind: v.kind, note: v.kind === "none" ? v.note : null, obs: o, v: v };
    });
    var foot = ["QFT with depolarising noise of p = 0.01 on the i9-13900KS platform, values read from Figure 5.9, the median of five repetitions."];
    if (m !== ctx.n) foot.push("The sweep starts at " + N + " = 3, so the ranking shows that size.");
    if (entries.some(function (e) { return e.kind === "estimate"; })) foot.push("≈ marks an estimate beyond " + N + " = 13, at least fourfold per added qubit, since the density matrix has 4ⁿ elements.");
    return {
      title: "Density-matrix backends",
      refs: ["Figure 5.9", "Section 5.6"],
      at: N + " = " + m,
      rows: rowsFrom(entries, rec.b),
      foot: foot,
      chart: {
        xName: "n", xLabel: "Number of qubits n", yLabel: "Simulation time (s)", xScale: "lin",
        series: Object.keys(D.dm.time).map(function (k) { return serie(names[k], D.dm.time[k], { emph: names[k] === rec.b }); }),
        marker: { x: Math.min(m, S.LIMITS.dm), label: "n = " + ctx.n },
        extensions: entries.filter(function (e) { return e.kind === "estimate"; }).map(function (e) {
          return { colour: colourOf(e.b), from: e.v.from, to: [m, e.t] };
        })
      }
    };
  }

  function stabModel(rec, ctx) {
    var n = ctx.n;
    var within = n <= 60;
    function lab(txt) { return within ? txt : "beyond " + N + " = 60"; }
    var sv = valueAt(D.sweep.thread.clifford.Qulacs, Math.max(n, S.SWEEP_MIN), { xName: "n" });
    var entries = [
      { b: "Qiskit Aer Stabilizer", label: lab("below 0.1 s"), obs: obs("stab", "", "", "Qiskit Aer Stabilizer") },
      { b: "Qibo Clifford", label: lab("below 0.1 s"), obs: obs("stab", "", "", "Qibo Clifford") },
      { b: "CUDA-Q Stim", label: lab(n >= 51 ? "above 0.1 s" : "below 0.1 s"), obs: obs("stab", "", "", "CUDA-Q Stim") },
      {
        b: "State vector", label: sv.kind === "measured" ? S.fmtT(sv.t) + " (Qulacs, one thread)" : "needs " + S.bytesLog2(n + 4),
        obs: obs("stab", "", "", "State vector")
      }
    ];
    entries.forEach(function (e) { e.pick = e.b === rec.b; e.t = null; });
    return {
      title: "Stabiliser backends on the Clifford circuit",
      refs: ["Figure 5.11", "Section 5.7"],
      at: N + " = " + n,
      qualitative: true,
      rows: entries,
      foot: ["Ten-layer Clifford benchmark; each stabiliser point is the fastest of five repetitions (Figure 5.11)."]
    };
  }

  function tnModel(rec, ctx) {
    var cls = rec.evk.cls;
    var keys = cls === "deep"
      ? ["CUDA-Q · HEA, twenty layers", "Qulacs state vector · QFT", "Qiskit Aer state vector · QFT"]
      : ["CUDA-Q · GHZ", "CUDA-Q · HEA, one layer", "Qibo · HEA, one layer", "Qulacs state vector · QFT", "Qiskit Aer state vector · QFT"];
    var n = ctx.n;
    var entries = keys.filter(function (k) { return D.tn[k]; }).map(function (k) {
      var isSV = k.indexOf("state vector") !== -1;
      var v = valueAt(D.tn[k], n, { xName: "n", endNote: isSV ? "series ends at " + N + " = " + D.tn[k][D.tn[k].length - 1][0] : "the next size exceeded the time limit" });
      if (k.indexOf("Qibo") === 0 && v.kind === "none") v.note = n <= 28 ? "no completed point at this size" : "its contraction into the full state exceeds the GPU memory from " + N + " = 30";
      return { b: k, t: v.t, kind: v.kind, note: v.kind === "none" ? v.note : null, obs: obs("tn", "", "", k), pickMatch: k.indexOf(rec.b + " ·") === 0 };
    });
    var foot = ["One A100-40, the median of the completed repetitions; CUDA-Q samples 1024 shots and Qibo contracts the full state (Figure 5.12).", "The state-vector rows are the QFT references of Figure 5.12, a different circuit."];
    if (entries.some(function (e) { return e.kind === "interp"; })) foot.push("~ marks a value interpolated between the neighbouring completed sizes.");
    return {
      title: "Tensor-network simulation, " + (cls === "deep" ? "HEA with twenty layers" : "GHZ and the one-layer HEA"),
      refs: ["Figure 5.12", "Section 5.7"],
      at: N + " = " + n,
      noRank: true,
      rows: entries.map(function (e) { e.pick = e.pickMatch; return e; }),
      foot: foot,
      chart: {
        xName: "n", xLabel: "Qubits n", yLabel: "Time (s)", xScale: "log10", xTicks: [4, 10, 40, 100, 400],
        series: keys.filter(function (k) { return D.tn[k]; }).map(function (k) { return serie(k, D.tn[k], { emph: k.indexOf(rec.b + " ·") === 0 }); }),
        marker: { x: Math.min(Math.max(n, 4), 500), label: "n = " + n },
        vline: { x: 31, label: "largest state vector on one A100-40" }
      }
    };
  }

  function model(rec, ctx) {
    var k = rec.evk;
    if (!k || k.type === "none" || !D) return null;
    if (k.type === "sweep") return sweepModel(rec, ctx);
    if (k.type === "strong") return strongModel(rec, ctx);
    if (k.type === "weak") return weakModel(rec, ctx);
    if (k.type === "mgpu") return mgpuModel(rec, ctx);
    if (k.type === "dm") return dmModel(rec, ctx);
    if (k.type === "stab") return stabModel(rec, ctx);
    if (k.type === "tn") return tnModel(rec, ctx);
    return null;
  }

  /* ---------- text ---------- */
  function timeText(e) {
    if (e.label) return e.label;
    if (e.t == null) return "—";
    var mark = e.kind === "estimate" ? "≈ " : e.kind === "interp" ? "~ " : "";
    return mark + S.fmtT(e.t);
  }
  function strip(html) { return String(html).replace(/<[^>]+>/g, ""); }
  // Plain-text lines for the copied summary.
  function lines(m) {
    if (!m) return [];
    var out = ["Measured (" + strip(m.at) + "), " + m.refs.join(", ") + ":"];
    m.rows.forEach(function (e) {
      var r = (e.rank && !m.noRank ? e.rank + ". " : "- ") + labelOf(e.b) + "  " + strip(timeText(e));
      if (e.ratio && e.ratio > 1.0049 && !m.noRank) r += " (" + e.ratio.toFixed(2) + "×)";
      if (e.note) r += "  [" + strip(e.note) + "]";
      out.push("  " + r);
    });
    return out;
  }

  /* ---------- chart, drawn like the plots of Chapter 5 ---------- */
  function escAttr(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]; }); }
  function f1(v) { return v.toFixed(1); }
  // Power of ten with a raised exponent, as on the logarithmic axes of the dissertation.
  function pow10(d) { return "10<tspan dy=\"-4.5\" font-size=\"8.5\">" + (d < 0 ? "−" + (-d) : d) + "</tspan>"; }
  // Outline of a hollow marker centred on (x, y).
  function markPath(kind, x, y, r) {
    function P(list) { return "M" + list.map(function (p) { return f1(x + p[0]) + " " + f1(y + p[1]); }).join("L") + "Z"; }
    if (kind === "diamond") return P([[0, -1.3 * r], [1.15 * r, 0], [0, 1.3 * r], [-1.15 * r, 0]]);
    if (kind === "square") return P([[-r, -r], [r, -r], [r, r], [-r, r]]);
    if (kind === "tri") return P([[-1.2 * r, -0.95 * r], [1.2 * r, -0.95 * r], [0, 1.15 * r]]);
    if (kind === "plus" || kind === "cross") {
      var w = 0.42 * r, a = 1.25 * r;
      return P([[-w, -a], [w, -a], [w, -w], [a, -w], [a, w], [w, w], [w, a], [-w, a], [-w, w], [-a, w], [-a, -w], [-w, -w]]);
    }
    return "M" + f1(x - r) + " " + f1(y) + "a" + f1(r) + " " + f1(r) + " 0 1 0 " + f1(2 * r) + " 0a" + f1(r) + " " + f1(r) + " 0 1 0 " + f1(-2 * r) + " 0Z";
  }
  function markSVG(s, x, y, r, title) {
    return "<path class=\"mk" + (s.emph ? " emph" : "") + "\" d=\"" + markPath(s.marker, x, y, r) + "\" stroke=\"" + s.colour + "\"" +
      (s.marker === "cross" ? " transform=\"rotate(45 " + f1(x) + " " + f1(y) + ")\"" : "") + ">" + (title ? "<title>" + escAttr(title) + "</title>" : "") + "</path>";
  }

  function chartSVG(ch, width) {
    var W = Math.max(260, Math.round(width || 520));
    var H = W < 420 ? 220 : 260;
    var L = 56, R = 12, T = 14, B = 42;
    var all = [];
    ch.series.forEach(function (s) { s.points.forEach(function (p) { all.push(p); }); });
    (ch.extensions || []).forEach(function (e) { all.push(e.to); });
    if (ch.hline) all.push([null, ch.hline.y]);
    if (!all.length) return "";
    var xs = all.filter(function (p) { return p[0] != null; }).map(function (p) { return p[0]; });
    var ys = all.map(function (p) { return p[1]; }).filter(function (v) { return v > 0; });
    var xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
    if (ch.marker) { xmin = Math.min(xmin, ch.marker.x); xmax = Math.max(xmax, ch.marker.x); }
    if (ch.xTicks) { xmin = Math.min(xmin, ch.xTicks[0]); xmax = Math.max(xmax, ch.xTicks[ch.xTicks.length - 1]); }
    var ylo = Math.floor(Math.log10(Math.min.apply(null, ys)));
    var yhi = Math.ceil(Math.log10(Math.max.apply(null, ys)));
    if (yhi === ylo) yhi++;
    var fx = ch.xScale === "lin" ? function (v) { return v; } : ch.xScale === "log2" ? Math.log2 : Math.log10;
    var x0 = fx(xmin), x1 = fx(xmax);
    if (x1 === x0) x1 = x0 + 1;
    var padX = (W - L - R) * 0.035;
    function X(v) { return L + padX + (fx(v) - x0) / (x1 - x0) * (W - L - R - 2 * padX); }
    function Y(v) { return T + (yhi - Math.log10(v)) / (yhi - ylo) * (H - T - B); }
    var o = [];
    o.push("<svg class=\"chart\" xmlns=\"http://www.w3.org/2000/svg\" width=\"" + W + "\" height=\"" + H + "\" viewBox=\"0 0 " + W + " " + H + "\" role=\"img\" aria-label=\"" + escAttr(ch.aria || (ch.yLabel || "Time") + " against " + ch.xLabel) + "\">");
    // grid and y ticks, one per decade
    var step = yhi - ylo > 7 ? 2 : 1;
    for (var d = ylo; d <= yhi; d += step) {
      var y = Y(Math.pow(10, d));
      o.push("<line class=\"grid\" x1=\"" + L + "\" x2=\"" + (W - R) + "\" y1=\"" + f1(y) + "\" y2=\"" + f1(y) + "\"/>");
      o.push("<line class=\"tk\" x1=\"" + (L - 4) + "\" x2=\"" + L + "\" y1=\"" + f1(y) + "\" y2=\"" + f1(y) + "\"/>");
      o.push("<text class=\"tick\" x=\"" + (L - 7) + "\" y=\"" + f1(y + 4) + "\" text-anchor=\"end\">" + pow10(d) + "</text>");
    }
    // x ticks
    var ticks = ch.xTicks;
    if (!ticks) {
      ticks = [];
      var span = xmax - xmin, st = span > 40 ? 10 : span > 14 ? 3 : 1;
      for (var t = Math.ceil(xmin / st) * st; t <= xmax; t += st) ticks.push(t);
    }
    ticks.forEach(function (t) {
      if (t < xmin || t > xmax) return;
      var x = X(t);
      o.push("<line class=\"grid\" x1=\"" + f1(x) + "\" x2=\"" + f1(x) + "\" y1=\"" + T + "\" y2=\"" + (H - B) + "\"/>");
      o.push("<line class=\"tk\" x1=\"" + f1(x) + "\" x2=\"" + f1(x) + "\" y1=\"" + (H - B) + "\" y2=\"" + (H - B + 4) + "\"/>");
      o.push("<text class=\"tick\" x=\"" + f1(x) + "\" y=\"" + (H - B + 16) + "\" text-anchor=\"middle\">" + t + "</text>");
    });
    o.push("<rect class=\"frame\" x=\"" + L + "\" y=\"" + T + "\" width=\"" + (W - L - R) + "\" height=\"" + (H - T - B) + "\"/>");
    o.push("<text class=\"axlabel\" x=\"" + f1((L + W - R) / 2) + "\" y=\"" + (H - 6) + "\" text-anchor=\"middle\">" + escAttr(ch.xLabel) + "</text>");
    var cy = (T + H - B) / 2;
    o.push("<text class=\"axlabel\" x=\"13\" y=\"" + f1(cy) + "\" text-anchor=\"middle\" transform=\"rotate(-90 13 " + f1(cy) + ")\">" + escAttr(ch.yLabel || "Time (s)") + "</text>");
    // reference lines
    if (ch.vline && ch.vline.x >= xmin && ch.vline.x <= xmax) {
      var vx = X(ch.vline.x);
      o.push("<line class=\"vref\" x1=\"" + f1(vx) + "\" x2=\"" + f1(vx) + "\" y1=\"" + T + "\" y2=\"" + (H - B) + "\"><title>" + escAttr(ch.vline.label) + "</title></line>");
    }
    if (ch.hline) {
      var hy = Y(ch.hline.y);
      o.push("<line class=\"vref\" x1=\"" + L + "\" x2=\"" + (W - R) + "\" y1=\"" + f1(hy) + "\" y2=\"" + f1(hy) + "\"><title>" + escAttr(ch.hline.label) + "</title></line>");
    }
    // the size asked
    if (ch.marker && ch.marker.x >= xmin && ch.marker.x <= xmax) {
      var mx = X(ch.marker.x);
      o.push("<line class=\"marker\" x1=\"" + f1(mx) + "\" x2=\"" + f1(mx) + "\" y1=\"" + T + "\" y2=\"" + (H - B) + "\"/>");
    }
    // series, the selected one last so that it lies on top
    var order = ch.series.slice().sort(function (a, b) { return (a.emph ? 1 : 0) - (b.emph ? 1 : 0); });
    order.forEach(function (s) {
      var pts = sorted(s.points).filter(function (p) { return p[1] > 0; });
      if (!pts.length) return;
      var dpath = pts.map(function (p, i) { return (i ? "L" : "M") + f1(X(p[0])) + " " + f1(Y(p[1])); }).join(" ");
      o.push("<path class=\"ser" + (s.emph ? " emph" : "") + "\" d=\"" + dpath + "\" stroke=\"" + s.colour + "\"" + (s.dash ? " stroke-dasharray=\"" + s.dash + "\"" : "") + "><title>" + escAttr(s.name) + "</title></path>");
      var r = pts.length > 22 ? 2.6 : 3.2;
      pts.forEach(function (p) {
        o.push(markSVG(s, X(p[0]), Y(p[1]), r, s.name + ", " + ch.xName + " = " + p[0] + ", " + S.fmtT(p[1])));
      });
    });
    (ch.extensions || []).forEach(function (e) {
      if (!e.from) return;
      o.push("<line class=\"est\" x1=\"" + f1(X(e.from[0])) + "\" y1=\"" + f1(Y(e.from[1])) + "\" x2=\"" + f1(X(e.to[0])) + "\" y2=\"" + f1(Y(e.to[1])) + "\" stroke=\"" + e.colour + "\"/>");
      o.push("<circle class=\"pt est\" cx=\"" + f1(X(e.to[0])) + "\" cy=\"" + f1(Y(e.to[1])) + "\" r=\"3.2\" stroke=\"" + e.colour + "\"><title>Estimate, " + S.fmtT(e.to[1]) + "</title></circle>");
    });
    if (ch.marker && ch.marker.x >= xmin && ch.marker.x <= xmax) {
      var lx = X(ch.marker.x);
      var anchor = lx > W - 80 ? "end" : "start";
      o.push("<text class=\"mlabel\" x=\"" + f1(lx + (anchor === "end" ? -5 : 5)) + "\" y=\"" + (T + 13) + "\" text-anchor=\"" + anchor + "\">" + escAttr(ch.marker.label) + "</text>");
    }
    o.push("</svg>");
    return o.join("");
  }

  /* ---------- DOM ---------- */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function legend(ch) {
    var ul = el("ul", "legend");
    ch.series.forEach(function (s) {
      var li = el("li", s.emph ? "emph" : "");
      li.innerHTML = "<svg class=\"chart\" width=\"34\" height=\"12\" aria-hidden=\"true\"><path class=\"ser" + (s.emph ? " emph" : "") + "\" d=\"M1 6H33\" stroke=\"" + s.colour + "\"" + (s.dash ? " stroke-dasharray=\"" + s.dash + "\"" : "") + "/>" + markSVG(s, 17, 6, 3.2, "") + "</svg>";
      li.appendChild(document.createTextNode(s.name));
      ul.appendChild(li);
    });
    var extra = [];
    if (ch.marker) extra.push("<li class=\"ref\"><svg class=\"chart\" width=\"34\" height=\"12\" aria-hidden=\"true\"><line class=\"marker\" x1=\"1\" x2=\"33\" y1=\"6\" y2=\"6\"/></svg>the size asked</li>");
    if (ch.vline) extra.push("<li class=\"ref\"><svg class=\"chart\" width=\"34\" height=\"12\" aria-hidden=\"true\"><line class=\"vref\" x1=\"1\" x2=\"33\" y1=\"6\" y2=\"6\"/></svg>" + escAttr(ch.vline.label) + "</li>");
    if (ch.hline) extra.push("<li class=\"ref\"><svg class=\"chart\" width=\"34\" height=\"12\" aria-hidden=\"true\"><line class=\"vref\" x1=\"1\" x2=\"33\" y1=\"6\" y2=\"6\"/></svg>" + escAttr(ch.hline.label) + "</li>");
    if (extra.length) ul.insertAdjacentHTML("beforeend", extra.join(""));
    return ul;
  }
  // A table ruled like those of the dissertation: each backend on one row, its observation beneath.
  function table(m) {
    var wrap = el("div", "rank-wrap");
    var ranked = !m.qualitative && !m.noRank;
    var seriesNames = m.qualitative || m.rows.some(function (e) { return e.b.indexOf(" · ") !== -1; });
    var t = el("table", "rank" + (ranked ? "" : " qual"));
    t.appendChild(el("caption", "", (seriesNames ? "Series" : "Backends") + " at " + m.at + (ranked ? ", fastest first, with the ratio to the fastest time" : "")));
    var head = el("thead");
    head.innerHTML = "<tr>" + (ranked ? "<th scope=\"col\" class=\"rk\"><span class=\"visually-hidden\">Rank</span></th>" : "") + "<th scope=\"col\">" + (seriesNames ? "Series" : "Backend") + "</th><th scope=\"col\" class=\"tm\">Time</th>" +
      (ranked ? "<th scope=\"col\" class=\"rt\">Ratio</th>" : "") + "</tr>";
    t.appendChild(head);
    var cols = ranked ? 4 : 2;
    var body = el("tbody");
    m.rows.forEach(function (e) {
      var cls = (e.pick ? "pick" : "") + (e.t == null && !e.label ? " none" : "") + (e.excluded ? " flagged" : "");
      var tr = el("tr", "main " + cls);
      if (ranked) tr.appendChild(el("td", "rk", e.rank ? String(e.rank) : ""));
      var name = el("td", "nm");
      var sw = el("span", "dot");
      sw.style.background = colourOf(e.b);
      name.appendChild(sw);
      var shown = labelOf(e.b);
      var repo = S.REPOS[e.b] || S.REPOS[baseName(e.b)];
      if (repo) {
        var a = el("a", "repo", shown.replace(/&/g, "&amp;"));
        a.href = repo; a.target = "_blank"; a.rel = "noopener noreferrer";
        a.title = "Source repository (opens in a new tab)";
        name.appendChild(a);
      } else name.appendChild(document.createTextNode(shown));
      if (e.pick) name.appendChild(el("span", "pick-tag", "selected"));
      tr.appendChild(name);
      tr.appendChild(el("td", "tm" + (e.kind === "estimate" || e.kind === "interp" ? " est" : ""), timeText(e)));
      if (ranked) tr.appendChild(el("td", "rt", e.ratio ? (e.ratio < 1.005 ? "1" : e.ratio.toFixed(2) + "×") : ""));
      body.appendChild(tr);
      var text = (e.note ? "<span class=\"rnote\">" + e.note.charAt(0).toUpperCase() + e.note.slice(1) + ".</span> " : "") + (e.obs || "");
      if (text) {
        var tr2 = el("tr", "sub " + cls);
        if (ranked) tr2.appendChild(el("td", "rk", ""));
        var ob = el("td", "obs", text);
        ob.colSpan = cols - (ranked ? 1 : 0);
        tr2.appendChild(ob);
        body.appendChild(tr2);
      }
    });
    t.appendChild(body);
    wrap.appendChild(t);
    return wrap;
  }

  // The chart is drawn when the panel opens and again when the width changes.
  var live = [];
  function draw(holder, ch) {
    var w = holder.clientWidth;
    if (!w) return;
    if (holder._w === w) return;
    holder._w = w;
    holder.innerHTML = chartSVG(ch, Math.min(w, 620));
  }
  var resizeTimer = null;
  if (typeof window.addEventListener === "function") {
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        live = live.filter(function (x) { return document.body.contains(x.holder); });
        live.forEach(function (x) { draw(x.holder, x.chart); });
      }, 120);
    });
  }

  function render(m, opts) {
    opts = opts || {};
    var det = el("details", "evidence");
    if (opts.open) det.open = true;
    det.appendChild(el("summary", "", "<span class=\"ev-h\">Measurements</span> <span class=\"ev-refs\">" + m.refs.join(", ") + "</span>"));
    var body = el("div", "ev-body");
    var caption = m.title + ". " + m.foot[0];
    if (m.chart) {
      var fig = el("figure", "plot");
      var holder = el("div", "chart-box");
      fig.appendChild(holder);
      fig.appendChild(legend(m.chart));
      fig.appendChild(el("figcaption", "caption", caption));
      body.appendChild(fig);
      live.push({ holder: holder, chart: m.chart });
      var paint = function () { holder._w = 0; draw(holder, m.chart); };
      det.addEventListener("toggle", function () { if (det.open) paint(); });
      if (opts.open) setTimeout(paint, 0);
    } else {
      body.appendChild(el("p", "caption", caption));
    }
    body.appendChild(table(m));
    if (m.foot.length > 1) {
      var foot = el("ul", "ev-foot");
      m.foot.slice(1).forEach(function (f) { foot.appendChild(el("li", "", f)); });
      body.appendChild(foot);
    }
    det.appendChild(body);
    return det;
  }

  window.Evidence = { model: model, render: render, chartSVG: chartSVG, lines: lines, valueAt: valueAt, OBS: OBS, colourOf: colourOf, labelOf: labelOf };
})();
