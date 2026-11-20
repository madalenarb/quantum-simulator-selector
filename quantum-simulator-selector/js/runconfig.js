/*
 * Run configuration of an outcome: how the dissertation ran the backend in that regime
 * (versions of Table 4.3, layouts and repetitions of Table 4.4, settings of Sections 4.3
 * and 4.4), stated for the circuits, the size and the output of the query, with the pages
 * of the library's documentation that describe those settings. No code is given: the
 * calls belong to each library and change between its versions, so its documentation is
 * the reference for them.
 *
 * Tips add good practice that the dissertation did not necessarily follow, and say so.
 *
 * RunConfig.forOutcome(rec, ctx) returns { lib, rows: [[label, html]], docs: [{ t, url, d }],
 * foot } or null, where ctx = { n, output, circuits: [{ id, name, conf }], noisy }. The
 * addresses of the pages were checked when this file was written (November 2026).
 */
(function () {
  "use strict";

  var N = "<i>n</i>";

  /* ---------- documentation pages ---------- */
  var AER = "https://qiskit.github.io/qiskit-aer/";
  var CQ = "https://nvidia.github.io/cuda-quantum/0.14.0/using/";
  var QULACS = "https://docs.qulacs.org/en/latest/";
  var QIBO = "https://qibo.science/qibo/stable/";
  var QUEST = "https://quest-kit.github.io/QuEST/";
  var DOCS = {
    aerStart: { t: "Getting started", url: AER + "getting_started.html", d: "installation, the GPU package and builds from source with GPU or MPI support" },
    aerSim: { t: "AerSimulator", url: AER + "stubs/qiskit_aer.AerSimulator.html", d: "the simulation method, device, precision, threads, fusion and cache-blocking options" },
    aerDist: { t: "Running with multiple GPUs and/or multiple nodes", url: AER + "howtos/running_gpu.html", d: "chunks, cache blocking and launching under MPI" },
    aerBuild: { t: "Contributing guide", url: "https://github.com/Qiskit/qiskit-aer/blob/main/CONTRIBUTING.md", d: "building from source with MPI and with GPU support" },
    aerNoise: { t: "Noise models", url: AER + "apidocs/aer_noise.html", d: "the noise model and its errors, among them the depolarising error" },
    aerNoiseTut: { t: "Building noise models", url: AER + "tutorials/3_building_noise_models.html", d: "a worked example" },
    aerTut: { t: "Simulators", url: AER + "tutorials/1_aersimulator.html", d: "the simulation methods, among them the stabiliser and the density-matrix methods" },
    cqInstall: { t: "Installation guide", url: CQ + "install/install.html", d: "packages, GPU requirements and MPI support" },
    cqCpu: { t: "State vector simulators", url: CQ + "backends/sims/svsims.html", d: "the CPU and GPU targets" },
    cqGpu: { t: "State vector simulators, single GPU", url: CQ + "backends/sims/svsims.html#single-gpu", d: "the nvidia target and its precision option, whose default is single precision" },
    cqMgpu: { t: "State vector simulators, multi-GPU multi-node", url: CQ + "backends/sims/svsims.html#multi-gpu-multi-node", d: "the mgpu option, launching under MPI with a power-of-two number of ranks, and its environment variables" },
    cqTN: { t: "Tensor network simulators", url: CQ + "backends/sims/tnsims.html", d: "the tensornet target, which runs in double precision by default" },
    qulacsInstall: { t: "Installation", url: QULACS + "intro/1_install.html", d: "packages for CPUs and GPUs, builds from source and the number of threads" },
    qulacsGuide: { t: "Python advanced guide", url: QULACS + "guide/2.0_python_advanced.html", d: "states, gates and circuits" },
    qulacsGpu: { t: "Python advanced guide, calculation using GPU", url: QULACS + "guide/2.0_python_advanced.html#Calculation-using-GPU", d: "the state held on the GPU" },
    qulacsMPI: { t: "Qulacs with MPI", url: "https://github.com/qulacs/qulacs/blob/main/README_MPI.md", d: "the MPI build, the distributed state, the optimiser with FusedSWAP and the gates it supports" },
    qiboInstall: { t: "Installation instructions", url: QIBO + "getting-started/installation.html", d: "Qibo and its qibojit backend" },
    qiboBackends: { t: "Backend drivers", url: QIBO + "getting-started/backends.html", d: "the NumPy, qibojit and Clifford backends" },
    qiboDevice: { t: "Advanced examples, selecting a device", url: QIBO + "code-examples/advancedexamples.html#how-to-select-a-classical-hardware-device-for-circuit-execution", d: "CPU or GPU and the number of threads" },
    qiboNoise: { t: "Advanced examples, noisy simulation", url: QIBO + "code-examples/advancedexamples.html#how-to-perform-noisy-simulation", d: "density matrices and noise models" },
    qiboStab: { t: "Phase-space representation of stabiliser states", url: QIBO + "api-reference/quantum-info/stabilizer.html", d: "the Clifford object and its tableau" },
    questCompile: { t: "Compiling", url: QUEST + "md_docs_2compile.html", d: "precision, multithreading, GPU and MPI builds" },
    questLaunch: { t: "Launching", url: QUEST + "md_docs_2launch.html", d: "threads and their binding, GPUs and MPI ranks at run time" },
    questApi: { t: "API", url: QUEST + "group__api.html", d: "the C interface" }
  };
  function docs() { return Array.prototype.map.call(arguments, function (k) { return DOCS[k]; }); }
  // The CUDA-Q pages are those of the version that the dissertation ran; the other sites
  // publish the documentation of their current release.
  function foot(lib) {
    return lib === "CUDA-Q" ? "These pages belong to the documentation of CUDA-Q 0.14.0, the version that the dissertation ran."
      : "These pages describe the current release of " + lib + ", whose option names and defaults can differ from those of the version that the dissertation ran.";
  }

  /* ---------- circuits, as the dissertation ran them ---------- */
  var CIRCUITS = {
    qft: { name: "The QFT", how: "The dissertation started it from the all-zero state and left out the final SWAP gates (Section 4.2.1)." },
    hea: {
      name: "The HEA with several layers",
      how: "The dissertation ran it with eight closed rings of CNOTs and R<sub>Z</sub>R<sub>X</sub>R<sub>Z</sub> on every qubit between rings, at angles drawn once from a seeded generator (Section 4.2.2).",
      tn: "The tensor-network series ran it with twenty CNOT rings in place of the eight of Section 4.2.2 (Section 5.7)."
    },
    hea1: { name: "The one-layer HEA", how: "The dissertation ran it as the HEA of Section 4.2.2 with one CNOT ring in place of eight (Section 5.7)." },
    ghz: { name: "The GHZ circuit", how: "The dissertation built it from a Hadamard followed by CNOTs (Section 5.7)." },
    clifford: { name: "The Clifford circuit", how: "The dissertation built it from ten layers, each with one gate per qubit drawn from {H, S, S†, X, Y, Z} and two stages of CNOTs between neighbours (Section 4.2.3)." }
  };
  // Circuits that each kind of regime was measured on, and how to say so.
  var MEASURED = {
    single: { ids: ["qft", "hea", "clifford"], text: "In this regime the dissertation measured the QFT, the eight-ring HEA and the Clifford circuit (Section 5.1)." },
    nodes: { ids: ["qft"], text: "This regime was measured on the QFT alone (Section 5.3)." },
    gpuNode: { ids: ["qft"], text: "The three multi-GPU backends were compared on the QFT (Section 5.4.2)." },
    gpuNodeCq: { ids: ["qft", "hea"], text: "Within one node, CUDA-Q ran the QFT and the eight-ring HEA (Section 5.4.1)." },
    gpuNodes: { ids: ["qft"], text: "Across nodes, the multi-GPU series were measured on the QFT alone (Section 5.4.2)." },
    tn: { ids: ["ghz", "hea1", "hea", "qft"], text: "" },
    stab: { ids: ["clifford"], text: "The stabiliser backends were measured on the Clifford circuit (Section 5.7)." }
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function circuitRow(ctx, c) {
    var on = " on " + N + " = " + ctx.n + " qubits. ";
    if (ctx.noisy) return "The QFT" + on + "It is the circuit of the density-matrix study, started from the all-zero state (Section 5.6).";
    var parts = [], unmeasured = false;
    (ctx.circuits || []).forEach(function (x) {
      var k = CIRCUITS[x.id];
      if (!k) {
        parts.push(esc(x.name) + ", your own circuit," + on + "It is outside the benchmark set, so the rest of this table describes the runs of the benchmark circuits.");
        return;
      }
      parts.push(k.name + on + (c.measured === MEASURED.tn && k.tn ? k.tn : k.how));
      if (c.measured.ids.indexOf(x.id) === -1) unmeasured = true;
    });
    if (unmeasured && c.measured.text) parts.push(c.measured.text);
    return parts.join("<br>");
  }

  /* ---------- layouts ---------- */
  var X86 = "Deucalion x86 node (two AMD EPYC 7742)";
  var LAYOUT = {
    thread: "One thread of a " + X86 + ".",
    node: "One " + X86 + " with 128 threads, one per core.",
    gpu: "One A100-40 GPU of a Deucalion node."
  };
  var REPS = { thread: "Fastest of ten", node: "Fastest of five", gpu: "Fastest of six" };
  function reps(mode, text) { return (text || REPS[mode]) + " repetitions after one warm-up (Table 4.4)."; }
  function modeOf(reg) { return reg.indexOf("A100") !== -1 ? "gpu" : reg.indexOf("128 threads") !== -1 ? "node" : "thread"; }

  /* ---------- tips ---------- */
  // Good practice beyond the settings above. Each tip says how it relates to the runs of
  // the dissertation, since some of it was not done there.
  var TIPS = {
    pinOne: "Thread pinning. Binding the thread to one core, for instance with <code>OMP_PROC_BIND=true</code> or <code>taskset</code>, keeps it from moving between cores during the run.",
    placement: "Thread placement. In the single-node runs of the dissertation the OpenMP runtime placed the threads (Table 4.4, Section 5.2). Pinning them is good practice, and the policy depends on the goal: <code>OMP_PROC_BIND=close</code> keeps the threads on neighbouring cores, <code>OMP_PROC_BIND=spread</code> distributes them over the sockets and their NUMA domains, and <code>OMP_PLACES=cores</code> gives each thread a core of its own. It matters because a thread reads the amplitudes held in the memory of the other socket across the socket interconnect (Section 3.5.3).",
    fusion: "Gate fusion. Qulacs fuses gates only when its circuit optimiser is called, which these runs did not do. On the 28-qubit QFT on one core of the i9-13900KS platform, fusing blocks of up to two qubits shortened the run from 319 s to 98 s with the AVX2 kernels (Section 5.5). Fusion pays off only when the passes it removes outweigh the cost of each fused block (Section 4.3.2).",
    hostCopy: "Copy to host memory. The timed call of these runs copies the state to host memory, as computing the fidelity against a reference requires. Where samples or a single probability are enough, the state can stay on the GPU, as in the multi-GPU runs (Sections 4.4.1 and 5.4).",
    transport: "Transport between nodes. These runs used the default UCX settings of Deucalion, under which each GPU exchanged data at about 0.9 GB/s across nodes. Tuning the transport could reduce that cost (Sections 5.4.2 and 6.2)."
  };
  function threadTips(mode) { return mode === "thread" ? [TIPS.pinOne] : mode === "node" ? [TIPS.placement] : []; }

  /* ---------- backends ---------- */
  function aerSingle(mode) {
    return {
      lib: "Qiskit Aer",
      backend: mode === "gpu" ? "Qiskit Aer 0.17.2 from its prebuilt package, with its shared-memory engine (Table 4.3)."
        : "Qiskit Aer 0.17.2 with its shared-memory engine; version 0.15.1 ran the 30-qubit QFT points that Figure 5.1 shares with the thread sweep of Section 5.2 (Table 4.3).",
      layout: LAYOUT[mode],
      settings: "The state-vector method on the " + (mode === "gpu" ? "GPU" : "CPU") + ", in double precision. Gate fusion stays at its default, which is on, and the circuit is transpiled at optimisation level zero (Sections 4.3.1 and 4.4.1).",
      timing: "The time of the execution call, which " + (mode === "gpu" ? "also copies the state to host memory (Section 4.4.1). " : "ends with the full state in memory. ") + reps(mode),
      measured: MEASURED.single, sv: true,
      tips: mode === "gpu" ? [TIPS.hostCopy] : threadTips(mode),
      docs: docs("aerStart", "aerSim")
    };
  }
  function aerNodes() {
    return {
      lib: "Qiskit Aer",
      backend: "Qiskit Aer 0.17.2 with its distributed cache-blocking engine, built from source with MPI (Table 4.3).",
      layout: "Two to sixteen Deucalion x86 nodes with 128 MPI ranks per node, one thread each, pinned to cores and launched with <code>srun</code> (Table 4.4).",
      settings: "The state vector in double precision, divided into chunks of at most 2<sup>26</sup> amplitudes, with gate fusion on. On CPUs this engine applies the gates of each rank with a single thread, which is why the runs use one rank per core (Section 4.3.1).",
      timing: "The time of the execution call, after which the state stays divided among the ranks. Fastest of all repetitions across all jobs, ten per job after one warm-up (Table 4.4).",
      measured: MEASURED.nodes, sv: true,
      docs: docs("aerDist", "aerBuild", "aerSim")
    };
  }
  function aerMGPU(gpus) {
    return {
      lib: "Qiskit Aer",
      backend: "Qiskit Aer 0.17.2 with its distributed cache-blocking engine, built from source with MPI and its CUDA backend (Table 4.3).",
      layout: (gpus === 16 ? "Sixteen A100-80 GPUs on four" : "Eight A100-80 GPUs on two") + " Deucalion nodes, one MPI rank per GPU, launched with <code>mpirun</code> (Table 4.4).",
      settings: "The state vector in double precision, divided into chunks of at most 2<sup>26</sup> amplitudes. Each rank runs the CUDA kernels of Qiskit Aer, since cuStateVec is not enabled, and exchanges data through Open MPI 4.1.5 over UCX. Inside a node the CUDA IPC transport of UCX was enabled, and from " + N + " = 32 each repetition ran in its own process (Sections 4.3.1 and 5.4, Appendix A.6).",
      timing: "The time of the execution call, after which the state stays on the GPUs. " + reps(null, "Median of ten"),
      measured: MEASURED.gpuNodes, sv: true,
      tips: [TIPS.transport],
      docs: docs("aerDist", "aerBuild", "aerSim")
    };
  }
  function aerStab() {
    return {
      lib: "Qiskit Aer",
      backend: "Qiskit Aer 0.17.2 (Table 4.3), with its stabiliser method (Section 5.7).",
      layout: "One thread of a Deucalion x86 node (Figure 5.11).",
      settings: "The stabiliser method, with 1024 shots drawn inside the timed call (Section 4.4.1).",
      timing: "The time of the execution call, sampling included. " + reps(null, "Fastest of five"),
      measured: MEASURED.stab,
      docs: docs("aerTut", "aerSim")
    };
  }
  function aerDM() {
    return {
      lib: "Qiskit Aer",
      backend: "Qiskit Aer 0.17.2 (Table 4.3).",
      layout: "The i9-13900KS platform, with the main thread pinned to one performance core (Table 4.4).",
      settings: "The density-matrix method in double precision, with a noise model. The comparison of backends applied depolarising noise of parameter <i>p</i> = 0.01, as a one-qubit channel after each one-qubit gate and a two-qubit channel after each CNOT (Section 5.6).",
      timing: "The time of the execution call. " + reps(null, "Median of five"),
      measured: MEASURED.single,
      docs: docs("aerNoise", "aerNoiseTut", "aerSim")
    };
  }
  function cudaqSingle() {
    return {
      lib: "CUDA-Q",
      backend: "CUDA-Q 0.14.0 from its prebuilt package, called through its Python interface (Table 4.3).",
      layout: LAYOUT.gpu,
      settings: "The <code>nvidia</code> target with its <code>fp64</code> option for double precision. The circuit is written with the kernel builder and compiled just in time, inside every timed call (Sections 4.3.1, 4.3.2 and 4.4.1).",
      timing: "The time of the execution call, which also copies the state to host memory (Section 4.4.1). " + reps("gpu"),
      measured: MEASURED.single, sv: true,
      tips: [TIPS.hostCopy],
      docs: docs("cqGpu", "cqInstall")
    };
  }
  function cudaqCPU() {
    return {
      lib: "CUDA-Q",
      backend: "CUDA-Q 0.14.0 from its prebuilt package, called through its Python interface (Table 4.3).",
      layout: LAYOUT.thread,
      settings: "The <code>qpp-cpu</code> target, the CPU fallback of CUDA-Q, which stores the state in host memory (Section 4.3.1).",
      timing: "The time of the execution call, which ends with the full state in memory. " + reps("thread"),
      measured: MEASURED.single, sv: true,
      docs: docs("cqCpu", "cqInstall")
    };
  }
  function cudaqMulti(n, gpus) {
    var one = gpus !== 8;
    return {
      lib: "CUDA-Q",
      backend: "CUDA-Q 0.14.0 from its prebuilt package, called through its Python interface (Table 4.3).",
      layout: (one ? (n >= 34 ? "The four" : n === 33 ? "Two or four" : "One to four") + " A100-80 GPUs of one Deucalion node" : "Eight A100-80 GPUs on two Deucalion nodes") +
        ", one MPI rank per GPU, launched with <code>mpirun</code> (Table 4.4).",
      settings: "The <code>nvidia</code> target with its <code>fp64</code> and <code>mgpu</code> options. The <code>mgpu</code> option divides the state among the GPUs and exchanges data directly between devices, with peer-to-peer copies inside a node" +
        (one ? "" : " and CUDA-aware MPI over InfiniBand between nodes, here under the default UCX settings of Deucalion") + " (Sections 4.3.1 and 4.3.2).",
      timing: "The time of the execution call, after which the state stays on the GPUs. " + reps(null, "Median of ten"),
      measured: one ? MEASURED.gpuNodeCq : MEASURED.gpuNodes, sv: true,
      tips: one ? [] : [TIPS.transport],
      docs: docs("cqMgpu", "cqInstall")
    };
  }
  function cudaqTN() {
    return {
      lib: "CUDA-Q",
      backend: "CUDA-Q 0.14.0 from its prebuilt package, called through its Python interface (Table 4.3).",
      layout: LAYOUT.gpu,
      settings: "The <code>tensornet</code> target, which contracts the tensor network of the circuit exactly on the GPU through cuTensorNet, in double precision (Sections 4.3.1 and 5.7).",
      timing: "The time of the call that draws 1024 shots, which includes a new search for a contraction path (Sections 4.4.1 and 5.7). Median of the completed repetitions, five after one warm-up, each limited to 3600 s (Table 4.4).",
      measured: MEASURED.tn,
      docs: docs("cqTN", "cqInstall")
    };
  }
  function qulacs(mode) {
    var gpu = mode === "gpu";
    return {
      lib: "Qulacs",
      backend: gpu ? "Qulacs 0.6.11, the cluster module of Deucalion, with its CUDA kernels (Table 4.3)."
        : "Qulacs 0.6.13, built from source with its AVX2 kernels; the 0.6.11 cluster module ran the HEA points (Table 4.3).",
      layout: LAYOUT[mode],
      settings: "The state vector " + (gpu ? "on the GPU, " : "") + "in double precision. Gates are applied one at a time, without the circuit optimiser, which is where Qulacs fuses gates (Section 4.3.1).",
      timing: "The time of the call that applies the circuit, which also allocates and initialises the state" + (gpu ? ", without a copy to host memory" : "") + " (Section 5.1). " + reps(mode),
      measured: MEASURED.single, sv: true,
      tips: gpu ? [] : threadTips(mode).concat([TIPS.fusion]),
      docs: gpu ? docs("qulacsInstall", "qulacsGpu") : docs("qulacsInstall", "qulacsGuide")
    };
  }
  function mpiQulacs(nodes) {
    return {
      lib: "Qulacs",
      backend: "mpiQulacs 0.6.11, the MPI build of Qulacs, from the cluster module of Deucalion, with Open MPI 4.1.5 (Table 4.3).",
      layout: nodes + " Deucalion x86 nodes, one MPI rank per node with 128 threads pinned to cores, launched with <code>srun</code> (Table 4.4).",
      settings: "The state vector in double precision, divided among the ranks. The circuit optimiser of Qulacs runs before the clock starts, with blocks of up to two qubits and fused swaps, so that several global qubits move in one FusedSWAP (Sections 4.4.1 and 5.3).",
      timing: "The time of the call that applies the optimised circuit. Fastest of all repetitions across all jobs, ten per job after one warm-up (Table 4.4).",
      measured: MEASURED.nodes, sv: true,
      docs: docs("qulacsMPI", "qulacsInstall")
    };
  }
  function quest(mode) {
    var gpu = mode === "gpu";
    return {
      lib: "QuEST",
      backend: "QuEST 4.2.0, built from source at <code>-O3</code> " + (gpu ? "with CUDA, running the library’s own kernels without cuQuantum" : "with OpenMP") + ", and called through its C interface (Table 4.3).",
      layout: LAYOUT[mode],
      settings: "Double precision. A C program reads the gate sequence from an OpenQASM file and applies it one gate at a time (Sections 4.3.2 and 4.4.1).",
      timing: "The time of gate execution (Section 5.1). " + reps(mode, gpu ? "Fastest of ten" : null),
      measured: MEASURED.single, sv: true,
      tips: gpu ? [] : threadTips(mode),
      docs: docs("questCompile", "questLaunch", "questApi")
    };
  }
  function qibojit(mode) {
    var gpu = mode === "gpu";
    return {
      lib: "Qibo",
      backend: "Qibo 0.3.1 with its qibojit backend (Table 4.3).",
      layout: LAYOUT[mode],
      settings: "qibojit through " + (gpu ? "CuPy on the GPU" : "Numba on the CPU") + ", in double precision. Its kernels are compiled just in time at their first call, which falls in the warm-up, and gates are applied one at a time (Sections 4.3.1 and 4.3.2).",
      timing: "The time of the execution call" + (gpu ? ", without a copy of the state to host memory (Section 4.4.1). " : ", which ends with the full state in memory. ") + reps(mode),
      measured: MEASURED.single, sv: true,
      docs: docs("qiboInstall", "qiboBackends", "qiboDevice")
    };
  }
  function qiboNumpy() {
    return {
      lib: "Qibo",
      backend: "Qibo 0.3.1 with its default NumPy backend (Table 4.3).",
      layout: LAYOUT.thread,
      settings: "The default NumPy backend in double precision (Section 4.3.1).",
      timing: "The time of the execution call, which ends with the full state in memory. " + reps("thread"),
      measured: MEASURED.single, sv: true,
      docs: docs("qiboBackends", "qiboInstall")
    };
  }
  function qiboDM() {
    return {
      lib: "Qibo",
      backend: "Qibo 0.3.1 with its default NumPy backend (Table 4.3).",
      layout: "The i9-13900KS platform, with the main thread pinned to one performance core (Table 4.4).",
      settings: "The NumPy backend with the circuit in density-matrix mode and a noise model. The comparison of backends applied depolarising noise of parameter <i>p</i> = 0.01 after every gate, the same channel as Qiskit Aer (Section 5.6).",
      timing: "The time of the execution call. " + reps(null, "Median of five"),
      measured: MEASURED.single,
      docs: docs("qiboNoise", "qiboBackends")
    };
  }
  function qiboClifford() {
    return {
      lib: "Qibo",
      backend: "Qibo 0.3.1 with its Clifford backend (Table 4.3).",
      layout: "The host processor of a Deucalion A100-40 node (Figure 5.11).",
      settings: "The Clifford backend, which builds the stabiliser tableau without sampling (Section 5.7).",
      timing: "The time of the execution call. " + reps(null, "Fastest of five"),
      measured: MEASURED.stab,
      docs: docs("qiboBackends", "qiboStab")
    };
  }

  /* ---------- selection ---------- */
  function forOutcome(rec, ctx) {
    var b = rec.b, reg = String(rec.regime || "");
    function has(s) { return reg.indexOf(s) !== -1; }
    var mode = modeOf(reg), c = null;
    if (rec.kind === "dm") c = b === "Qiskit Aer" ? aerDM() : b === "Qibo NumPy" ? qiboDM() : null;
    else if (b === "Qiskit Aer Stabilizer") c = aerStab();
    else if (b === "Qibo Clifford") c = qiboClifford();
    else if (b === "CUDA-Q" && reg.indexOf("Tensor network") === 0) c = cudaqTN();
    else if (b === "mpiQulacs") c = mpiQulacs(has("32 or 64") ? "32 or 64" : "64");
    else if (b === "Qiskit Aer") c = has("128 MPI ranks") ? aerNodes() : has("16 A100-80") ? aerMGPU(16) : has("8 A100-80") ? aerMGPU(8) : aerSingle(mode);
    else if (b === "CUDA-Q") c = has("8 A100-80") ? cudaqMulti(ctx.n, 8) : has("of one node") ? cudaqMulti(ctx.n, 4) : mode === "gpu" ? cudaqSingle() : cudaqCPU();
    else if (b === "Qulacs") c = qulacs(mode);
    else if (b === "QuEST") c = quest(mode);
    else if (b === "qibojit") c = qibojit(mode);
    else if (b === "Qibo NumPy") c = qiboNumpy();
    if (!c) return null;
    var rows = [
      ["Backend", c.backend],
      ["Circuit", circuitRow(ctx, c)],
      ["Layout", c.layout],
      ["Settings", c.settings],
      ["Timing", c.timing]
    ];
    if (c.sv && ctx.output === "samples") {
      rows.push(["Output", "You asked for measurement samples. The state-vector runs of the dissertation were strong simulations, each ending with the full state in memory, so drawing samples comes on top of the time measured (Section 4.4.1)."]);
    }
    if (c.tips && c.tips.length) rows.push(["Tips", c.tips.map(function (t) { return "<span class=\"rc-tip\">" + t + "</span>"; }).join("")]);
    return { lib: c.lib, rows: rows, docs: c.docs, foot: foot(c.lib) };
  }

  window.RunConfig = { forOutcome: forOutcome, DOCS: DOCS };
})();
