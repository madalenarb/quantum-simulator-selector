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
    "sweep|node|Qulacs": "Second on every circuit at " + N + " = 30. On the 30-qubit QFT it stops gaining at 16 threads, consistent with the memory-bandwidth limit (Section 5.2).",
    "sweep|node|clifford|Qulacs": "Second at " + N + " = 30. Up to " + N + " = 13 it runs up to thirty-five times slower than on one thread, as dividing small updates among threads costs more than it saves.",
    "sweep|node|qft|QuEST": "Applies one unfused gate per pass over the state.",
    "sweep|node|hea|QuEST": "Its speedup over one thread reaches at most about 13 at " + N + " = 28.",
    "sweep|node|clifford|QuEST": "Fastest on this circuit through " + N + " = 25; its speedup over one thread reaches at most about 13 at " + N + " = 28.",
    "sweep|node|qibojit": "The slowest of the four backends at the largest sizes.",
    "sweep|gpu|Qulacs": "Lowest fixed costs, 13 to 20 µs per gate between " + N + " = 12 and 18, and leads every circuit through " + N + " = 23. Its timed call excludes any copy to host memory.",
    "sweep|gpu|QuEST": "Second fastest up to " + N + " = 16, at 22 to 30 µs per gate, then a six- to sevenfold step at " + N + " = 17 from temporary device allocations around each gate. Its timed call excludes the copy to host memory.",
    "sweep|gpu|qft|Qiskit Aer": "Leads the QFT from " + N + " = 24 to 30 although its time includes the copy to host memory, consistent with its fusion of controlled rotations into diagonal operations.",
    "sweep|gpu|hea|Qiskit Aer": "Processes the whole circuit in one call with fusion; its time includes the copy to host memory.",
    "sweep|gpu|clifford|Qiskit Aer": "The slowest of the five on this circuit through " + N + " = 27; its time includes the copy to host memory.",
    "sweep|gpu|qft|CUDA-Q": "One call per circuit with fusion and just-in-time compilation, 1.1 to 1.7 times behind Qiskit Aer from " + N + " = 24 to 30. Its time includes the copy to host memory.",
    "sweep|gpu|CUDA-Q": "One call per circuit with fusion and just-in-time compilation, the fastest on this circuit at the larger sizes. Its time includes the copy to host memory.",
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
    "mgpu|CUDA-Q": "cuStateVec kernels, 3.5 to 4 times faster than Qiskit Aer on four GPUs. Crossing to a second node slows it about eightfold from " + N + " = 32.",
    "mgpu|Qiskit Aer": "Exchanges over the CUDA IPC transport inside a node. From eight to sixteen GPUs it about halves its time, and it leads on sixteen.",
    "mgpu|QuEST": "Gains the most within a node but stays the slowest at every GPU count, and holds at most 31 qubits of the state per GPU in distributed runs.",
    "gpunode|CUDA-Q": "Dividing the state shortens the run more as the state grows; four GPUs cut the HEA time at " + N + " = 32 by over two-thirds (Table 5.5).",
    // density matrix, Figure 5.9
    "dm|Qiskit Aer": "Stays closest to the fourfold growth per qubit and is about twenty-five times faster than the other two at " + N + " = 13.",
    "dm|Qibo NumPy": "About twenty to fifty times faster at " + N + " = 3, then grows faster than fourfold per qubit. It applies the same channel as Qiskit Aer.",
    "dm|Qulacs": "Sets noise as a Pauli-error probability, 4/3 stronger per qubit at the same p and applied only to the CNOT target, so its fidelity sits slightly below the other two.",
    // stabiliser, Figure 5.11
    "stab|Qiskit Aer Stabilizer": "Stays below 0.1 s through " + N + " = 60 on one x86 thread and returns samples.",
    "stab|Qibo Clifford": "Stays below 0.1 s through " + N + " = 60 and builds the tableau without sampling.",
    "stab|CUDA-Q Stim": "Exceeds 0.1 s from " + N + " = 51, since it pays the dispatch and just-in-time compilation of the framework in every repetition.",
    "stab|State vector": "Doubles with every qubit; a 60-qubit state would need 16 EiB.",
    // tensor network, Figure 5.12
    "tn|CUDA-Q · GHZ": "Schmidt rank at most two across any cut of the chain. Every size up to " + N + " = 500 completed, about an hour at " + N + " = 500.",
    "tn|CUDA-Q · HEA, one layer": "Schmidt rank at most two across any cut of the chain. Every size up to " + N + " = 500 completed.",
    "tn|CUDA-Q · HEA, twenty layers": "Each added layer raises the rank the contraction carries, and the time limit is reached after " + N + " = 36.",
    "tn|CUDA-Q · QFT": "Slower than the state vector at every size, completed up to " + N + " = 24.",
    "tn|Qibo · HEA, one layer": "Contracts into the full state, faster than CUDA-Q at the sizes both reached, and stops at " + N + " = 28 on GPU memory.",
    "tn|Qibo · QFT": "Contracts into the full state and stops at " + N + " = 28 on GPU memory.",
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
  function colourOf(name) {
    if (S.COLOURS[name]) return S.COLOURS[name];
    var base = name.split(" · ")[0].split(",")[0];
    return S.COLOURS[base] || "#86d4f0";
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
    var foot = ["Times as plotted in Figure 5.1" + S.PANEL[reg][c] + "."];
    if (reg === "gpu") foot.push("The times of Qiskit Aer and CUDA-Q include the copy of the state to host memory; those of Qulacs, qibojit and QuEST do not (Table 4.4).");
    if (nUse !== ctx.n) foot.push("Your size lies below the smallest size measured, so the ranking shows " + N + " = " + nUse + ".");
    if (entries.some(function (e) { return e.kind === "estimate"; })) foot.push("≈ marks an estimate beyond the sweep, which ends at " + N + " = " + end + ", assuming the time at least doubles with each added qubit.");
    if (entries.some(function (e) { return e.kind === "interp"; })) foot.push("~ marks a value interpolated between the neighbouring measured sizes.");
    return {
      title: "Measured " + WHERE_SHORT[reg] + " · " + S.CIRCUIT_NAME[c],
      refs: ["Figure 5.1" + S.PANEL[reg][c], "Section 5.1"],
      at: N + " = " + nUse,
      rows: rowsFrom(entries, rec.b),
      foot: foot,
      chart: {
        xName: "n", xLabel: "Qubits n", xScale: "lin",
        series: names.map(function (b) {
          return { name: b, colour: colourOf(b), points: series[b], emph: b === rec.b };
        }),
        marker: { x: Math.min(Math.max(ctx.n, S.SWEEP_MIN), cap), label: "n = " + ctx.n },
        extensions: entries.filter(function (e) { return e.kind === "estimate"; }).map(function (e) {
          return { colour: colourOf(e.b), from: e.v.from, to: [nUse, e.t] };
        })
      }
    };
  }
  var WHERE_SHORT = { thread: "on one x86 thread", node: "on one x86 node, 128 threads", gpu: "on one A100-40" };

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
      title: "QFT strong scaling at n = 30 · " + nodes + " nodes",
      refs: ["Table 5.3", "Figure 5.3", "Section 5.3"],
      at: nodes + " nodes",
      rows: rowsFrom(entries, rec.b),
      foot: foot,
      chart: {
        xName: "nodes", xLabel: "x86 nodes", xScale: "log2", xTicks: [1, 2, 4, 8, 16, 32, 64],
        series: Object.keys(ser).map(function (b, i) {
          return { name: b, colour: colourOf(b), points: objToPoints(ser[b]), emph: b === rec.b, dash: b.indexOf("one rank") !== -1 ? DASHES[1] : "" };
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
      title: "QFT weak scaling · " + nodes + " nodes, n = " + nAt,
      refs: ["Figure 5.4", "Section 5.3"],
      at: nodes + " nodes, " + N + " = " + (extra > 0 ? ctx.n : nAt),
      rows: rowsFrom(entries, rec.b),
      foot: foot,
      chart: {
        xName: "nodes", xLabel: "x86 nodes (n = 28 + log₂ nodes)", xScale: "log2", xTicks: [1, 2, 4, 8, 16, 32, 64],
        series: Object.keys(ser).map(function (b) {
          return { name: b, colour: colourOf(b), points: objToPoints(ser[b]), emph: b === rec.b, dash: b.indexOf("one rank") !== -1 ? DASHES[1] : "" };
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
      title: "Multi-GPU QFT · n = " + m + " · " + gpus + " GPU" + (gpus > 1 ? "s" : ""),
      refs: ["Figures 5.6 and 5.7", "Table 5.7", "Section 5.4"],
      at: gpus + " GPU" + (gpus > 1 ? "s" : "") + ", " + N + " = " + m,
      rows: rowsFrom(entries, rec.b),
      foot: foot,
      chart: {
        xName: "GPUs", xLabel: "A100-80 GPUs (four per node)", xScale: "log2", xTicks: counts,
        series: backs.filter(function (b) { return data[b]; }).map(function (b) {
          var byG = data[b].byG;
          return {
            name: b + (data[b].kind === "measured" ? "" : data[b].kind === "interp" ? " (interpolated)" : " (estimate)"),
            colour: colourOf(b), points: objToPoints(byG), emph: b === rec.b, dash: data[b].kind === "measured" ? "" : DASHES[1]
          };
        }),
        marker: { x: gpus, label: gpus + " GPU" + (gpus > 1 ? "s" : "") },
        vline: { x: 4, label: "one node" }
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
    var foot = ["HEA with CUDA-Q on one, two and four A100-80 GPUs of one node, the median of ten repetitions (Table 5.5).", "The multi-GPU runs of Qiskit Aer and QuEST used the QFT (Figures 5.6 and 5.7)."];
    if (m !== ctx.n) foot.push("These runs cover " + N + " = 28 to 34, so the table shows " + N + " = " + m + ".");
    if (entries.some(function (e) { return e.kind === "interp"; })) foot.push("~ marks a value interpolated between the neighbouring measured sizes.");
    return {
      title: "CUDA-Q within one node · HEA · n = " + m,
      refs: ["Table 5.5", "Figure 5.5", "Section 5.4.1"],
      at: N + " = " + m,
      rows: rowsFrom(entries, null),
      foot: foot,
      chart: {
        xName: "n", xLabel: "Qubits n", xScale: "lin", xTicks: [28, 30, 32, 33, 34],
        series: ["1", "2", "4"].map(function (g, i) {
          return { name: "CUDA-Q · " + g + " GPU" + (g === "1" ? "" : "s"), colour: colourOf("CUDA-Q"), points: objToPoints(h[g]), emph: g === "4", dash: DASHES[2 - i] };
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
      title: "Density matrix · QFT with depolarising noise",
      refs: ["Figure 5.9", "Section 5.6"],
      at: N + " = " + m,
      rows: rowsFrom(entries, rec.b),
      foot: foot,
      chart: {
        xName: "n", xLabel: "Qubits n", xScale: "lin",
        series: Object.keys(D.dm.time).map(function (k) {
          return { name: names[k], colour: colourOf(names[k]), points: D.dm.time[k], emph: names[k] === rec.b };
        }),
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
      title: "Stabiliser methods · Clifford circuit",
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
    var foot = ["One A100-40, the median of the completed repetitions; CUDA-Q draws 1024 samples and Qibo contracts the full state (Figure 5.12).", "The state-vector rows are QFT references, a different circuit, shown as in Figure 5.12."];
    if (entries.some(function (e) { return e.kind === "interp"; })) foot.push("~ marks a value interpolated between the neighbouring completed sizes.");
    return {
      title: "Tensor network · " + (cls === "deep" ? "twenty HEA layers" : "GHZ and one-layer HEA"),
      refs: ["Figure 5.12", "Section 5.7"],
      at: N + " = " + n,
      noRank: true,
      rows: entries.map(function (e) { e.pick = e.pickMatch; return e; }),
      foot: foot,
      chart: {
        xName: "n", xLabel: "Qubits n (log scale)", xScale: "log10", xTicks: [4, 10, 30, 100, 300],
        series: keys.filter(function (k) { return D.tn[k]; }).map(function (k, i) {
          var isSV = k.indexOf("state vector") !== -1;
          return { name: k, colour: colourOf(k.split(" ")[0] === "Qiskit" ? "Qiskit Aer" : k.split(" ")[0]), points: D.tn[k], emph: k.indexOf(rec.b + " ·") === 0, dash: isSV ? DASHES[2] : k.indexOf("one layer") !== -1 ? DASHES[1] : "" };
        }),
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
      var r = (e.rank && !m.noRank ? e.rank + ". " : "- ") + e.b + "  " + strip(timeText(e));
      if (e.ratio && e.ratio > 1.0049 && !m.noRank) r += " (" + e.ratio.toFixed(2) + "×)";
      if (e.note) r += "  [" + strip(e.note) + "]";
      out.push("  " + r);
    });
    return out;
  }

  /* ---------- chart ---------- */
  var SUPERS = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  function yLabel(v) {
    if (v >= 1) return v >= 1000 ? (v / 1000) + "k s" : v + " s";
    if (v >= 1e-3) return Math.round(v * 1000) + " ms";
    return Math.round(v * 1e6) + " µs";
  }
  function escAttr(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]; }); }

  function chartSVG(ch, width) {
    var W = Math.max(260, Math.round(width || 520));
    var H = W < 420 ? 190 : 220;
    var L = 46, R = 12, T = 12, B = 34;
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
    function X(v) { return L + (fx(v) - x0) / (x1 - x0) * (W - L - R); }
    function Y(v) { return T + (yhi - Math.log10(v)) / (yhi - ylo) * (H - T - B); }
    var o = [];
    o.push("<svg class=\"chart\" xmlns=\"http://www.w3.org/2000/svg\" width=\"" + W + "\" height=\"" + H + "\" viewBox=\"0 0 " + W + " " + H + "\" role=\"img\" aria-label=\"" + escAttr(ch.aria || "Measured time against " + ch.xLabel) + "\">");
    // y grid, one line per decade
    var step = yhi - ylo > 6 ? 2 : 1;
    for (var d = ylo; d <= yhi; d += step) {
      var y = Y(Math.pow(10, d));
      o.push("<line class=\"grid\" x1=\"" + L + "\" x2=\"" + (W - R) + "\" y1=\"" + y.toFixed(1) + "\" y2=\"" + y.toFixed(1) + "\"/>");
      o.push("<text class=\"tick\" x=\"" + (L - 6) + "\" y=\"" + (y + 3.5).toFixed(1) + "\" text-anchor=\"end\">" + yLabel(Math.pow(10, d)) + "</text>");
    }
    // x ticks
    var ticks = ch.xTicks;
    if (!ticks) {
      ticks = [];
      var span = xmax - xmin, st = span > 40 ? 10 : span > 16 ? 4 : 2;
      for (var t = Math.ceil(xmin / st) * st; t <= xmax; t += st) ticks.push(t);
    }
    ticks.forEach(function (t) {
      if (t < xmin || t > xmax) return;
      var x = X(t);
      o.push("<line class=\"xt\" x1=\"" + x.toFixed(1) + "\" x2=\"" + x.toFixed(1) + "\" y1=\"" + (H - B) + "\" y2=\"" + (H - B + 4) + "\"/>");
      o.push("<text class=\"tick\" x=\"" + x.toFixed(1) + "\" y=\"" + (H - B + 15) + "\" text-anchor=\"middle\">" + t + "</text>");
    });
    o.push("<line class=\"axis\" x1=\"" + L + "\" x2=\"" + (W - R) + "\" y1=\"" + (H - B) + "\" y2=\"" + (H - B) + "\"/>");
    o.push("<text class=\"axlabel\" x=\"" + ((L + W - R) / 2).toFixed(1) + "\" y=\"" + (H - 4) + "\" text-anchor=\"middle\">" + escAttr(ch.xLabel) + "</text>");
    // reference lines
    if (ch.vline && ch.vline.x >= xmin && ch.vline.x <= xmax) {
      var vx = X(ch.vline.x);
      o.push("<line class=\"vref\" x1=\"" + vx.toFixed(1) + "\" x2=\"" + vx.toFixed(1) + "\" y1=\"" + T + "\" y2=\"" + (H - B) + "\"><title>" + escAttr(ch.vline.label) + "</title></line>");
    }
    if (ch.hline) {
      var hy = Y(ch.hline.y);
      o.push("<line class=\"vref\" x1=\"" + L + "\" x2=\"" + (W - R) + "\" y1=\"" + hy.toFixed(1) + "\" y2=\"" + hy.toFixed(1) + "\"><title>" + escAttr(ch.hline.label) + "</title></line>");
    }
    // series, emphasised one last so it sits on top
    var order = ch.series.slice().sort(function (a, b) { return (a.emph ? 1 : 0) - (b.emph ? 1 : 0); });
    order.forEach(function (s) {
      var pts = sorted(s.points).filter(function (p) { return p[1] > 0; });
      if (!pts.length) return;
      var dpath = pts.map(function (p, i) { return (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join(" ");
      o.push("<path class=\"ser" + (s.emph ? " emph" : "") + "\" d=\"" + dpath + "\" stroke=\"" + s.colour + "\"" + (s.dash ? " stroke-dasharray=\"" + s.dash + "\"" : "") + "><title>" + escAttr(s.name) + "</title></path>");
      if (s.emph || pts.length <= 12) {
        pts.forEach(function (p) {
          o.push("<circle class=\"pt" + (s.emph ? " emph" : "") + "\" cx=\"" + X(p[0]).toFixed(1) + "\" cy=\"" + Y(p[1]).toFixed(1) + "\" r=\"" + (s.emph ? 2.6 : 1.8) + "\" fill=\"" + s.colour + "\"><title>" + escAttr(s.name + ", " + ch.xName + " = " + p[0] + ", " + S.fmtT(p[1])) + "</title></circle>");
        });
      }
    });
    (ch.extensions || []).forEach(function (e) {
      if (!e.from) return;
      o.push("<line class=\"est\" x1=\"" + X(e.from[0]).toFixed(1) + "\" y1=\"" + Y(e.from[1]).toFixed(1) + "\" x2=\"" + X(e.to[0]).toFixed(1) + "\" y2=\"" + Y(e.to[1]).toFixed(1) + "\" stroke=\"" + e.colour + "\"/>");
      o.push("<circle class=\"pt est\" cx=\"" + X(e.to[0]).toFixed(1) + "\" cy=\"" + Y(e.to[1]).toFixed(1) + "\" r=\"3\" stroke=\"" + e.colour + "\"><title>Estimate, " + S.fmtT(e.to[1]) + "</title></circle>");
    });
    if (ch.marker && ch.marker.x >= xmin && ch.marker.x <= xmax) {
      var mx = X(ch.marker.x);
      o.push("<line class=\"marker\" x1=\"" + mx.toFixed(1) + "\" x2=\"" + mx.toFixed(1) + "\" y1=\"" + T + "\" y2=\"" + (H - B) + "\"/>");
      var anchor = mx > W - 70 ? "end" : "start";
      o.push("<text class=\"mlabel\" x=\"" + (mx + (anchor === "end" ? -5 : 5)).toFixed(1) + "\" y=\"" + (T + 10) + "\" text-anchor=\"" + anchor + "\">" + escAttr(ch.marker.label) + "</text>");
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
      li.innerHTML = "<svg width=\"22\" height=\"8\" aria-hidden=\"true\"><line x1=\"1\" x2=\"21\" y1=\"4\" y2=\"4\" stroke=\"" + s.colour + "\" stroke-width=\"" + (s.emph ? 3 : 2) + "\"" + (s.dash ? " stroke-dasharray=\"" + s.dash.split(" ").map(function (v) { return Math.max(1, Math.round(v * 0.6)); }).join(" ") + "\"" : "") + "/></svg>";
      li.appendChild(document.createTextNode(s.name));
      ul.appendChild(li);
    });
    return ul;
  }
  function table(m) {
    var wrap = el("div", "rank-wrap");
    var t = el("table", "rank" + (m.qualitative || m.noRank ? " qual" : ""));
    var cap = el("caption", "visually-hidden", "Backends at " + m.at);
    t.appendChild(cap);
    var head = el("thead");
    var ranked = !m.qualitative && !m.noRank;
    head.innerHTML = "<tr>" + (ranked ? "<th scope=\"col\" class=\"rk\">#</th>" : "") + "<th scope=\"col\">" + (m.qualitative || m.rows.some(function (e) { return e.b.indexOf(" · ") !== -1; }) ? "Series" : "Backend") + "</th><th scope=\"col\" class=\"tm\">Time at " + m.at + "</th>" +
      (ranked ? "<th scope=\"col\" class=\"rt\">vs fastest</th>" : "") + "<th scope=\"col\" class=\"obs\">Observation</th></tr>";
    t.appendChild(head);
    var body = el("tbody");
    m.rows.forEach(function (e) {
      var tr = el("tr", (e.pick ? "pick" : "") + (e.t == null && !e.label ? " none" : "") + (e.excluded ? " flagged" : ""));
      if (ranked) tr.appendChild(el("td", "rk", e.rank ? String(e.rank) : "·"));
      var name = el("td", "nm");
      var sw = el("span", "dot");
      sw.style.background = colourOf(e.b);
      name.appendChild(sw);
      var repo = S.REPOS[e.b] || S.REPOS[e.b.split(" · ")[0]];
      if (repo) {
        var a = el("a", "repo inline", e.b.replace(/&/g, "&amp;"));
        a.href = repo; a.target = "_blank"; a.rel = "noopener noreferrer";
        a.title = "Source repository (opens in a new tab)";
        name.appendChild(a);
      } else name.appendChild(document.createTextNode(e.b));
      if (e.pick) name.appendChild(el("span", "pick-tag", "outcome"));
      tr.appendChild(name);
      tr.appendChild(el("td", "tm" + (e.kind === "estimate" || e.kind === "interp" ? " est" : ""), timeText(e)));
      if (ranked) tr.appendChild(el("td", "rt", e.ratio ? (e.ratio < 1.005 ? "fastest" : e.ratio.toFixed(2) + "×") : ""));
      var ob = el("td", "obs", (e.note ? "<span class=\"rnote\">" + e.note.charAt(0).toUpperCase() + e.note.slice(1) + ".</span> " : "") + (e.obs || ""));
      tr.appendChild(ob);
      body.appendChild(tr);
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
    holder.innerHTML = chartSVG(ch, w);
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
    var sum = el("summary", "", "<span class=\"ev-h\">Measurements</span><span class=\"ev-refs\">" + m.refs.join(" · ") + "</span>");
    det.appendChild(sum);
    var body = el("div", "ev-body");
    body.appendChild(el("p", "ev-title", m.title));
    if (m.chart) {
      var holder = el("div", "chart-box");
      body.appendChild(holder);
      body.appendChild(legend(m.chart));
      var entry = { holder: holder, chart: m.chart };
      live.push(entry);
      var paint = function () { holder._w = 0; draw(holder, m.chart); };
      det.addEventListener("toggle", function () { if (det.open) paint(); });
      if (opts.open) setTimeout(paint, 0);
    }
    body.appendChild(table(m));
    var foot = el("ul", "ev-foot");
    m.foot.forEach(function (f) { foot.appendChild(el("li", "", f)); });
    body.appendChild(foot);
    det.appendChild(body);
    return det;
  }

  window.Evidence = { model: model, render: render, chartSVG: chartSVG, lines: lines, valueAt: valueAt, OBS: OBS };
})();
