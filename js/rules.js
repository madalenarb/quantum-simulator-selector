/*
 * Decision rules of the Quantum Simulator Selector.
 *
 * Every recommendation below is a measured result from Chapter 5 of the dissertation
 * (Deucalion x86 and A100 nodes, i9-13900KS for density matrices, double precision).
 * To extend the selector, add circuits to CIRCUITS, questions to QUESTIONS, a branch to
 * flow() and a case to recommend(). The interface reads only the exports at the bottom.
 */
(function () {
  "use strict";

  var N = "<i>n</i>";

  // Thesis colours of each backend (Chapter 5 figures and the selection flowchart).
  var COLOURS = {
    "Qiskit Aer": "#CC3311",
    "Qiskit Aer Stabilizer": "#CC3311",
    "Qulacs": "#EE7733",
    "mpiQulacs": "#EE7733",
    "CUDA-Q": "#AA3377",
    "Qibo": "#5A4FCF",
    "Qibo Clifford": "#5A4FCF",
    "QuEST": "#44AA99",
    "Trajectory sampling": "#5F6C86",
    "No feasible state vector": "#5F6C86",
    "Beyond the GPUs used": "#5F6C86"
  };

  // Source repositories, linked from every backend name in the readout.
  var REPOS = {
    "Qiskit Aer": "https://github.com/Qiskit/qiskit-aer",
    "Qiskit Aer Stabilizer": "https://github.com/Qiskit/qiskit-aer",
    "CUDA-Q": "https://github.com/NVIDIA/cuda-quantum",
    "Qulacs": "https://github.com/qulacs/qulacs",
    "mpiQulacs": "https://github.com/qulacs/qulacs",
    "Qibo": "https://github.com/qiboteam/qibo",
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

  var QUESTIONS = {
    noise: {
      gate: "ε",
      short: "Noise",
      prompt: "Does the simulation need to model noise exactly?",
      help: "Exact noise replaces the state vector with a density matrix, whose memory grows fourfold with each added qubit.",
      options: function () {
        return [
          { v: "no", t: "No, an ideal circuit", d: "Unitary evolution of a pure state" },
          { v: "yes", t: "Yes, exact noisy evolution", d: "A density matrix under noise channels" }
        ];
      }
    },
    structure: {
      gate: "U",
      short: "Circuits",
      multi: "circuits",
      prompt: "Which circuits will you simulate?",
      help: "Pick one or several. Each maps to a structure class, and the structure decides whether a method cheaper than the dense state vector applies. Circuits that were not benchmarked are mapped by their structure and marked as inconclusive. Not listed? Describe yours under Another circuit, at the end of the list."
    },
    output: {
      gate: "M",
      short: "Output",
      prompt: "What must the run return?",
      help: "Weak simulation draws measurement samples; strong simulation returns the state itself.",
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
      gate: "n",
      short: "Qubits",
      prompt: "How many qubits?",
      help: function (a) {
        return a.noise === "yes"
          ? "A density matrix has 4ⁿ elements of 16 bytes in double precision, so its memory grows fourfold with every qubit."
          : "A dense state vector needs 16 bytes per amplitude in double precision, so its memory doubles with every qubit. Stabiliser and tensor-network methods avoid that growth.";
      }
    },
    hw: {
      gate: "HW",
      short: "Hardware",
      multi: "toggle",
      prompt: "Which hardware can you use?",
      help: "Pick one or both. The second level of the framework picks the backend for each execution regime that holds the state.",
      options: function () {
        return [
          { v: "cpu", t: "CPUs", d: "x86 nodes with two AMD EPYC 7742 (128 cores), up to 64 nodes" },
          { v: "gpu", t: "NVIDIA A100 GPUs", d: "40 or 80 GB each, four per node over NVLink" }
        ];
      }
    },
    cpuScale: {
      gate: "∥",
      short: "CPU scale",
      prompt: "How much of the CPU cluster will you use?",
      help: "Thread scaling was measured on one node and strong scaling on the 30-qubit QFT up to 64 nodes.",
      options: function () {
        return [
          { v: "thread", t: "One thread", d: "A serial run" },
          { v: "node", t: "One full node", d: "128 threads, one per core" },
          { v: "few", t: "2 to 16 nodes", d: "MPI across a few nodes" },
          { v: "many", t: "32 to 64 nodes", d: "MPI across many nodes" }
        ];
      }
    },
    host: {
      gate: "⇣",
      short: "Host copy",
      prompt: "Must the full state come back to host memory?",
      help: "Copying the state off the GPU changes which backend is fastest on one GPU.",
      options: function () {
        return [
          { v: "yes", t: "Yes, copy it to the host", d: "For example, to compute fidelity against a reference" },
          { v: "no", t: "No, it can stay on the GPU", d: "A single probability or expectation value suffices" }
        ];
      }
    },
    gpuCount: {
      gate: "G",
      short: "GPUs",
      prompt: "How many A100-80 GPUs will hold the state?",
      help: "At 35 qubits the 512 GiB state no longer fits one node of four GPUs, so the exchanges cross InfiniBand.",
      options: function () {
        return [
          { v: "eight", t: "Eight GPUs", d: "Two nodes, 640 GB in total" },
          { v: "sixteen", t: "Sixteen GPUs", d: "Four nodes, 1280 GB in total" }
        ];
      }
    }
  };

  // The four structure classes of the first level (Table 5.9).
  var CLASSES = {
    clifford: { name: "Clifford gates only", d: "H, S, CNOT and Paulis; polynomial-time stabiliser simulation applies" },
    lowent: { name: "Low, bounded entanglement", d: "Schmidt rank stays small across every cut, so tensor networks reach far" },
    deep: { name: "Entanglement that grows with depth", d: "Local gates whose entanglement builds up layer by layer" },
    dense: { name: "Densely connected, non-Clifford", d: "Every pair of qubits interacts; the dense state vector reached furthest" }
  };
  var CLASS_ORDER = ["clifford", "lowent", "deep", "dense"];
  // Choices for a circuit the researcher describes, including "not sure".
  var OTHER_CLASSES = CLASS_ORDER.concat(["unsure"]);
  var UNSURE = { name: "Not sure", d: "Treated as densely connected, which the dense state vector covers for any circuit" };

  // How confidently a circuit maps to its class.
  var CONFIDENCE = {
    measured: { label: "Measured", d: "Benchmarked in this dissertation" },
    gateset: { label: "By gate set", d: "Not benchmarked, but its gate set fixes the class" },
    inconclusive: { label: "Inconclusive", d: "Not benchmarked; mapped by its structure, so the outcome is a best guess" },
    user: { label: "Your mapping", d: "Classified by you" },
    unsure: { label: "Structure unknown", d: "Treated as densely connected" }
  };

  // Catalogue of circuits a researcher can pick. Add entries here as new workloads are measured.
  var CIRCUITS = [
    { id: "clifford", name: "Random Clifford circuit", cls: "clifford", conf: "measured", note: "The ten-layer benchmark of Chapter 4" },
    { id: "qec", name: "Error-correction syndrome extraction", cls: "clifford", conf: "gateset", note: "Clifford gates and Pauli measurements only" },
    { id: "bv", name: "Bernstein–Vazirani", cls: "clifford", conf: "gateset", note: "H, CNOT and Z gates only" },
    { id: "ghz", name: "GHZ state preparation", cls: "lowent", conf: "measured", note: "Tensor-network runs up to n = 500" },
    { id: "hea1", name: "Hardware-efficient ansatz, one layer", cls: "lowent", conf: "measured", note: "Tensor-network runs up to n = 500" },
    { id: "hea", name: "Hardware-efficient ansatz, several layers", cls: "deep", conf: "measured", note: "Eight CNOT rings as a state vector; twenty layers as a tensor network" },
    { id: "trotter", name: "Trotterised Hamiltonian simulation", cls: "deep", conf: "inconclusive", note: "Nearest-neighbour gates whose entanglement grows with simulated time" },
    { id: "qaoa", name: "QAOA", cls: "deep", conf: "inconclusive", note: "Entanglement depends on the problem graph and the number of layers" },
    { id: "qft", name: "Quantum Fourier transform", cls: "dense", conf: "measured", note: "The benchmark circuit of Chapter 4" },
    { id: "qpe", name: "Quantum phase estimation", cls: "dense", conf: "inconclusive", note: "Ends in an inverse QFT, but its controlled unitaries were not benchmarked" },
    { id: "shor", name: "Shor’s algorithm, modular arithmetic", cls: "dense", conf: "inconclusive", note: "Arithmetic subroutines are proposed as future work" },
    { id: "grover", name: "Grover search", cls: "dense", conf: "inconclusive", note: "Multi-controlled gates couple all qubits" },
    { id: "uccsd", name: "VQE with a UCCSD ansatz", cls: "dense", conf: "inconclusive", note: "Long-range excitation gates across the register" },
    { id: "rcs", name: "Random circuit sampling", cls: "dense", conf: "inconclusive", note: "Entanglement saturates quickly, the hardest case for tensor networks" }
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
    { label: "i9-13900KS workstation", n: 16, measured: 13 },
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
      (byCls[cls] = byCls[cls] || []).push({
        id: "other", name: a.other.name, cls: cls,
        conf: unsure ? "unsure" : "user",
        note: unsure ? "Structure unknown, so treated as densely connected" : "Classified by you"
      });
    }
    return CLASS_ORDER.filter(function (k) { return byCls[k]; }).map(function (k) {
      var list = byCls[k];
      var doubtful = list.filter(function (c) { return c.conf === "inconclusive" || c.conf === "user" || c.conf === "unsure"; });
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
    var needsState = svGroups.some(function (g) { return effOutput(a, g.cls) === "state"; });
    if (hasGpu && a.n >= 24 && a.n <= 31 && needsState) {
      qs.push("host");
      if (!answered(a, "host")) return { qs: qs, done: false };
    }
    return { qs: qs, done: true };
  }

  function circuitClass(a) {
    if (a.structure === "dense") return "qft";
    if (a.structure === "clifford") return "clifford";
    return "hea";
  }
  var CIRCUIT_NAME = { qft: "QFT", hea: "HEA", clifford: "Clifford circuit" };

  function svExtraCaveats(a) {
    var list = [];
    if (a.structure === "lowent") {
      list.push("State-vector rankings were measured on the HEA, the closest benchmark to a low-entanglement circuit.");
      if (a.output === "state") list.push("A tensor-network contraction that returns the full state reached the GPU memory limit at " + N + " = 30, before the state vector did.");
    }
    if (a.structure === "deep" && a.output === "samples" && !a.noTN) {
      list.push("A tensor network is also viable for deep circuits: with twenty HEA layers it reached " + N + " = 36, but the state vector holds these sizes.");
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
      caveats: []
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
      caveats: []
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
        caveats: ["Multi-node series measured on the QFT."]
      };
      if (n > LIMITS.cpuMeasured) r.out = "The multi-node series ended at " + N + " = 34; 64 x86 nodes hold the state up to " + N + " = 39 (" + svBytes(39) + ").";
      return r;
    }
    var s = a.cpuScale;
    if (s === "thread") {
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
          ev: "On the HEA, Qulacs stays ahead on one thread: each fused block of Qiskit Aer costs about twelve Qulacs gates, so Qiskit Aer remains about 1.5 times slower up to " + N + " = 30 (Section 5.1).",
          alt: "<b>Qiskit Aer</b> with 128 threads, if a full node is available"
        };
      } else {
        r = {
          b: "Qulacs",
          regime: "Dense state vector · one CPU thread",
          ev: "On one thread, Qulacs is at or near the front on every circuit: each gate goes straight to a native AVX2 kernel, at 0.6 to 16 µs per gate at " + N + " = 9 against 26 to 40 µs for Qiskit Aer (Section 5.1)."
        };
      }
      if (n >= 31) r.out = "The single-thread sweeps ended at " + N + " = 30; one node holds the state up to " + N + " = 33.";
      return r;
    }
    if (s === "node") {
      var cross = { qft: 18, hea: 22, clifford: 26 }[c];
      var gain = { qft: "61", hea: "65", clifford: "almost 100" }[c];
      if (n >= cross) {
        r = {
          b: "Qiskit Aer",
          regime: "Dense state vector · one x86 node · 128 threads",
          ev: "With 128 threads, Qiskit Aer leads the " + CIRCUIT_NAME[c] + " from " + N + " = " + cross + ". At " + N + " = 30 it runs " + gain + " times faster than on one thread, while the backends that apply one gate per pass stop gaining at 16 to 64 threads, consistent with the memory-bandwidth limit (Sections 5.1 and 5.2).",
          alt: "<b>Qulacs</b>, second on every circuit at " + N + " = 30"
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
          regime: "Dense state vector · one CPU thread suffices",
          ev: "Below " + N + " = " + cross + " the full node gains little: fixed costs set the time, and up to " + N + " = 13 multithreading brings no speedup except for Qiskit Aer on the QFT. The single-thread ranking applies (Section 5.1).",
          alt: "<b>Qiskit Aer</b> with 128 threads from " + N + " = " + cross
        };
      }
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
          "Use 128 ranks per node: its distributed engine gives each rank one thread, and with one rank per node it ran about ten times behind mpiQulacs.",
          "Measured on the QFT, at " + N + " = 30 and with 4 GiB of state per node."
        ]
      };
    }
    return {
      b: "mpiQulacs",
      regime: "Dense state vector · 32 to 64 x86 nodes · one MPI rank per node",
      ev: "Beyond 16 nodes, mpiQulacs is the fastest backend measured: 53 times faster on 64 nodes than on one at " + N + " = 30, with a last step better than ideal once each node’s 256 MiB share fits the L3 cache (Section 5.3).",
      alt: "<b>Qiskit Aer</b> on 16 nodes, which was already faster (1.08 s against 1.20 s)",
      caveats: ["Measured on the QFT at " + N + " = 30 and with 4 GiB of state per node."]
    };
  }

  function svGPU(a, c) {
    var n = a.n, r;
    if (n > LIMITS.gpu16) return gpuBeyond(a);
    if (n <= 23) {
      return {
        b: "Qulacs",
        regime: "Dense state vector · one A100 GPU",
        ev: "On one A100, Qulacs leads every circuit through " + N + " = 23, six to twenty-eight times ahead up to " + N + " = 20, because each gate passes straight to a native CUDA kernel at a fixed cost of 13 to 20 µs (Section 5.1).",
        caveats: ["Its timed call excludes any copy of the state to host memory."]
      };
    }
    if (n >= LIMITS.gpu8) {
      var sixteen = n === LIMITS.gpu16 || a.gpuCount === "sixteen";
      if (sixteen) {
        r = {
          b: "Qiskit Aer",
          regime: "Dense state vector · 16 A100-80 over four nodes",
          ev: "On sixteen GPUs, Qiskit Aer recovers more of the loss from crossing nodes and runs 1.1 to 1.3 times faster than CUDA-Q (Section 5.4.2).",
          alt: n === LIMITS.gpu8 ? "<b>CUDA-Q</b>, ahead on eight GPUs" : null
        };
      } else {
        r = {
          b: "CUDA-Q",
          regime: "Dense state vector · 8 A100-80 over two nodes",
          ev: "At " + N + " = 35 a second node is unavoidable. On eight GPUs CUDA-Q stays about 1.3 times ahead of Qiskit Aer, as both spend most of the run waiting for exchanges over InfiniBand (Section 5.4.2).",
          alt: "<b>Qiskit Aer</b>, ahead on sixteen GPUs"
        };
      }
      r.caveats = [
        "Under the default UCX settings of Deucalion, each GPU swapped about 0.9 GB/s across nodes; a tuned transport could change this order.",
        "Multi-GPU series measured on the QFT."
      ];
      if (n === LIMITS.gpu16) r.out = "The multi-GPU series ended at " + N + " = 35. Sixteen A100-80 hold the 1 TiB state at " + N + " = 36; eight do not.";
      return r;
    }
    var onNode = {
      b: "CUDA-Q",
      regime: "",
      ev: "Within one node, CUDA-Q was faster than Qiskit Aer at every size the node holds, 3.5 to 4 times on four GPUs, because its cuStateVec kernels compute faster. Crossing to a second node slowed both, so one node is the fastest configuration whenever it holds the state (Section 5.4).",
      alt: "<b>Qiskit Aer</b>, which also exchanges over NVLink with the CUDA IPC transport",
      caveats: ["Measured with the state left on the GPUs."]
    };
    if (n >= 32) {
      var min = n === 32 ? "one" : n === 33 ? "two" : "four";
      onNode.regime = "Dense state vector · " + (n === 34 ? "four" : min + " to four") + " A100-80 GPUs of one node";
      if (n < 34) onNode.caveats.push("More GPUs within the node still shorten the run: four GPUs cut the " + N + " = 32 QFT time by more than half.");
      if (c === "clifford") onNode.caveats.push("Multi-GPU runs measured on the QFT and the HEA.");
      return onNode;
    }
    if (a.output !== "state" || a.host === "no") {
      onNode.regime = "Dense state vector · one to four A100 GPUs of one node";
      onNode.ev = "With the state left on the device, CUDA-Q was about four times faster than Qiskit Aer on one GPU at " + N + " = 30 and stayed three to four times faster within the node (Section 5.4.2).";
      onNode.caveats.push("Measured on the QFT.");
      return onNode;
    }
    // State copied back to the host, one A100-40 (n = 24..31).
    var hostCaveat = "These times include copying the state to host memory, a cost that grows with the state.";
    if (n === 31) {
      if (c === "qft") {
        return {
          b: "Qiskit Aer",
          regime: "Dense state vector · one A100-40 · state copied to host",
          ev: "At " + N + " = 31, the largest state an A100-40 holds, only Qiskit Aer and CUDA-Q returned results on the QFT, and Qiskit Aer led from " + N + " = 24 to 30 (Section 5.1).",
          alt: "<b>CUDA-Q</b>, which also reached " + N + " = 31",
          caveats: [hostCaveat]
        };
      }
      return {
        b: "Qiskit Aer",
        regime: "Dense state vector · one A100-40 · state copied to host",
        ev: "At " + N + " = 31, the largest state an A100-40 holds, only Qiskit Aer returned results on the " + CIRCUIT_NAME[c] + " (Section 5.1).",
        caveats: [hostCaveat]
      };
    }
    if (c === "qft") {
      return {
        b: "Qiskit Aer",
        regime: "Dense state vector · one A100-40 · state copied to host",
        ev: "With the state copied to the host, Qiskit Aer leads the QFT from " + N + " = 24 to 30, 1.1 to 1.7 times ahead of CUDA-Q and 4.4 times ahead of Qulacs at " + N + " = 30, consistent with its fusion of controlled rotations into diagonal operations (Section 5.1).",
        alt: "<b>CUDA-Q</b>, if the state can stay on the GPU",
        caveats: [hostCaveat]
      };
    }
    if (n === 24) {
      return {
        b: "Qulacs",
        regime: "Dense state vector · one A100-40",
        ev: "Qulacs is still at the front at " + N + " = 24 on the " + CIRCUIT_NAME[c] + "; CUDA-Q takes over from " + N + " = 25 (Section 5.1).",
        caveats: ["The timed call of Qulacs excludes the host copy, whereas those of Qiskit Aer and CUDA-Q include it."]
      };
    }
    return {
      b: "CUDA-Q",
      regime: "Dense state vector · one A100-40 · state copied to host",
      ev: "With the state copied to the host, CUDA-Q is the fastest on the HEA and the Clifford circuit from " + N + " = 25, about 3 times faster than Qulacs on the HEA and 1.3 times on the Clifford circuit at " + N + " = 30 (Section 5.1).",
      alt: c === "clifford" ? "<b>Qulacs</b> and <b>qibojit</b>, which also finish ahead of Qiskit Aer on this circuit" : "<b>Qulacs</b>, which leads up to " + N + " = 24",
      caveats: [hostCaveat]
    };
  }

  function recommend(a) {
    var m = method(a), n = a.n, r;
    var channelCaveats = [
      "Compare backends only with matching channel definitions: Qulacs sets depolarising noise as a Pauli-error probability, 4/3 stronger per qubit at the same rate.",
      "Report fidelity, purity and population error together, since fidelity alone did not separate the four channels."
    ];
    if (m === "dm") {
      if (n <= 7) {
        r = {
          b: "Qibo",
          regime: "Density matrix · NumPy backend · CPU",
          ev: "Below " + N + " ≈ 8 fixed costs set the time, and Qibo ran about twenty to fifty times faster than Qiskit Aer and Qulacs, all three within a few hundredths of a second (Section 5.6).",
          alt: "<b>Qiskit Aer</b>, the fastest from " + N + " ≈ 8",
          caveats: channelCaveats.slice()
        };
      } else if (n <= LIMITS.dm) {
        r = {
          b: "Qiskit Aer",
          regime: "Density matrix · CPU",
          ev: "Qiskit Aer was the fastest of the three density-matrix backends from about " + N + " = 8, and about twenty-five times faster than the other two at " + N + " = 13, the only one close to the fourfold growth per qubit (Section 5.6).",
          caveats: channelCaveats.slice()
        };
        if (n >= 9) r.caveats.push("The NumPy backend of Qibo used several logical CPUs from " + N + " = 9.");
        if (n >= 14) r.out = "The density-matrix sweep ended at " + N + " = 13, where one repetition of the two slower backends exceeded an hour; the matrix still fits one x86 job up to " + N + " = 16.";
      } else {
        r = {
          b: "Trajectory sampling",
          regime: "Not benchmarked in this dissertation",
          ev: "An exact density matrix needs 16·4<sup>" + N + "</sup> bytes, so one Deucalion x86 job of 242 GiB holds at most " + N + " = 16. Trajectory sampling keeps the memory of a state vector at the cost of many repeated runs (Chapter 3), and its comparison with density matrices is proposed in Section 6.3.",
          caveats: channelCaveats.slice(1),
          out: "Beyond the reach of exact density-matrix simulation on one node."
        };
      }
      r.kind = "dm";
      return r;
    }
    if (isStab(m)) {
      r = m === "stab-aer" ? {
        b: "Qiskit Aer Stabilizer",
        regime: "Stabiliser tableau · sampled output · one CPU thread",
        ev: "Qiskit Aer Stabilizer and Qibo Clifford stayed below 0.1 s up to " + N + " = 60, where a state vector would need 16 EiB. CUDA-Q Stim exceeded 0.1 s from " + N + " = 51, because it pays the framework’s dispatch and compilation in every repetition (Section 5.7).",
        alt: "<b>Qibo Clifford</b>, if the tableau alone is enough"
      } : {
        b: "Qibo Clifford",
        regime: "Stabiliser tableau · no sampling · CPU",
        ev: "Qibo Clifford builds the tableau without sampling and, like Qiskit Aer Stabilizer, stayed below 0.1 s up to " + N + " = 60, where a state vector would need 16 EiB (Section 5.7).",
        alt: "<b>Qiskit Aer Stabilizer</b>, for sampled output"
      };
      r.caveats = ["Measured on the ten-layer Clifford benchmark; non-Clifford gates make the cost grow exponentially with their number."];
      if (n > 60) r.out = "The stabiliser series ended at " + N + " = 60. The tableau work grows as O(" + N + "²), so larger sizes should stay tractable, but they lie beyond the measured range.";
      r.kind = "sv-ref";
      return r;
    }
    if (m === "tn") {
      r = {
        b: "CUDA-Q",
        regime: "Tensor network · cuTensorNet · one A100-40 · 1024 samples",
        ev: "With CUDA-Q, GHZ and the one-layer HEA completed every size up to " + N + " = 500, where one contraction takes about an hour; every larger size exceeded the time limit. Their Schmidt rank across any cut of the qubit chain is at most two, so the contraction stays small (Section 5.7).",
        alt: n <= 28 ? "<b>Qibo</b> (cuTensorNet), faster at the sizes both reached, up to " + N + " = 28" : null,
        caveats: [
          "Samples only: a contraction that returns the full state ran out of GPU memory at " + N + " = 30.",
          "Measured on GHZ and a one-layer HEA; the path search runs inside each timed call."
        ]
      };
      if (n > 500) r.out = "Sizes from " + N + " = 600 exceeded the time limit.";
      r.kind = "sv-ref";
      return r;
    }
    if (m === "tn-deep") {
      r = {
        b: "CUDA-Q",
        regime: "Tensor network · cuTensorNet · one A100-40 · 1024 samples",
        ev: "With twenty HEA layers, the CUDA-Q contraction completed up to " + N + " = 36 within the time limit, beyond the " + N + " = 34 that one GPU node holds as a state vector (Section 5.7).",
        caveats: ["Each added layer raises the rank the contraction must carry, so the reachable size falls with depth."]
      };
      if (n > 36) r.out = "With twenty layers, the time limit was reached after " + N + " = 36.";
      r.kind = "sv-ref";
      return r;
    }
    var c = circuitClass(a);
    r = a.hw === "cpu" ? svCPU(a, c) : svGPU(a, c);
    r.caveats = (r.caveats || []).concat(svExtraCaveats(a));
    r.kind = "sv";
    return r;
  }

  // One block per structure class, each with one outcome per usable hardware regime.
  function recommendAll(a) {
    if (a.noise === "yes") {
      return { kind: "dm", blocks: [{ cls: null, circuits: [], unsure: [], conf: "measured", outcomes: [{ hw: null, rec: recommend(a) }] }] };
    }
    var hw = hwList(a);
    var hasGpu = hw.indexOf("gpu") !== -1;
    var blocks = groupsOf(a).map(function (g) {
      var base = groupBase(a, g);
      var m = method(base);
      var outcomes = [];
      if (isStab(m)) {
        outcomes.push({ hw: null, rec: recommend(base) });
      } else if (isTN(m) && hasGpu) {
        base.hw = "gpu";
        outcomes.push({ hw: null, rec: recommend(base) });
      } else {
        var noTN = isTN(m);
        if (noTN) base.noTN = true;
        if (a.n > LIMITS.cpuCluster) {
          var inf = infeasible(base);
          inf.kind = "sv";
          outcomes.push({ hw: null, rec: inf });
        } else {
          ["gpu", "cpu"].forEach(function (h) {
            if (hw.indexOf(h) === -1) return;
            var b = {};
            for (var k in base) b[k] = base[k];
            b.hw = h;
            var rec = recommend(b);
            if (noTN) rec.caveats.unshift("A tensor network would apply to this class, but those results were measured on A100 GPUs; on CPUs the state vector is the measured option.");
            outcomes.push({ hw: h, rec: rec });
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

  window.Selector = {
    QUESTIONS: QUESTIONS,
    COLOURS: COLOURS,
    REPOS: REPOS,
    CLASSES: CLASSES,
    CLASS_ORDER: CLASS_ORDER,
    OTHER_CLASSES: OTHER_CLASSES,
    UNSURE: UNSURE,
    CONFIDENCE: CONFIDENCE,
    CIRCUITS: CIRCUITS,
    SV_PLATFORMS: SV_PLATFORMS,
    DM_PLATFORMS: DM_PLATFORMS,
    LIMITS: LIMITS,
    bytesLog2: bytesLog2,
    flow: flow,
    method: method,
    methodOf: methodOf,
    groupsOf: groupsOf,
    recommend: recommend,
    recommendAll: recommendAll,
    answered: answered,
    hwList: hwList,
    isTN: isTN,
    isStab: isStab
  };
})();
