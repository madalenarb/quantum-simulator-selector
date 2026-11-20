/*
 * Decision rules of the Quantum Simulator Selector.
 *
 * Every recommendation below is a measured result from Chapter 5 of the dissertation
 * (Deucalion x86 and A100 nodes, i9-13900KS for density matrices, double precision).
 * The rules follow the two-level framework of Section 5.8: Table 5.9 for the method,
 * Table 5.10 for the backend, and the boxes of Figure 5.13, whose path figPath() returns
 * for every query. The measured times themselves live in js/data.js; where a rule and
 * the measurements disagree by more than 10 % at the size asked, the measurement decides
 * (reconcile()) and the outcome says that it departs from the box of the figure.
 * To extend the selector, add circuits to CIRCUITS, questions to QUESTIONS, a branch to
 * flow() and figPath() and a case to recommend(). The interface reads only the exports.
 */
(function () {
  "use strict";

  var N = "<i>n</i>";
  var DATA = window.SelectorData;

  // Colour of each backend in the figures of Chapter 5 and in the boxes of Figure 5.13.
  var COLOURS = {
    "Qiskit Aer": "#CC3311",
    "Qiskit Aer Stabilizer": "#CC3311",
    "Qiskit Aer, one rank per node": "#E08A75",
    "Qulacs": "#EE7733",
    "mpiQulacs": "#EE7733",
    "CUDA-Q": "#AA3377",
    "CUDA-Q Stim": "#AA3377",
    "Qibo": "#332288",
    "Qibo NumPy": "#332288",
    "Qibo Clifford": "#332288",
    "qibojit": "#000000",
    "QuEST": "#009988",
    "Trajectory sampling": "#595959",
    "No feasible state vector": "#595959",
    "Beyond the GPUs used": "#595959"
  };
  // Fill of the outcome boxes of Figure 5.13, by outline colour.
  var TINTS = {
    "#CC3311": "#F6DCD7", "#EE7733": "#FCE8DC", "#AA3377": "#F1DCE8", "#332288": "#DCD9EB",
    "#009988": "#D4EEEB", "#000000": "#EBEBEB", "#595959": "#F2F2F2"
  };
  function colourOf(name) { return COLOURS[name] || "#595959"; }
  function tintOf(name) { return TINTS[colourOf(name)] || "#F2F2F2"; }

  // Source repositories, linked from every backend name in the readout.
  var REPOS = {
    "Qiskit Aer": "https://github.com/Qiskit/qiskit-aer",
    "Qiskit Aer Stabilizer": "https://github.com/Qiskit/qiskit-aer",
    "Qiskit Aer, one rank per node": "https://github.com/Qiskit/qiskit-aer",
    "CUDA-Q": "https://github.com/NVIDIA/cuda-quantum",
    "CUDA-Q Stim": "https://github.com/NVIDIA/cuda-quantum",
    "Qulacs": "https://github.com/qulacs/qulacs",
    "mpiQulacs": "https://github.com/qulacs/qulacs",
    "Qibo": "https://github.com/qiboteam/qibo",
    "Qibo NumPy": "https://github.com/qiboteam/qibo",
    "Qibo Clifford": "https://github.com/qiboteam/qibo",
    "qibojit": "https://github.com/qiboteam/qibojit",
    "QuEST": "https://github.com/QuEST-Kit/QuEST"
  };

  var UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
  // Size of 2^l bytes, as HTML.
  function bytesLog2(l) {
    var u = Math.floor(l / 10);
    if (u > 8) return "2<sup>" + l + "</sup> bytes";
    return Math.pow(2, l - 10 * u) + " " + UNITS[u];
  }
  function svBytes(n) { return bytesLog2(n + 4); }

  // Largest double-precision state each configuration holds (Sections 5.3, 5.4 and 5.8;
  // a Deucalion x86 job has 242 GiB per node, so 64 nodes hold up to n = 39).
  var LIMITS = { cpuNode: 33, cpuMeasured: 34, cpuCluster: 39, gpu8: 35, gpu16: 36, dm: 16 };

  // level: the level of the framework the question belongs to (Figure 5.13).
  var QUESTIONS = {
    noise: {
      level: 1,
      short: "Noise",
      prompt: "Does the simulation need to model noise exactly?",
      help: "Exact noisy evolution replaces the state vector with a density matrix of 4ⁿ elements, which roughly halves the number of qubits that fit in the same memory (Section 5.8).",
      options: function () {
        return [
          { v: "no", t: "No, an ideal circuit", d: "Unitary evolution of a pure state" },
          { v: "yes", t: "Yes, exact noisy evolution", d: "A density matrix under noise channels" }
        ];
      }
    },
    structure: {
      level: 1,
      short: "Circuits",
      multi: "circuits",
      prompt: "Which circuits will you simulate?",
      help: "Pick one or several of the circuits benchmarked in the dissertation, or read your own from an OpenQASM file. Each circuit belongs to one of the structure classes of Table 5.9, and the class decides whether a method cheaper than the dense state vector applies. A circuit of your own is placed by its structure, so its result is a best guess."
    },
    output: {
      level: 1,
      short: "Output",
      prompt: "What must the run return?",
      help: "Tasks that need only measurement samples use weak simulation, whereas tasks that need exact amplitudes or probabilities call for strong simulation (Section 2.2.5).",
      options: function (a) {
        var list = [
          { v: "samples", t: "Measurement samples", d: "Counts or bitstrings (weak simulation)" },
          { v: "state", t: "The full state", d: "Amplitudes, fidelity or exact expectation values (strong simulation)" }
        ];
        if (groupsOf(a).some(function (g) { return g.cls === "clifford"; })) {
          list.splice(1, 0, { v: "tableau", t: "The stabiliser tableau", d: "For the Clifford circuits; the others then return the full state" });
        }
        return list;
      }
    },
    n: {
      level: 1,
      short: "Qubits",
      prompt: "How many qubits?",
      help: function (a) {
        return a.noise === "yes"
          ? "A density matrix has 4ⁿ elements of 16 bytes in double precision, so its memory grows fourfold with every qubit."
          : "A dense state vector needs 16 bytes per amplitude in double precision, so its memory doubles with every qubit. Stabiliser and tensor-network methods avoid that growth.";
      }
    },
    hw: {
      level: 2,
      short: "Hardware",
      multi: "toggle",
      prompt: "Which hardware can you use?",
      help: "Pick one or both. Whether the run executes on GPUs is the first question of the second level and is left to the user, since at small sizes one CPU thread can finish before one GPU (Section 5.8).",
      options: function () {
        return [
          { v: "cpu", t: "CPUs", d: "x86 nodes with two AMD EPYC 7742 (128 cores), up to 64 nodes" },
          { v: "gpu", t: "NVIDIA A100 GPUs", d: "40 or 80 GB each, four per node over NVLink" }
        ];
      }
    },
    cpuScale: {
      level: 2,
      short: "CPU scale",
      prompt: "How much of the CPU cluster will you use?",
      help: "Up to 33 qubits one node holds the state, so further nodes are optional. Thread scaling was measured on one node, and strong scaling on the 30-qubit QFT up to 64 nodes (Sections 5.2 and 5.3).",
      options: function () {
        return [
          { v: "thread", t: "One thread", d: "A serial run" },
          { v: "node", t: "One full node", d: "128 threads, one per core" },
          { v: "few", t: "2 to 16 nodes", d: "MPI across a few nodes" },
          { v: "many", t: "32 or 64 nodes", d: "MPI across many nodes" }
        ];
      }
    },
    gpuCount: {
      level: 2,
      short: "GPUs",
      prompt: "How many A100-80 GPUs will hold the state?",
      help: "At 35 qubits the 512 GiB state no longer fits one node of four GPUs, so the exchanges cross InfiniBand (Section 5.4.2).",
      options: function () {
        return [
          { v: "eight", t: "Eight GPUs", d: "Two nodes, 640 GB in total" },
          { v: "sixteen", t: "Sixteen GPUs", d: "Four nodes, 1280 GB in total" }
        ];
      }
    }
  };

  // The four circuit structures of the first level, named as in Table 5.9.
  var CLASSES = {
    clifford: { name: "Clifford-only", d: "H, S, CNOT and Paulis, so stabiliser simulation applies" },
    lowent: { name: "Low-bond-dimension circuits", d: "Such as GHZ and a shallow HEA: the Schmidt rank stays small across every cut, so a tensor network reaches far" },
    deep: { name: "Growing local entanglement", d: "Such as a deeper HEA: local gates whose entanglement builds up layer by layer" },
    dense: { name: "Densely connected non-Clifford", d: "Such as the QFT: every pair of qubits interacts, and the dense state vector reached furthest" }
  };
  var CLASS_ORDER = ["clifford", "lowent", "deep", "dense"];
  // Choices for a circuit the researcher describes, including "not sure".
  var OTHER_CLASSES = CLASS_ORDER.concat(["unsure"]);
  var UNSURE = { name: "Not sure", d: "Treated as densely connected, which the dense state vector covers for any circuit" };

  // How confidently a circuit maps to its class. Every circuit of the catalogue is measured;
  // the other levels apply to a circuit that the researcher adds.
  var CONFIDENCE = {
    measured: { label: "Measured", d: "Benchmarked in this dissertation" },
    user: { label: "Your mapping", d: "Classified by you" },
    file: { label: "From your file", d: "Classified from the OpenQASM file you loaded; the Clifford test is exact, the entanglement class is a heuristic" },
    unsure: { label: "Structure unknown", d: "Treated as densely connected" }
  };

  // Catalogue of circuits a researcher can pick: the circuits that the dissertation ran
  // (Section 4.2 and, for GHZ and the other depths of the HEA, Section 5.7). Add entries
  // here as new workloads are measured.
  var CIRCUITS = [
    { id: "clifford", name: "Clifford circuit, ten layers", cls: "clifford", conf: "measured", note: "As a state vector and, up to n = 60, on the stabiliser backends" },
    { id: "ghz", name: "GHZ state preparation", cls: "lowent", conf: "measured", note: "As a tensor network up to n = 500" },
    { id: "hea1", name: "Hardware-efficient ansatz, one layer", cls: "lowent", conf: "measured", note: "As a tensor network up to n = 500" },
    { id: "hea", name: "Hardware-efficient ansatz, several layers", cls: "deep", conf: "measured", note: "Eight CNOT rings as a state vector; twenty as a tensor network" },
    { id: "qft", name: "Quantum Fourier transform", cls: "dense", conf: "measured", note: "In every regime, up to 64 CPU nodes and sixteen GPUs" }
  ];
  var CIRCUIT_BY_ID = {};
  CIRCUITS.forEach(function (c) { CIRCUIT_BY_ID[c.id] = c; });

  // n: largest double-precision state the platform holds; measured: largest size run on it in
  // the dissertation (null if the platform was not used for this representation).
  var SV_PLATFORMS = [
    { label: "One A100-40", n: 31, measured: 31 },
    { label: "One A100-80", n: 32, measured: 32 },
    { label: "One x86 node", n: 33, measured: 30 },
    { label: "One GPU node, 4× A100-80", n: 34, measured: 34 },
    { label: "Two GPU nodes, 8× A100-80", n: 35, measured: 35 },
    { label: "Four GPU nodes, 16× A100-80", n: 36, measured: 35 },
    { label: "64 x86 nodes", n: 39, measured: 34 }
  ];
  var DM_PLATFORMS = [
    { label: "i9-13900KS platform", n: 16, measured: 13 },
    { label: "One x86 job, 242 GiB", n: 16, measured: null }
  ];

  function answered(a, id) {
    if (id === "structure") return (a.circuits && a.circuits.length > 0) || !!(a.other && a.other.name && a.other.cls);
    var v = a[id];
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== null;
  }

  // Selected circuits grouped by structure class, in a fixed order.
  function groupsOf(a) {
    var byCls = {};
    (a.circuits || []).forEach(function (id) {
      var c = CIRCUIT_BY_ID[id];
      if (!c) return;
      (byCls[c.cls] = byCls[c.cls] || []).push(c);
    });
    if (a.other && a.other.name && a.other.cls) {
      var unsure = a.other.cls === "unsure";
      var cls = unsure ? "dense" : a.other.cls;
      var fromFile = a.other.src === "qasm" && !unsure;
      (byCls[cls] = byCls[cls] || []).push({
        id: "other", name: a.other.name, cls: cls,
        conf: unsure ? "unsure" : fromFile ? "file" : "user",
        note: unsure ? "Structure unknown, so treated as densely connected" : fromFile ? "Classified from your OpenQASM file" : "Classified by you"
      });
    }
    return CLASS_ORDER.filter(function (k) { return byCls[k]; }).map(function (k) {
      var list = byCls[k];
      var doubtful = list.filter(function (c) { return c.conf === "user" || c.conf === "unsure" || c.conf === "file"; });
      return {
        cls: k,
        circuits: list,
        unsure: doubtful,
        conf: doubtful.length === list.length ? "inconclusive" : doubtful.length ? "mixed" : "measured"
      };
    });
  }

  // The tableau only exists for Clifford circuits; the others then need the full state.
  function effOutput(a, cls) {
    return a.output === "tableau" && cls !== "clifford" ? "state" : a.output;
  }

  function hwList(a) {
    var h = a.hw;
    if (!h) return [];
    return Array.isArray(h) ? h : [h];
  }

  function isTN(m) { return m === "tn" || m === "tn-deep"; }
  function isStab(m) { return m === "stab-aer" || m === "stab-qibo"; }

  function method(a) {
    if (a.noise === "yes") return "dm";
    var s = a.structure, o = a.output;
    if (s === "clifford") {
      if (o === "samples") return "stab-aer";
      if (o === "tableau") return "stab-qibo";
      return "sv";
    }
    if (!a.noTN && s === "lowent" && o === "samples") return "tn";
    if (!a.noTN && s === "deep" && o === "samples" && a.n >= 35) return "tn-deep";
    return "sv";
  }

  function groupBase(a, g) {
    var b = {};
    for (var k in a) b[k] = a[k];
    b.structure = g.cls;
    b.output = effOutput(a, g.cls);
    return b;
  }
  function methodOf(a, g) { return method(groupBase(a, g)); }

  // Ordered list of the questions this query needs; done is true when all are answered.
  function flow(a) {
    var qs = ["noise"];
    if (!answered(a, "noise")) return { qs: qs, done: false };
    if (a.noise === "yes") {
      qs.push("n");
      return { qs: qs, done: answered(a, "n") };
    }
    qs.push("structure");
    if (!answered(a, "structure")) return { qs: qs, done: false };
    qs.push("output");
    if (!answered(a, "output")) return { qs: qs, done: false };
    qs.push("n");
    if (!answered(a, "n")) return { qs: qs, done: false };

    var groups = groupsOf(a);
    var methods = groups.map(function (g) { return methodOf(a, g); });
    var anyTN = methods.some(isTN);
    var anySV = methods.some(function (m) { return m === "sv"; });
    // Hardware only matters for tensor networks and for state vectors that some machine holds.
    if (!anyTN && !(anySV && a.n <= LIMITS.cpuCluster)) return { qs: qs, done: true };
    qs.push("hw");
    if (!answered(a, "hw")) return { qs: qs, done: false };

    var hw = hwList(a);
    var hasGpu = hw.indexOf("gpu") !== -1, hasCpu = hw.indexOf("cpu") !== -1;
    // Tensor networks ran on A100 GPUs; without GPUs those groups fall back to the state vector.
    var svGroups = groups.filter(function (g, i) { return methods[i] === "sv" || (isTN(methods[i]) && !hasGpu); });
    if (!svGroups.length || a.n > LIMITS.cpuCluster) return { qs: qs, done: true };

    if (hasCpu && a.n <= LIMITS.cpuNode) {
      qs.push("cpuScale");
      if (!answered(a, "cpuScale")) return { qs: qs, done: false };
    }
    if (hasGpu && a.n === LIMITS.gpu8) {
      qs.push("gpuCount");
      if (!answered(a, "gpuCount")) return { qs: qs, done: false };
    }
    return { qs: qs, done: true };
  }

  function circuitClass(a) {
    if (a.structure === "dense") return "qft";
    if (a.structure === "clifford") return "clifford";
    return "hea";
  }
  var CIRCUIT_NAME = { qft: "QFT", hea: "HEA", clifford: "Clifford circuit" };
  var PANEL = {
    thread: { qft: "a", hea: "b", clifford: "c" },
    node: { qft: "d", hea: "e", clifford: "f" },
    gpu: { qft: "g", hea: "h", clifford: "i" }
  };
  var WHERE = { thread: "on one CPU thread", node: "on the full x86 node (128 threads)", gpu: "on one A100-40" };

  /* ---------- measurements (js/data.js) ---------- */
  // Smallest size of the single-node sweeps (Figure 5.1); smaller queries use it as the nearest measurement.
  var SWEEP_MIN = 9;
  function noteAt(reg, c, b, n) {
    var k = DATA && DATA.notes[reg + "|" + c + "|" + b];
    return (k && k[String(n)]) || null;
  }
  // The flagged full-node points of the Figure 5.1 caption are not full-node times.
  function excluded(reg, note) { return reg === "node" && !!note; }
  // Every backend measured at size n, fastest first; flagged points carry their note.
  function sweepRank(reg, c, n) {
    var out = [];
    var s = DATA && DATA.sweep[reg] && DATA.sweep[reg][c];
    if (!s) return out;
    Object.keys(s).forEach(function (b) {
      for (var i = 0; i < s[b].length; i++) {
        if (s[b][i][0] === n) { out.push({ b: b, t: s[b][i][1], note: noteAt(reg, c, b, n) }); break; }
      }
    });
    out.sort(function (x, y) { return x.t - y.t; });
    return out;
  }
  function sweepAt(reg, c, n) {
    return sweepRank(reg, c, n).filter(function (e) { return !excluded(reg, e.note); });
  }
  function display(b) { return b; }
  function times(x) { return x >= 10 ? String(Math.round(x)) : x >= 2 ? x.toFixed(1) : x.toFixed(2); }
  function fmtT(t) {
    if (t < 1e-3) return (+(t * 1e6).toPrecision(3)) + " µs";
    if (t < 1) return (+(t * 1000).toPrecision(3)) + " ms";
    if (t < 1000) return (+t.toPrecision(3)) + " s";
    if (t < 7200) return Math.round(t / 60) + " min";
    return (+(t / 3600).toPrecision(3)) + " h";
  }
  function pct(slow, fast) { return Math.max(1, Math.round((slow / fast - 1) * 100)); }

  // Keep the rule's backend unless the measurement at this size says otherwise by more than 10 %.
  function reconcile(r, reg, c, n) {
    var nEff = Math.max(n, SWEEP_MIN);
    var at = N + " = " + nEff + (nEff === n ? "" : ", the smallest size measured");
    var mineAll = null;
    sweepRank(reg, c, nEff).forEach(function (e) { if (e.b === r.b) mineAll = e; });
    if (mineAll && excluded(reg, mineAll.note)) {
      r.caveats = (r.caveats || []).concat(["At " + at + " the " + r.b + " point " + mineAll.note + "."]);
      return r;
    }
    var rank = sweepAt(reg, c, nEff);
    if (rank.length < 2) return r;
    var top = rank[0], mine = null;
    rank.forEach(function (e) { if (e.b === r.b) mine = e; });
    if (mine === top) {
      if (rank[1].t <= top.t * 1.10) {
        r.caveats = (r.caveats || []).concat(["At " + at + ", " + display(rank[1].b) + " was within " + pct(rank[1].t, top.t) + " % of " + display(top.b) + ", a near tie."]);
      }
      return r;
    }
    if (mine && mine.t <= top.t * 1.10) {
      r.caveats = (r.caveats || []).concat(["At " + at + ", " + display(top.b) + " measured " + pct(mine.t, top.t) + " % faster than " + display(mine.b) + ", a near tie."]);
      return r;
    }
    var second = rank[1];
    return {
      b: display(top.b),
      regime: r.regime,
      ev: "At " + at + ", " + display(top.b) + " was the fastest measured backend " + WHERE[reg] + ", " + times(second.t / top.t) +
        " times ahead of " + display(second.b) + " (" + fmtT(top.t) + " against " + fmtT(second.t) + ", Figure 5.1" + PANEL[reg][c] + "). " + CONTEXT[reg],
      alt: "<b>" + display(second.b) + "</b>, second at this size",
      caveats: (r.caveats || []).concat(["The measurement at this size overrides the general rule for this regime, which gives " + r.b + " (Section 5.1)."]),
      src: r.src
    };
  }
  var CONTEXT = {
    thread: "Below the transition at " + N + " ≈ 11 to 18, fixed costs set the time, and they favour Qulacs and, on the QFT, QuEST (Section 5.1).",
    node: "On the full node the threads shorten the state updates but not the fixed costs, so at small sizes the ranking follows the fixed costs (Section 5.1).",
    gpu: "On one GPU, fixed costs set the time up to about " + N + " = 20 (Section 5.1)."
  };
  // On the full node at small sizes, one thread can beat 128.
  function oneThreadCaveat(r, c, n) {
    var nEff = Math.max(n, SWEEP_MIN);
    var t = sweepAt("thread", c, nEff)[0], m = sweepAt("node", c, nEff)[0];
    if (t && m && t.t < m.t * 0.95) {
      r.caveats = (r.caveats || []).concat(["At " + N + " = " + nEff + " one thread is faster than the full node, with " + display(t.b) + " taking " + fmtT(t.t) + " on one thread against " + fmtT(m.t) + " for the fastest 128-thread run (Figure 5.1)."]);
    }
    return r;
  }

  function svExtraCaveats(a) {
    var list = [];
    if (a.structure === "lowent") {
      list.push("State-vector rankings were measured on the HEA, the closest benchmark to a low-entanglement circuit.");
      if (a.output === "state") list.push("A tensor-network contraction that returns the full state reached the GPU memory limit at " + N + " = 30, before the state vector did.");
    }
    if (a.structure === "deep" && a.output === "samples" && !a.noTN) {
      list.push("A tensor network is also viable for deep circuits, since with twenty HEA layers it reached " + N + " = 36, but the state vector holds these sizes.");
    }
    if (a.structure === "clifford" && a.output === "state") {
      list.push("Stabiliser methods return samples or the tableau; exact amplitudes need the state vector.");
    }
    return list;
  }

  // No machine in the study holds the state.
  function infeasible(a) {
    var n = a.n, r = {
      b: "No feasible state vector",
      regime: "Dense state vector · " + svBytes(n),
      ev: "At " + N + " = " + n + " a double-precision state vector needs " + svBytes(n) + ", more than the 64 x86 nodes of this dissertation hold together (about 15 TiB of job memory, enough up to " + N + " = 39).",
      out: "Beyond the memory of every platform used in this dissertation.",
      caveats: [],
      src: ["Section 5.8"],
      evk: { type: "none" }
    };
    if (a.structure === "clifford") r.alt = "<b>Qiskit Aer Stabilizer</b> or <b>Qibo Clifford</b>, if samples or the tableau are enough";
    else if (a.structure === "lowent") r.alt = "a <b>CUDA-Q</b> tensor network on an A100, which reached " + N + " = 500 when samples suffice";
    else if (a.structure === "deep") r.alt = "a <b>CUDA-Q</b> tensor network on an A100, which reached " + N + " = 36 with twenty HEA layers and goes further for shallower circuits";
    else r.note = "No method measured here reaches this size for densely connected circuits; the tensor network of the QFT reached its time limit at " + N + " = 26.";
    return r;
  }

  // The state needs more than the sixteen GPUs of the study.
  function gpuBeyond(a) {
    var n = a.n;
    return {
      b: "Beyond the GPUs used",
      regime: "Dense state vector · " + svBytes(n) + " · more than sixteen A100-80 hold",
      ev: "The sixteen A100-80 GPUs used in this dissertation hold a double-precision state up to " + N + " = 36 (1 TiB), and at " + N + " = " + n + " it needs " + svBytes(n) + ".",
      alt: n <= LIMITS.cpuCluster ? "<b>mpiQulacs</b> on 64 x86 nodes, which hold the state up to " + N + " = 39" : null,
      out: "Beyond the GPU memory used in this dissertation.",
      caveats: [],
      src: ["Section 5.4.2", "Section 5.8"],
      evk: { type: "none" }
    };
  }

  function svCPU(a, c) {
    var n = a.n, r;
    if (n > LIMITS.cpuCluster) return infeasible(a);
    if (n > LIMITS.cpuNode) {
      r = {
        b: "mpiQulacs",
        regime: "Dense state vector · 64 x86 nodes · one MPI rank per node",
        ev: "From " + N + " = 34 the state (256 GiB) needs more than one node, and mpiQulacs was the fastest backend to reach that size, on 64 nodes with 4 GiB of state per node (Section 5.3).",
        alt: "<b>QuEST</b>, which also reached " + N + " = 34 on 64 nodes, about three times slower",
        caveats: ["Multi-node series measured on the QFT."],
        src: ["Figure 5.4", "Section 5.3"],
        evk: { type: "weak", nodes: 64 }
      };
      if (n > LIMITS.cpuMeasured) r.out = "The multi-node series ended at " + N + " = 34; 64 x86 nodes hold the state up to " + N + " = 39 (" + svBytes(39) + ").";
      return r;
    }
    var s = a.cpuScale;
    if (s === "thread") {
      var src = ["Figure 5.1" + PANEL.thread[c], "Section 5.1"];
      if (c === "qft" && n >= 21 && n <= 28) {
        r = {
          b: "Qiskit Aer",
          regime: "Dense state vector · one CPU thread",
          ev: "On the QFT, Qiskit Aer overtakes Qulacs at " + N + " = 21 and runs 1.6 to 1.8 times faster up to " + N + " = 28, because fusion turns the 1378 gates into about 106 blocks at " + N + " = 26 (Section 5.1).",
          alt: "<b>Qulacs</b>, which leads up to " + N + " = 20"
        };
      } else if (c === "qft" && n >= 29) {
        r = {
          b: "Qulacs",
          regime: "Dense state vector · one CPU thread",
          ev: "At " + N + " = 29 and 30 the single-thread times of Qulacs and Qiskit Aer on the QFT nearly coincide (Section 5.1).",
          alt: "<b>Qiskit Aer</b>, within a few percent"
        };
      } else if (c === "clifford" && n >= 13 && n <= 28) {
        r = {
          b: "QuEST",
          regime: "Dense state vector · one CPU thread",
          ev: "On the Clifford circuit, QuEST leads Qulacs from " + N + " = 13 to 28, running 1.4 to 1.9 times faster from " + N + " = 16 (Section 5.1).",
          alt: "<b>Qulacs</b> outside that range"
        };
      } else if (c === "hea") {
        r = {
          b: "Qulacs",
          regime: "Dense state vector · one CPU thread",
          ev: "On the HEA, Qulacs stays ahead on one thread because each fused block of Qiskit Aer costs about twelve Qulacs gates, so Qiskit Aer remains about 1.5 times slower up to " + N + " = 30 (Section 5.1).",
          alt: "<b>Qiskit Aer</b> with 128 threads, if a full node is available"
        };
      } else {
        r = {
          b: "Qulacs",
          regime: "Dense state vector · one CPU thread",
          ev: "On one thread, Qulacs is at or near the front on every circuit, since each gate goes straight to a native AVX2 kernel, at 0.6 to 16 µs per gate at " + N + " = 9 against 26 to 40 µs for Qiskit Aer (Section 5.1)."
        };
      }
      r.src = src;
      r.caveats = r.caveats || [];
      r = reconcile(r, "thread", c, n);
      r.regime = "Dense state vector · one CPU thread";
      r.src = src;
      r.evk = { type: "sweep", reg: "thread", c: c };
      if (n >= 31) r.out = "The single-thread sweeps ended at " + N + " = 30; one node holds the state up to " + N + " = 33.";
      return r;
    }
    if (s === "node") {
      var srcN = ["Figure 5.1" + PANEL.node[c], "Sections 5.1 and 5.2"];
      var cross = { qft: 18, hea: 22, clifford: 26 }[c];
      var gain = { qft: "about 60", hea: "about 65", clifford: "almost 100" }[c];
      if (n >= cross) {
        r = {
          b: "Qiskit Aer",
          regime: "Dense state vector · one x86 node · 128 threads",
          ev: "With 128 threads, Qiskit Aer leads the " + CIRCUIT_NAME[c] + " from " + N + " = " + cross + ". At " + N + " = 30 it runs " + gain + " times faster than on one thread, because fusion reduces the passes over the state, while on the 30-qubit QFT the backends that apply one gate per pass stop gaining at 16 and 64 threads, consistent with a memory-bandwidth limit (Sections 5.1 and 5.2).",
          alt: c === "clifford" ? "<b>QuEST</b>, second on this circuit at " + N + " = 28" : "<b>Qulacs</b>, second on this circuit at the largest sizes"
        };
      } else if (c === "clifford") {
        r = {
          b: "QuEST",
          regime: "Dense state vector · one x86 node · 128 threads",
          ev: "On the full node, QuEST remains the fastest on the Clifford circuit through " + N + " = 25; Qiskit Aer leads from " + N + " = 26 (Section 5.1).",
          caveats: ["Up to " + N + " = 13, 128 threads bring no speedup on this circuit, and Qulacs even runs slower than on one thread."]
        };
      } else {
        r = {
          b: "Qulacs",
          regime: "Dense state vector · one x86 node · 128 threads",
          ev: "Below " + N + " = " + cross + " on the full node, Qulacs has the lowest fixed costs, and Qiskit Aer takes the lead only once the state updates dominate. Up to " + N + " = 13, multithreading brings no speedup except for Qiskit Aer on the QFT (Section 5.1).",
          alt: "<b>Qiskit Aer</b> from " + N + " = " + cross
        };
      }
      r.caveats = r.caveats || [];
      r = reconcile(r, "node", c, n);
      r.regime = "Dense state vector · one x86 node · 128 threads";
      r = oneThreadCaveat(r, c, n);
      r.src = srcN;
      r.evk = { type: "sweep", reg: "node", c: c };
      if (n >= 31) r.out = "The full-node sweeps ended at " + N + " = 30; one node holds the state up to " + N + " = 33.";
      return r;
    }
    if (s === "few") {
      return {
        b: "Qiskit Aer",
        regime: "Dense state vector · 2 to 16 x86 nodes · 128 MPI ranks per node",
        ev: "With one MPI rank per core, Qiskit Aer was the fastest backend at every node count from one to 16, 3.7 to 6.3 times faster than mpiQulacs at " + N + " = 30. Its 16-node time (1.08 s) was even shorter than mpiQulacs on 64 nodes (1.20 s) (Section 5.3).",
        alt: "<b>mpiQulacs</b>, which keeps scaling beyond 16 nodes",
        caveats: [
          "Measured with 128 ranks per node, one per core. With one rank per node its distributed engine keeps one core per node busy, and it ran about an order of magnitude behind mpiQulacs.",
          "Measured on the QFT, at " + N + " = 30 for strong scaling and with 4 GiB of state per node for weak scaling."
        ],
        src: ["Table 5.3", "Figures 5.3 and 5.4", "Section 5.3"],
        evk: { type: "strong", nodes: 16 }
      };
    }
    return {
      b: "mpiQulacs",
      regime: "Dense state vector · 32 or 64 x86 nodes · one MPI rank per node",
      ev: "On 32 and 64 nodes mpiQulacs is the fastest backend measured, running 53 times faster on 64 nodes than on one at " + N + " = 30. Its last step shortens the run by more than the ideal factor of two, at the node count where each node’s 256 MiB share of the state first falls below the 512 MiB of L3 cache (Section 5.3).",
      alt: "<b>Qiskit Aer</b> on 16 nodes, which was already faster (1.08 s against 1.20 s)",
      caveats: [
        "Measured on the QFT at " + N + " = 30 and with 4 GiB of state per node.",
        "The 128-ranks-per-node layout of Qiskit Aer was measured up to 16 nodes, so beyond that count the comparison covers mpiQulacs, QuEST and Qiskit Aer with one rank per node (Section 6.2)."
      ],
      src: ["Table 5.3", "Figures 5.3 and 5.4", "Section 5.3"],
      evk: { type: "strong", nodes: 64 }
    };
  }

  function svGPU(a, c) {
    var n = a.n, r;
    var sweepSrc = ["Figure 5.1" + PANEL.gpu[c], "Section 5.1"];
    if (n > LIMITS.gpu16) return gpuBeyond(a);
    // n ≤ 23, one GPU
    if (n <= 23) {
      r = {
        b: "Qulacs",
        regime: "Dense state vector · one A100 GPU",
        ev: "On one A100, Qulacs leads every circuit up to " + N + " = 23 and runs at least six times faster than Qiskit Aer, CUDA-Q and qibojit up to " + N + " = 20, because each gate passes straight to a native CUDA kernel at a fixed cost of 13 to 20 µs per gate (Section 5.1).",
        alt: n <= 16 ? "<b>QuEST</b>, the second fastest up to " + N + " = 16" : null,
        caveats: ["Its timed call covers the gates and the allocation of the state, without any copy to host memory."]
      };
      r = reconcile(r, "gpu", c, n);
      r.regime = "Dense state vector · one A100-40";
      r.src = sweepSrc;
      r.evk = { type: "sweep", reg: "gpu", c: c };
      return r;
    }
    var mgpuSrc = ["Figures 5.6 and 5.7", "Table 5.7", "Section 5.4.2"];
    // n ≥ 35, across nodes
    if (n >= LIMITS.gpu8) {
      var sixteen = n === LIMITS.gpu16 || a.gpuCount === "sixteen";
      if (sixteen) {
        r = {
          b: "Qiskit Aer",
          regime: "Dense state vector · 16 A100-80 over four nodes",
          ev: "On sixteen GPUs, Qiskit Aer benefits more from the extra GPUs and overtakes CUDA-Q, running 1.1 to 1.3 times faster (Section 5.4.2).",
          alt: n === LIMITS.gpu8 ? "<b>CUDA-Q</b>, ahead on eight GPUs" : null
        };
      } else {
        r = {
          b: "CUDA-Q",
          regime: "Dense state vector · 8 A100-80 over two nodes",
          ev: "At " + N + " = 35 the 512 GiB state needs a second node, so the exchanges cross InfiniBand. On eight GPUs CUDA-Q stays about 1.3 times ahead of Qiskit Aer, although crossing the node boundary slows it about eight times against about two and a half for Qiskit Aer (Section 5.4.2).",
          alt: "<b>Qiskit Aer</b>, ahead on sixteen GPUs"
        };
      }
      r.caveats = [
        "Under the default UCX settings of Deucalion, each GPU swapped data at about 0.9 GB/s across nodes, two orders of magnitude below NVLink. Transport tuning could reduce this cost and change the relative performance (Sections 5.4.2 and 6.2).",
        "Multi-GPU series measured on the QFT."
      ];
      if (n === LIMITS.gpu8) r.caveats.push("QuEST holds at most 31 qubits of the state per GPU in distributed runs, so it reaches " + N + " = 35 only on sixteen GPUs.");
      if (n === LIMITS.gpu16) {
        r.out = "The multi-GPU series ended at " + N + " = 35. Sixteen A100-80 hold the 1 TiB state at " + N + " = 36; eight do not.";
        r.caveats.push("QuEST would need 32 GPUs at " + N + " = 36, since it holds at most 31 qubits per GPU in distributed runs.");
      }
      r.src = mgpuSrc;
      r.evk = { type: "mgpu", c: c, gpus: sixteen ? 16 : 8 };
      return r;
    }
    // n = 31 to 34, the GPUs of one node
    if (n >= 31) {
      r = {
        b: "CUDA-Q",
        regime: "Dense state vector · " + (n === 34 ? "four" : n === 33 ? "two to four" : "one to four") + " A100-80 GPUs of one node",
        ev: "With the state left on the GPUs, CUDA-Q was the fastest of the three multi-GPU backends within one node at every size measured, leading Qiskit Aer by 3.6 to 4.2 times on four GPUs from " + N + " = 32 to 34. Crossing to a second node slowed all three under the default UCX settings of Deucalion, so one node gave the fastest time at every size it holds (Sections 5.4.2 and 5.8).",
        alt: "<b>Qiskit Aer</b>, second within the node, which exchanges directly between GPUs when the CUDA IPC transport of UCX is enabled",
        caveats: ["Rests on runs that leave the state on the GPUs, which suffices when only samples or a single probability are needed (Section 5.8)."],
        src: mgpuSrc.concat(["Table 5.5"]),
        evk: { type: "mgpu", c: c, gpus: 4 }
      };
      if (n === 31) r.caveats.push("On one A100-40, whose largest state is " + N + " = 31, the single-GPU comparison of Figure 5.1 stops at " + N + " = 30, since at " + N + " = 31 only QuEST returned results on all three circuits, Qiskit Aer on the QFT and the HEA, and CUDA-Q on the QFT (Section 5.8).");
      if (n < 34) r.caveats.push("More GPUs within the node still shorten the run, and four GPUs cut the " + N + " = 32 QFT time by more than half (Section 5.4.1).");
      if (n >= 33) r.caveats.push("QuEST holds at most 31 qubits per GPU in distributed runs, so at " + N + " = " + n + " it needs " + (n === 33 ? "all four GPUs of the node" : "eight GPUs, two nodes") + ".");
      r.caveats.push(c === "qft" ? "The comparison of the three multi-GPU backends was measured on the QFT." : "The comparison of the three multi-GPU backends was measured on the QFT; CUDA-Q alone also ran the HEA on one, two and four GPUs (Section 5.4.1).");
      return r;
    }
    // n = 24 to 30, the one-GPU comparison
    var hostCaveat = "Rests on runs that copy the state to host memory, as computing the fidelity against a reference requires. The times of Qiskit Aer and CUDA-Q include that copy; those of Qulacs, qibojit and QuEST do not (Sections 4.4.1 and 5.8).";
    var deviceCaveat = "With the state left on the GPU, CUDA-Q was about four times faster than Qiskit Aer on one A100-80 on the QFT at " + N + " = 30 (Section 5.4.2).";
    if (c === "qft") {
      r = {
        b: "Qiskit Aer",
        regime: "Dense state vector · one A100-40 · state copied to host",
        ev: "Qiskit Aer leads the QFT on one A100-40 from " + N + " = 24 to 30, running 1.1 to 1.7 times faster than CUDA-Q and 4.4 times faster than Qulacs at " + N + " = 30, which is consistent with its fusion of controlled rotations into diagonal operations (Section 5.1).",
        alt: "<b>CUDA-Q</b>, 1.1 to 1.7 times behind on this circuit",
        caveats: [hostCaveat, deviceCaveat]
      };
    } else if (n === 24) {
      r = {
        b: "Qulacs",
        regime: "Dense state vector · one A100-40",
        ev: "At " + N + " = 24 Qulacs still leads the " + CIRCUIT_NAME[c] + " on one A100-40, as Figure 5.13 records, and CUDA-Q is the fastest from " + N + " = 25. Each Qulacs gate passes straight to a native CUDA kernel, which gives it the lowest fixed costs (Section 5.1).",
        alt: "<b>CUDA-Q</b>, the fastest on this circuit from " + N + " = 25",
        caveats: ["The timed call of Qulacs excludes the copy of the state to host memory, whereas those of Qiskit Aer and CUDA-Q include it (Section 4.4.1)."]
      };
    } else {
      r = {
        b: "CUDA-Q",
        regime: "Dense state vector · one A100-40 · state copied to host",
        ev: "On the HEA and the Clifford circuit, which contain no controlled rotations, CUDA-Q is the fastest on one A100-40 from " + N + " = 25. At " + N + " = 30 it is about 3 times faster than Qulacs on the HEA and 1.3 times on the Clifford circuit, so the time that fusion saves outweighs the cost of the copy to host memory (Section 5.1).",
        alt: c === "clifford" ? "<b>Qulacs</b> and <b>qibojit</b>, which also finish ahead of Qiskit Aer on this circuit" : "<b>Qulacs</b>, which leads up to " + N + " = 24",
        caveats: [hostCaveat]
      };
    }
    var keepRegime = r.regime;
    r = reconcile(r, "gpu", c, n);
    r.regime = keepRegime;
    r.src = sweepSrc;
    r.evk = { type: "sweep", reg: "gpu", c: c };
    return r;
  }

  function recommend(a) {
    var m = method(a), n = a.n, r;
    var channelCaveats = [
      "A comparison between backends holds only when their channels match, and Qulacs sets depolarising noise as a Pauli-error probability, 4/3 stronger per qubit at the same rate (Section 5.6).",
      "Report fidelity, purity and population error together, since fidelity alone did not separate the four channels."
    ];
    if (m === "dm") {
      if (n <= 6) {
        r = {
          b: "Qibo NumPy",
          regime: "Density matrix · NumPy backend · i9-13900KS platform",
          ev: "Up to " + N + " = 7 fixed costs dominate. Qiskit Aer and Qulacs take a few hundredths of a second, almost independent of size, while Qibo with its NumPy backend starts twenty to fifty times faster, although its runtime grows with the matrix from " + N + " = 3 (Section 5.6).",
          alt: "<b>Qiskit Aer</b>, the fastest of the three from approximately " + N + " = 8",
          caveats: ["Every time at these sizes stays below a tenth of a second (Figure 5.9)."].concat(channelCaveats)
        };
      } else if (n <= LIMITS.dm) {
        r = {
          b: "Qiskit Aer",
          regime: "Density matrix · i9-13900KS platform",
          ev: "Qiskit Aer is the fastest of the three density-matrix backends from approximately " + N + " = 8, where updating the density matrix, rather than fixed costs, sets the time. It stays closest to the fourfold growth per qubit, which leaves it about twenty-five times faster at " + N + " = 13 (Section 5.6).",
          alt: n === 7 ? "<b>Qibo NumPy</b>, close behind at " + N + " = 7" : null,
          caveats: channelCaveats.slice()
        };
        if (n >= 14) r.out = "The density-matrix sweep stops at " + N + " = 13, although a single density matrix would fit in the memory of the platform up to " + N + " = 16 (Section 5.6).";
      } else {
        r = {
          b: "Trajectory sampling",
          regime: "Outside the density-matrix range of this dissertation",
          ev: "A density matrix has 4<sup>" + N + "</sup> elements of 16 bytes, so the platform used in this dissertation holds at most " + N + " = 16. Trajectory sampling stores a state vector for each trajectory, at the cost of repeated runs (Section 3.3), and its comparison with density-matrix propagation is proposed as future work (Section 6.3).",
          caveats: channelCaveats.slice(1),
          out: "Beyond the reach of exact density-matrix simulation on one node."
        };
      }
      r.kind = "dm";
      r.src = ["Figure 5.9", "Section 5.6"];
      r.evk = n <= LIMITS.dm ? { type: "dm" } : { type: "none" };
      return r;
    }
    if (isStab(m)) {
      r = m === "stab-aer" ? {
        b: "Qiskit Aer Stabilizer",
        regime: "Stabiliser tableau · 1024 samples · one x86 thread",
        ev: "Qiskit Aer Stabilizer and Qibo Clifford stayed below 0.1 s up to " + N + " = 60, where a state vector would need 16 EiB. CUDA-Q Stim exceeded 0.1 s from " + N + " = 51, because it pays the framework’s dispatch and compilation in every repetition (Section 5.7).",
        alt: "<b>Qibo Clifford</b>, if the tableau alone is enough"
      } : {
        b: "Qibo Clifford",
        regime: "Stabiliser tableau · no sampling · host processor of an A100-40 node",
        ev: "Qibo Clifford builds the tableau without sampling and, like Qiskit Aer Stabilizer, stayed below 0.1 s up to " + N + " = 60, where a state vector would need 16 EiB (Section 5.7).",
        alt: "<b>Qiskit Aer Stabilizer</b>, for sampled output"
      };
      r.caveats = ["Measured on the ten-layer Clifford benchmark; non-Clifford gates make the cost grow exponentially with their number."];
      if (n > 60) r.out = "The stabiliser series ended at " + N + " = 60. The tableau work grows as O(" + N + "²), so larger sizes should stay tractable, but they lie beyond the measured range.";
      r.kind = "sv-ref";
      r.src = ["Figure 5.11", "Section 5.7"];
      r.evk = { type: "stab", out: m === "stab-aer" ? "samples" : "tableau" };
      return r;
    }
    if (m === "tn") {
      r = {
        b: "CUDA-Q",
        regime: "Tensor network · cuTensorNet · one A100-40 · 1024 samples",
        ev: "With CUDA-Q, GHZ and the one-layer HEA completed runs at every tested size up to " + N + " = 500, where the runtime reaches about an hour; every repetition at larger sizes exceeded the time limit. GHZ has Schmidt rank two across any cut, and a single HEA ring keeps the rank at most four across each cut of the qubit chain, independently of " + N + " (Section 5.7).",
        alt: n <= 28 ? "<b>Qibo</b> through cuTensorNet, faster at all shared sizes but returning the full state, with its last completed runs at " + N + " = 28" : null,
        caveats: [
          "For sampled output only: the contraction into the full state hit the GPU memory limit at " + N + " = 30, before the state vector does (Section 5.8).",
          "Measured on GHZ and a one-layer HEA; each timed call draws 1024 shots and includes a new search for a contraction path."
        ]
      };
      if (n <= 31) r.caveats.push("Up to " + N + " = 31 one A100-40 also holds the dense state vector (Section 5.1).");
      if (n > 500) r.out = "Every repetition from " + N + " = 600 on exceeded the time limit of one hour.";
      r.kind = "sv-ref";
      r.src = ["Figure 5.12", "Section 5.7"];
      r.evk = { type: "tn", cls: "lowent" };
      return r;
    }
    if (m === "tn-deep") {
      r = {
        b: "CUDA-Q",
        regime: "Tensor network · cuTensorNet · one A100-40 · 1024 samples",
        ev: "With twenty HEA layers, " + N + " = 36 is the largest size at which a CUDA-Q contraction completed, beyond the " + N + " = 34 that one GPU node holds as a state vector, so the tensor network remains an option for deeper circuits (Sections 5.7 and 5.8).",
        caveats: [
          "Additional entangling layers can increase the bond dimensions needed to represent the state exactly, so the reach falls with depth.",
          "At " + N + " = 30 and 36 some repetitions exceeded the time limit while another completed (Figure 5.12)."
        ]
      };
      if (n > 36) r.out = "With twenty layers, " + N + " = 36 is the largest size with a completed repetition.";
      r.kind = "sv-ref";
      r.src = ["Figure 5.12", "Section 5.7"];
      r.evk = { type: "tn", cls: "deep" };
      return r;
    }
    var c = circuitClass(a);
    r = a.hw === "cpu" ? svCPU(a, c) : svGPU(a, c);
    r.caveats = (r.caveats || []).concat(svExtraCaveats(a));
    r.kind = "sv";
    if (r.evk) r.evk.cls = a.structure;
    return r;
  }

  /* ---------- path through Figure 5.13 ---------- */
  // The path of one query through the figure: the decisions taken (d: decision, a: "yes" or
  // "no", note: why, where the answer is not obvious), then either the box reached (end), the
  // stacked pair still to be divided (pair), or the decision that still waits for an answer
  // (open). sv is true once the path enters the second level. Ids are those of js/flow.js.
  // q holds noise, structure (a class), output, n and, for the second level, hw ("cpu" or
  // "gpu"), cpuScale and gpuCount; answers that are missing leave the path open. A branch
  // chosen in the figure can say less than a full answer, which aim() records as a hint:
  // notClifford (no circuit chosen yet), nRange ([from, to], no size chosen yet) and
  // cpuNodes ("yes" or "no" to several nodes, no scale chosen yet).
  function figPath(q) {
    var p = { steps: [], end: null, pair: null, open: null, sv: false, none: null };
    function step(d, ans, note) { p.steps.push({ d: d, a: ans, note: note || null }); }
    function stop(box) { p.end = box; return p; }
    function wait(d) { p.open = d; return p; }
    if (q.noise == null) return wait("noise");
    if (q.noise === "yes") { step("noise", "yes"); return stop("dm"); }
    step("noise", "no");
    var s = q.structure, o = q.output, n = q.n;
    // The size as far as it is known: n itself, or the range that a branch chosen in the figure leaves.
    var lo = n != null ? n : q.nRange ? q.nRange[0] : null, hi = n != null ? n : q.nRange ? q.nRange[1] : null;
    // Whether n ≤ k: true, false, or null while the size does not decide it.
    function atMost(k) { return hi != null && hi <= k ? true : lo != null && lo > k ? false : null; }
    if (!s) {
      if (!q.notClifford) return wait("clifford");
      step("clifford", "no");
      return wait("tn");
    }
    if (s === "clifford" && o !== "state") {
      step("clifford", "yes");
      if (!o) { p.pair = ["stabAer", "stabQibo"]; return p; }
      return stop(o === "samples" ? "stabAer" : "stabQibo");
    }
    step("clifford", "no", s === "clifford" ? "The gates are Clifford, but the task needs amplitudes, which the stabiliser backends do not return" : null);
    if (s === "lowent" && !q.noTN) {
      step("tn", "yes");
      if (!o) return wait("samples");
      if (o === "samples") { step("samples", "yes"); return stop("tnBox"); }
      step("samples", "no");
    } else if (s === "deep" && !q.noTN && o !== "state") {
      // With growing entanglement the tensor network is used only beyond what one GPU node holds.
      var oneNode = atMost(34);
      if (oneNode === null || (!oneNode && !o)) return wait("tn");
      if (!oneNode) { step("tn", "yes", "Beyond " + N + " = 34 the state exceeds one GPU node, and the tensor network remains an option for deeper circuits"); step("samples", "yes"); return stop("tnBox"); }
      step("tn", "no", "Added layers reduce the reach of the tensor network, and the state vector holds this size");
    } else {
      step("tn", "no", q.noTN ? "The tensor-network runs used A100 GPUs, and only CPUs were chosen"
        : s === "deep" ? "The task needs the full state, and the contraction into the full state hit the GPU memory limit at " + N + " = 30" : null);
    }
    p.sv = true;
    if (atMost(LIMITS.cpuCluster) === false) { p.none = "No platform of this dissertation holds the state"; return p; }
    if (!q.hw) return wait("gpu");
    if (q.hw === "cpu") {
      step("gpu", "no");
      var fitsNode = atMost(LIMITS.cpuNode);
      if (fitsNode === null) return wait("n33");
      if (!fitsNode) { step("n33", "no"); return stop("mpi34"); }
      step("n33", "yes");
      if (!q.cpuScale) {
        // A branch chosen in the figure says whether several nodes are used, not yet how many.
        if (!q.cpuNodes) return wait("nodes");
        step("nodes", q.cpuNodes);
        p.pair = q.cpuNodes === "yes" ? ["aerNodes", "mpiNodes"] : ["thread", "node"];
        return p;
      }
      if (q.cpuScale === "thread" || q.cpuScale === "node") { step("nodes", "no"); return stop(q.cpuScale); }
      step("nodes", "yes");
      return stop(q.cpuScale === "few" ? "aerNodes" : "mpiNodes");
    }
    step("gpu", "yes");
    var small = atMost(23);
    if (small === null) return wait("n23");
    if (small) { step("n23", "yes"); return stop("gpuQulacs"); }
    step("n23", "no");
    var oneGpuNode = atMost(34);
    if (oneGpuNode === null) return wait("n34");
    if (!oneGpuNode) {
      step("n34", "no");
      if (atMost(LIMITS.gpu16) === false) { p.none = "More than the sixteen GPUs of this dissertation hold"; return p; }
      if (n === LIMITS.gpu16) return stop("aer16");
      if (n == null || !q.gpuCount) { p.pair = ["cq8", "aer16"]; return p; }
      return stop(q.gpuCount === "sixteen" ? "aer16" : "cq8");
    }
    step("n34", "yes");
    var oneGpu = atMost(30);
    if (oneGpu === null) return wait("n30");
    if (!oneGpu) { step("n30", "no"); return stop("cqNode"); }
    step("n30", "yes");
    return stop(circuitClass(q) === "qft" ? "aerGpu" : "cqGpu");
  }

  // Every path of the current answers, complete or not: one per structure class and, once
  // the second level is reached, per hardware.
  function figPaths(a) {
    if (a.noise !== "no") return [{ cls: null, hw: null, path: figPath(a) }];
    var groups = groupsOf(a);
    if (!groups.length) return [{ cls: null, hw: null, path: figPath({ noise: "no", notClifford: a.notClifford }) }];
    var hw = hwList(a), hasGpu = hw.indexOf("gpu") !== -1, list = [];
    groups.forEach(function (g) {
      var base = groupBase(a, g);
      delete base.hw;
      var first = figPath(base);
      // A tensor-network path with only CPUs chosen falls back to the state vector.
      if (first.end === "tnBox" && hw.length && !hasGpu) { base.noTN = true; first = figPath(base); }
      if (!first.sv || !hw.length || first.none) { list.push({ cls: g.cls, hw: null, path: first }); return; }
      ["gpu", "cpu"].forEach(function (h) {
        if (hw.indexOf(h) === -1) return;
        var b = {};
        for (var k in base) b[k] = base[k];
        b.hw = h;
        list.push({ cls: g.cls, hw: h, path: figPath(b) });
      });
    });
    return list;
  }

  // One block per structure class, each with one outcome per usable hardware regime.
  function recommendAll(a) {
    if (a.noise === "yes") {
      return { kind: "dm", blocks: [{ cls: null, circuits: [], unsure: [], conf: "measured", outcomes: [{ hw: null, rec: recommend(a), path: figPath(a) }] }] };
    }
    var hw = hwList(a);
    var hasGpu = hw.indexOf("gpu") !== -1;
    var blocks = groupsOf(a).map(function (g) {
      var base = groupBase(a, g);
      var m = method(base);
      var outcomes = [];
      if (isStab(m)) {
        outcomes.push({ hw: null, rec: recommend(base), path: figPath(base) });
      } else if (isTN(m) && hasGpu) {
        base.hw = "gpu";
        outcomes.push({ hw: null, rec: recommend(base), path: figPath(base) });
      } else {
        var noTN = isTN(m);
        if (noTN) base.noTN = true;
        if (a.n > LIMITS.cpuCluster) {
          var inf = infeasible(base);
          inf.kind = "sv";
          outcomes.push({ hw: null, rec: inf, path: figPath(base) });
        } else {
          ["gpu", "cpu"].forEach(function (h) {
            if (hw.indexOf(h) === -1) return;
            var b = {};
            for (var k in base) b[k] = base[k];
            b.hw = h;
            var rec = recommend(b);
            if (noTN) rec.caveats.unshift("A tensor network would apply to this class, but those results were measured on A100 GPUs; on CPUs the state vector is the measured option.");
            outcomes.push({ hw: h, rec: rec, path: figPath(b) });
          });
        }
      }
      if (a.output === "tableau" && g.cls !== "clifford") {
        outcomes.forEach(function (o) { o.rec.caveats.unshift("The tableau applies only to Clifford circuits, so these circuits are treated as needing the full state."); });
      }
      return { cls: g.cls, circuits: g.circuits, unsure: g.unsure, conf: g.conf, outcomes: outcomes };
    });
    return { kind: "sv", blocks: blocks };
  }

  /* ---------- answers from the figure ---------- */
  // What each box of Figure 5.13 needs: noise, or the circuits and the output used when the
  // current ones do not lead to the box (cls: the structure classes that can); the
  // hardware; the sizes [from, to] that reach it and the size used when the current one
  // does not; the scale; and the backends it names. Boxes of the second level take the
  // QFT and the full state unless they say otherwise.
  var BOX_AIM = {
    dm: { noise: "yes", n: [2, 16, 10], b: ["Qiskit Aer"] },
    stabAer: { circuits: ["clifford"], cls: ["clifford"], output: "samples", n: [2, 1000, 60], b: ["Qiskit Aer Stabilizer"] },
    stabQibo: { circuits: ["clifford"], cls: ["clifford"], output: "tableau", n: [2, 1000, 60], b: ["Qibo Clifford"] },
    tnBox: { circuits: ["ghz"], cls: ["lowent"], output: "samples", gpu: true, n: [2, 1000, 40], b: ["CUDA-Q"] },
    mpi34: { hw: "cpu", n: [34, 39, 34], b: ["mpiQulacs"] },
    aerNodes: { hw: "cpu", n: [2, 33, 30], cpuScale: "few", b: ["Qiskit Aer"] },
    mpiNodes: { hw: "cpu", n: [2, 33, 30], cpuScale: "many", b: ["mpiQulacs"] },
    thread: { hw: "cpu", n: [2, 33, 30], cpuScale: "thread", b: ["Qulacs"] },
    node: { hw: "cpu", n: [2, 33, 30], cpuScale: "node", b: ["Qiskit Aer"] },
    gpuQulacs: { hw: "gpu", n: [2, 23, 20], b: ["Qulacs"] },
    cq8: { hw: "gpu", n: [35, 35, 35], gpuCount: "eight", b: ["CUDA-Q"] },
    aer16: { hw: "gpu", n: [35, 36, 35], gpuCount: "sixteen", b: ["Qiskit Aer"] },
    cqNode: { hw: "gpu", n: [31, 34, 32], b: ["CUDA-Q"] },
    aerGpu: { hw: "gpu", n: [24, 30, 30], circuits: ["qft"], b: ["Qiskit Aer"] },
    cqGpu: { hw: "gpu", n: [24, 30, 30], circuits: ["hea"], b: ["CUDA-Q", "Qulacs"] }
  };

  // The answers alone, without the hints of an earlier branch.
  function copyAnswers(a) {
    var b = {
      noise: a.noise,
      circuits: (a.circuits || []).slice(),
      other: a.other ? { name: a.other.name, cls: a.other.cls, src: a.other.src || null } : null,
      hw: hwList(a).slice()
    };
    ["output", "n", "cpuScale", "gpuCount"].forEach(function (k) { if (a[k] != null) b[k] = a[k]; });
    return b;
  }
  function cloneAnswers(a) { return JSON.parse(JSON.stringify(a)); }
  function setCircuits(b, ids) { b.circuits = ids.slice(); b.other = null; }
  // Keep the circuits whose class passes; false if none is left.
  function keepClasses(b, pass) {
    b.circuits = b.circuits.filter(function (id) { return CIRCUIT_BY_ID[id] && pass(CIRCUIT_BY_ID[id].cls); });
    if (b.other && !pass(b.other.cls === "unsure" ? "dense" : b.other.cls)) b.other = null;
    return answered(b, "structure");
  }
  // The tableau exists only while a Clifford circuit is selected.
  function fixOutput(b) {
    if (b.output === "tableau" && !groupsOf(b).some(function (g) { return g.cls === "clifford"; })) b.output = "state";
  }
  // Whether some path of the answers takes this branch and none takes the other one.
  function takes(b, d, ans) {
    var taken = false, other = false;
    figPaths(b).forEach(function (x) {
      x.path.steps.forEach(function (s) { if (s.d === d) { if (s.a === ans) taken = true; else other = true; } });
    });
    return taken && !other;
  }
  // An outcome that a box stands for: it ends there, with a backend that the box names,
  // inside the measured range.
  function inBox(o, box) {
    return !!o.path && o.path.end === box && BOX_AIM[box].b.indexOf(o.rec.b) !== -1 && !o.rec.out;
  }
  // The query reduced to the circuits whose outcomes the box stands for, or null if none.
  function narrowed(b, box) {
    if (!flow(b).done) return null;
    var blocks = recommendAll(b).blocks, keep = {};
    blocks.forEach(function (blk) {
      if (blk.outcomes.length && blk.outcomes.every(function (o) { return inBox(o, box); })) keep[blk.cls] = true;
    });
    if (b.noise === "yes") return keep[null] ? b : null;
    var c = cloneAnswers(b);
    if (!keepClasses(c, function (cls) { return keep[cls]; })) return null;
    fixOutput(c);
    if (!flow(c).done) return null;
    return recommendAll(c).blocks.every(function (blk) { return blk.outcomes.every(function (o) { return inBox(o, box); }); }) ? c : null;
  }

  // The answers that end in a box. The current circuits, output and size stay where the
  // box stands for them; otherwise the circuit and the size of the box replace them.
  function aimBox(a, box) {
    var T = BOX_AIM[box];
    var sizes = [];
    if (a.n != null && a.n >= T.n[0] && a.n <= T.n[1]) sizes.push(a.n);
    if (sizes.indexOf(T.n[2]) === -1) sizes.push(T.n[2]);
    function shape(circuits, other, output) {
      var c = copyAnswers(a);
      c.noise = T.noise || "no";
      if (c.noise === "yes") return c;
      c.circuits = circuits.slice();
      c.other = other ? { name: other.name, cls: other.cls, src: other.src || null } : null;
      c.output = output;
      if (T.hw) c.hw = [T.hw];
      else if (T.gpu && c.hw.indexOf("gpu") === -1) c.hw = ["gpu"];
      if (T.cpuScale) c.cpuScale = T.cpuScale;
      if (T.gpuCount) c.gpuCount = T.gpuCount;
      return c;
    }
    var shapes = [];
    var circuits = T.circuits || ["qft"], output = T.output || "state";
    if (T.noise === "yes") shapes.push(shape());
    else {
      if (answered(a, "structure")) {
        shapes.push(shape(a.circuits, a.other, T.output || a.output || output));
        if (!T.output && a.output !== "state") shapes.push(shape(a.circuits, a.other, "state"));
        // Circuits of other classes can keep the query from completing, so try without them.
        var own = copyAnswers(a);
        if (T.cls && keepClasses(own, function (cls) { return T.cls.indexOf(cls) !== -1; })) {
          shapes.push(shape(own.circuits, own.other, T.output || a.output || output));
          if (!T.output && a.output !== "state") shapes.push(shape(own.circuits, own.other, "state"));
        }
      }
      if (!T.output && a.output && a.output !== "tableau" && a.output !== output) shapes.push(shape(circuits, null, a.output));
      shapes.push(shape(circuits, null, output));
    }
    for (var i = 0; i < shapes.length; i++) {
      for (var j = 0; j < sizes.length; j++) {
        var c = cloneAnswers(shapes[i]);
        c.n = sizes[j];
        c = narrowed(c, box);
        if (c) return c;
      }
    }
    var last = shapes[shapes.length - 1];
    last.n = T.n[2];
    return last;
  }

  // The answers after one branch of the figure is chosen. Only what the branch decides
  // changes: the circuits for the questions on structure, the hardware, the size or the
  // scale. Where the branch leaves an answer open, a hint keeps the path on it.
  function aimEdge(a, d, ans) {
    var b = copyAnswers(a), yes = ans === "yes";
    // Hints of earlier branches stay while they still apply (dropHints()).
    if (a.notClifford) b.notClifford = true;
    if (a.nRange) b.nRange = a.nRange.slice();
    if (a.cpuNodes) b.cpuNodes = a.cpuNodes;
    // A branch that the answers already take changes nothing.
    if (a.noise != null && takes(a, d, ans)) return dropHints(b);
    function is(k) { return function (cls) { return cls === k; }; }
    // Keep the size if it lies in the range; otherwise use the default, or leave the range
    // open, narrowed by the range that an earlier branch left.
    function within(lo, hi, def, open) {
      if (b.n != null && b.n >= lo && b.n <= hi) return;
      if (b.n == null && b.nRange && Math.max(lo, b.nRange[0]) <= Math.min(hi, b.nRange[1])) {
        lo = Math.max(lo, b.nRange[0]);
        hi = Math.min(hi, b.nRange[1]);
      }
      if (open && lo < hi) { delete b.n; b.nRange = [lo, hi]; } else b.n = Math.min(hi, Math.max(lo, def));
    }
    // Reach the second level, on CPUs or on GPUs.
    function secondLevel(side) {
      b.noise = "no";
      if (!answered(b, "structure")) setCircuits(b, ["qft"]);
      fixOutput(b);
      if (!b.output) b.output = "state";
      b.hw = [side];
      if (b.n != null && b.n > LIMITS.cpuCluster) delete b.n;
    }
    if (d === "noise") {
      b.noise = ans;
      if (yes && (b.n == null || b.n > LIMITS.dm)) b.n = BOX_AIM.dm.n[2];
      return finish(b);
    }
    if (d === "clifford") {
      b.noise = "no";
      if (yes) {
        if (!keepClasses(b, is("clifford"))) setCircuits(b, ["clifford"]);
        if (b.output !== "samples" && b.output !== "tableau") delete b.output;
      } else if (b.output !== "state" || !answered(b, "structure")) {
        // With the full state asked, Clifford circuits already take this branch.
        if (!keepClasses(b, function (cls) { return cls !== "clifford"; })) b.notClifford = true;
        if (b.output === "tableau") delete b.output;
      }
      return finish(b);
    }
    if (d === "tn") {
      b.noise = "no";
      if (yes) {
        if (!keepClasses(b, is("lowent"))) setCircuits(b, ["ghz"]);
        if (b.output === "tableau") delete b.output;
        // The tensor-network runs used GPUs, so with CPUs alone the path would leave this branch.
        if (b.output === "samples" && b.hw.length && b.hw.indexOf("gpu") === -1) b.hw = ["gpu"];
      } else {
        // A deeper circuit leaves the tensor network while one GPU node holds its state.
        var deep = function () { return groupsOf(b).some(function (g) { return g.cls === "deep"; }); };
        if (deep() && b.n == null && !b.nRange) b.nRange = [2, 34];
        var stay = {};
        figPaths(b).forEach(function (x) {
          if (x.cls && x.path.steps.some(function (s) { return s.d === "tn" && s.a === "no"; })) stay[x.cls] = true;
        });
        if (!keepClasses(b, function (cls) { return stay[cls]; })) setCircuits(b, ["qft"]);
        if (!deep() && !a.nRange) delete b.nRange;
        fixOutput(b);
      }
      return finish(b);
    }
    if (d === "samples") {
      b.noise = "no";
      if (!keepClasses(b, is("lowent"))) setCircuits(b, ["ghz"]);
      b.output = yes ? "samples" : "state";
      if (yes && b.hw.indexOf("gpu") === -1) b.hw = ["gpu"];
      return finish(b);
    }
    if (d === "gpu") secondLevel(yes ? "gpu" : "cpu");
    else if (d === "n33") { secondLevel("cpu"); if (yes) within(2, 33, 30); else within(34, 39, 34); }
    else if (d === "nodes") {
      secondLevel("cpu");
      within(2, 33, 30);
      var several = b.cpuScale === "few" || b.cpuScale === "many", single = b.cpuScale === "thread" || b.cpuScale === "node";
      if (yes ? !several : !single) { delete b.cpuScale; b.cpuNodes = ans; }
    }
    else if (d === "n23") { secondLevel("gpu"); if (yes) within(2, 23, 20); else within(24, 36, 30, true); }
    else if (d === "n34") { secondLevel("gpu"); if (yes) within(24, 34, 30, true); else within(35, 36, 35); }
    else if (d === "n30") { secondLevel("gpu"); if (yes) within(24, 30, 30); else within(31, 34, 32); }
    else return b;
    // Circuits that another method takes reach the state vector once the full state is asked.
    if (!takes(b, d, ans)) {
      b.output = "state";
      if (!takes(b, d, ans)) setCircuits(b, ["qft"]);
    }
    return finish(b);
  }
  // Hints that an answer has replaced, or that the hardware no longer concerns.
  function dropHints(b) {
    if (answered(b, "structure") || b.noise === "yes") delete b.notClifford;
    if (b.n != null) delete b.nRange;
    if (b.cpuScale || hwList(b).indexOf("cpu") === -1) delete b.cpuNodes;
    return b;
  }
  // Once every path has reached its box, the query needs at most a size, and GPUs for the
  // tensor network, to give a result.
  function finish(b) {
    dropHints(b);
    var paths = figPaths(b);
    if (!paths.length || flow(b).done || !paths.every(function (x) { return x.path.end; })) return b;
    var T = BOX_AIM[paths[0].path.end];
    if (b.n == null && !b.nRange) b.n = T.n[2];
    if (T.gpu && b.hw.indexOf("gpu") === -1) b.hw = ["gpu"];
    return b;
  }

  // The answers that follow from a choice in the figure: { box: id } for one of its boxes,
  // { d: decision, ans: "yes" or "no" } for one of its branches.
  function aim(a, target) {
    if (target.box) return BOX_AIM[target.box] ? aimBox(a, target.box) : copyAnswers(a);
    return aimEdge(a, target.d, target.ans);
  }

  window.Selector = {
    QUESTIONS: QUESTIONS,
    COLOURS: COLOURS,
    colourOf: colourOf,
    tintOf: tintOf,
    figPath: figPath,
    figPaths: figPaths,
    aim: aim,
    dropHints: dropHints,
    BOX_AIM: BOX_AIM,
    REPOS: REPOS,
    CLASSES: CLASSES,
    CLASS_ORDER: CLASS_ORDER,
    OTHER_CLASSES: OTHER_CLASSES,
    UNSURE: UNSURE,
    CONFIDENCE: CONFIDENCE,
    CIRCUITS: CIRCUITS,
    CIRCUIT_BY_ID: CIRCUIT_BY_ID,
    SV_PLATFORMS: SV_PLATFORMS,
    DM_PLATFORMS: DM_PLATFORMS,
    LIMITS: LIMITS,
    CIRCUIT_NAME: CIRCUIT_NAME,
    PANEL: PANEL,
    SWEEP_MIN: SWEEP_MIN,
    bytesLog2: bytesLog2,
    fmtT: fmtT,
    times: times,
    sweepRank: sweepRank,
    excluded: excluded,
    flow: flow,
    method: method,
    methodOf: methodOf,
    groupsOf: groupsOf,
    circuitClass: circuitClass,
    recommend: recommend,
    recommendAll: recommendAll,
    sweepAt: sweepAt,
    answered: answered,
    hwList: hwList,
    isTN: isTN,
    isStab: isStab
  };
})();
