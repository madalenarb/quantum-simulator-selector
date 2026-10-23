/*
 * Run-configuration templates: for each outcome, a script that sets the backend up the way
 * the dissertation ran it (versions of Table 4.3, layouts of Table 4.5, double precision),
 * with a builder for the benchmark circuit of the structure class. They are starting
 * points to edit, not the harness of the dissertation.
 *
 * RunConfig.forOutcome(rec, ctx) returns { file, lang, text } or null, where
 * ctx = { n, cls, output, fromFile }.
 */
(function () {
  "use strict";

  var VERS = {
    "Qiskit Aer": "Qiskit Aer 0.17.2",
    "CUDA-Q": "CUDA-Q 0.14.0",
    "Qulacs": "Qulacs 0.6.13 (CPU) and 0.6.11 (GPU)",
    "mpiQulacs": "mpiQulacs 0.6.11, Open MPI 4.1.5",
    "Qibo": "Qibo 0.3.1, qibojit 0.1.13",
    "QuEST": "QuEST 4.2.0"
  };
  function head(lines, title, backend, notes) {
    var out = ["# " + title, "# Template, double precision. Measured in the dissertation with " + VERS[backend] + " (Table 4.3)."];
    (notes || []).forEach(function (l) { out.push("# " + l); });
    return out.concat([""], lines);
  }
  function join(a) { return a.join("\n") + "\n"; }

  /* ---------- circuit builders ---------- */
  var QISKIT = {
    dense: [
      "def build(n):",
      "    \"\"\"QFT: Hadamards, controlled phases between all pairs, final swaps.\"\"\"",
      "    qc = QuantumCircuit(n)",
      "    for j in range(n):",
      "        qc.h(j)",
      "        for k in range(j + 1, n):",
      "            qc.cp(math.pi / 2 ** (k - j), k, j)",
      "    for j in range(n // 2):",
      "        qc.swap(j, n - 1 - j)",
      "    return qc"
    ],
    deep: [
      "def build(n, rings=RINGS, seed=1):",
      "    \"\"\"HEA: rotation layers between closed rings of CNOTs.\"\"\"",
      "    rnd = random.Random(seed)",
      "    a = lambda: rnd.uniform(0, 2 * math.pi)",
      "    qc = QuantumCircuit(n)",
      "    for q in range(n):",
      "        qc.rz(a(), q); qc.rx(a(), q)",
      "    for ring in range(rings):",
      "        for q in range(n):",
      "            qc.cx(q, (q + 1) % n)",
      "        if ring < rings - 1:",
      "            for q in range(n):",
      "                qc.rz(a(), q); qc.rx(a(), q); qc.rz(a(), q)",
      "    for q in range(n):",
      "        qc.rx(a(), q); qc.rz(a(), q)",
      "    return qc"
    ],
    clifford: [
      "def build(n, layers=10, seed=1):",
      "    \"\"\"Clifford benchmark: random one-qubit Cliffords and two CNOT stages per layer.\"\"\"",
      "    rnd = random.Random(seed)",
      "    qc = QuantumCircuit(n)",
      "    for _ in range(layers):",
      "        for q in range(n):",
      "            getattr(qc, rnd.choice([\"h\", \"s\", \"sdg\", \"x\", \"y\", \"z\"]))(q)",
      "        for q in range(0, n - 1, 2):",
      "            qc.cx(q, q + 1)",
      "        for q in range(1, n - 1, 2):",
      "            qc.cx(q, q + 1)",
      "    return qc"
    ],
    lowent: [
      "def build(n):",
      "    \"\"\"GHZ state preparation.\"\"\"",
      "    qc = QuantumCircuit(n)",
      "    qc.h(0)",
      "    for q in range(n - 1):",
      "        qc.cx(q, q + 1)",
      "    return qc"
    ]
  };
  var QULACS = {
    dense: [
      "def cphase(control, target, theta):",
      "    g = DenseMatrix(target, [[1, 0], [0, cmath.exp(1j * theta)]])",
      "    g.add_control_qubit(control, 1)",
      "    return g",
      "",
      "def build(n):",
      "    \"\"\"QFT: Hadamards, controlled phases between all pairs, final swaps.\"\"\"",
      "    c = QuantumCircuit(n)",
      "    for j in range(n):",
      "        c.add_gate(H(j))",
      "        for k in range(j + 1, n):",
      "            c.add_gate(cphase(k, j, math.pi / 2 ** (k - j)))",
      "    for j in range(n // 2):",
      "        c.add_gate(SWAP(j, n - 1 - j))",
      "    return c"
    ],
    deep: [
      "def build(n, rings=RINGS, seed=1):",
      "    \"\"\"HEA: rotation layers between closed rings of CNOTs.\"\"\"",
      "    rnd = random.Random(seed)",
      "    a = lambda: rnd.uniform(0, 2 * math.pi)",
      "    c = QuantumCircuit(n)",
      "    for q in range(n):",
      "        c.add_gate(RZ(q, a())); c.add_gate(RX(q, a()))",
      "    for ring in range(rings):",
      "        for q in range(n):",
      "            c.add_gate(CNOT(q, (q + 1) % n))",
      "        if ring < rings - 1:",
      "            for q in range(n):",
      "                c.add_gate(RZ(q, a())); c.add_gate(RX(q, a())); c.add_gate(RZ(q, a()))",
      "    for q in range(n):",
      "        c.add_gate(RX(q, a())); c.add_gate(RZ(q, a()))",
      "    return c"
    ],
    clifford: [
      "GATES = {\"h\": H, \"s\": S, \"sdg\": Sdag, \"x\": X, \"y\": Y, \"z\": Z}",
      "",
      "def build(n, layers=10, seed=1):",
      "    \"\"\"Clifford benchmark: random one-qubit Cliffords and two CNOT stages per layer.\"\"\"",
      "    rnd = random.Random(seed)",
      "    c = QuantumCircuit(n)",
      "    for _ in range(layers):",
      "        for q in range(n):",
      "            c.add_gate(GATES[rnd.choice(list(GATES))](q))",
      "        for q in range(0, n - 1, 2):",
      "            c.add_gate(CNOT(q, q + 1))",
      "        for q in range(1, n - 1, 2):",
      "            c.add_gate(CNOT(q, q + 1))",
      "    return c"
    ],
    lowent: [
      "def build(n):",
      "    \"\"\"GHZ state preparation.\"\"\"",
      "    c = QuantumCircuit(n)",
      "    c.add_gate(H(0))",
      "    for q in range(n - 1):",
      "        c.add_gate(CNOT(q, q + 1))",
      "    return c"
    ]
  };
  var QULACS_IMPORTS = "from qulacs.gate import H, X, Y, Z, S, Sdag, CNOT, SWAP, RX, RZ, DenseMatrix";
  // CUDA-Q through its kernel builder, as in the dissertation (Section 4.4.1).
  var CUDAQ = {
    dense: [
      "def build(n, measure=False):",
      "    \"\"\"QFT: Hadamards, controlled phases between all pairs, final swaps.\"\"\"",
      "    kernel = cudaq.make_kernel()",
      "    q = kernel.qalloc(n)",
      "    for j in range(n):",
      "        kernel.h(q[j])",
      "        for k in range(j + 1, n):",
      "            kernel.cr1(math.pi / 2 ** (k - j), q[k], q[j])",
      "    for j in range(n // 2):",
      "        kernel.swap(q[j], q[n - 1 - j])",
      "    if measure:",
      "        kernel.mz(q)",
      "    return kernel"
    ],
    deep: [
      "def build(n, rings=RINGS, seed=1, measure=False):",
      "    \"\"\"HEA: rotation layers between closed rings of CNOTs.\"\"\"",
      "    rnd = random.Random(seed)",
      "    a = lambda: rnd.uniform(0, 2 * math.pi)",
      "    kernel = cudaq.make_kernel()",
      "    q = kernel.qalloc(n)",
      "    for i in range(n):",
      "        kernel.rz(a(), q[i]); kernel.rx(a(), q[i])",
      "    for ring in range(rings):",
      "        for i in range(n):",
      "            kernel.cx(q[i], q[(i + 1) % n])",
      "        if ring < rings - 1:",
      "            for i in range(n):",
      "                kernel.rz(a(), q[i]); kernel.rx(a(), q[i]); kernel.rz(a(), q[i])",
      "    for i in range(n):",
      "        kernel.rx(a(), q[i]); kernel.rz(a(), q[i])",
      "    if measure:",
      "        kernel.mz(q)",
      "    return kernel"
    ],
    clifford: [
      "def build(n, layers=10, seed=1, measure=False):",
      "    \"\"\"Clifford benchmark: random one-qubit Cliffords and two CNOT stages per layer.\"\"\"",
      "    rnd = random.Random(seed)",
      "    kernel = cudaq.make_kernel()",
      "    q = kernel.qalloc(n)",
      "    for _ in range(layers):",
      "        for i in range(n):",
      "            getattr(kernel, rnd.choice([\"h\", \"s\", \"sdg\", \"x\", \"y\", \"z\"]))(q[i])",
      "        for i in range(0, n - 1, 2):",
      "            kernel.cx(q[i], q[i + 1])",
      "        for i in range(1, n - 1, 2):",
      "            kernel.cx(q[i], q[i + 1])",
      "    if measure:",
      "        kernel.mz(q)",
      "    return kernel"
    ],
    lowent: [
      "def build(n, measure=False):",
      "    \"\"\"GHZ state preparation.\"\"\"",
      "    kernel = cudaq.make_kernel()",
      "    q = kernel.qalloc(n)",
      "    kernel.h(q[0])",
      "    for i in range(n - 1):",
      "        kernel.cx(q[i], q[i + 1])",
      "    if measure:",
      "        kernel.mz(q)",
      "    return kernel"
    ]
  };
  var QIBO = {
    dense: [
      "def build(n, density_matrix=False, noise=None):",
      "    \"\"\"QFT: Hadamards, controlled phases between all pairs, final swaps.\"\"\"",
      "    c = Circuit(n, density_matrix=density_matrix)",
      "    def add(g, *qubits):",
      "        c.add(g)",
      "        if noise is not None:",
      "            c.add(gates.DepolarizingChannel(qubits, lam=noise))",
      "    for j in range(n):",
      "        add(gates.H(j), j)",
      "        for k in range(j + 1, n):",
      "            add(gates.CU1(k, j, theta=math.pi / 2 ** (k - j)), k, j)",
      "    for j in range(n // 2):",
      "        add(gates.SWAP(j, n - 1 - j), j, n - 1 - j)",
      "    return c"
    ],
    deep: [
      "def build(n, rings=RINGS, seed=1, density_matrix=False, noise=None):",
      "    \"\"\"HEA: rotation layers between closed rings of CNOTs.\"\"\"",
      "    rnd = random.Random(seed)",
      "    a = lambda: rnd.uniform(0, 2 * math.pi)",
      "    c = Circuit(n, density_matrix=density_matrix)",
      "    for q in range(n):",
      "        c.add(gates.RZ(q, a())); c.add(gates.RX(q, a()))",
      "    for ring in range(rings):",
      "        for q in range(n):",
      "            c.add(gates.CNOT(q, (q + 1) % n))",
      "        if ring < rings - 1:",
      "            for q in range(n):",
      "                c.add(gates.RZ(q, a())); c.add(gates.RX(q, a())); c.add(gates.RZ(q, a()))",
      "    for q in range(n):",
      "        c.add(gates.RX(q, a())); c.add(gates.RZ(q, a()))",
      "    return c"
    ],
    clifford: [
      "def build(n, layers=10, seed=1, density_matrix=False, noise=None):",
      "    \"\"\"Clifford benchmark: random one-qubit Cliffords and two CNOT stages per layer.\"\"\"",
      "    rnd = random.Random(seed)",
      "    one = [gates.H, gates.S, gates.SDG, gates.X, gates.Y, gates.Z]",
      "    c = Circuit(n, density_matrix=density_matrix)",
      "    for _ in range(layers):",
      "        for q in range(n):",
      "            c.add(rnd.choice(one)(q))",
      "        for q in range(0, n - 1, 2):",
      "            c.add(gates.CNOT(q, q + 1))",
      "        for q in range(1, n - 1, 2):",
      "            c.add(gates.CNOT(q, q + 1))",
      "    return c"
    ],
    lowent: [
      "def build(n, density_matrix=False, noise=None):",
      "    \"\"\"GHZ state preparation.\"\"\"",
      "    c = Circuit(n, density_matrix=density_matrix)",
      "    c.add(gates.H(0))",
      "    for q in range(n - 1):",
      "        c.add(gates.CNOT(q, q + 1))",
      "    return c"
    ]
  };
  function builder(table, cls, rings) {
    return table[cls].map(function (l) { return l.replace("RINGS", String(rings || 8)); });
  }
  function fileNote(ctx, how) {
    return ctx.fromFile ? ["", "# Your circuit came from an OpenQASM file. " + how] : [];
  }
  var TIMER = [
    "t0 = time.perf_counter()",
    "RUN",
    "print(f\"simulation time {time.perf_counter() - t0:.4f} s\")"
  ];
  function timed(call) { return TIMER.map(function (l) { return l === "RUN" ? call : l; }); }

  /* ---------- templates ---------- */
  function aerCPU(ctx, threads) {
    var samples = ctx.output === "samples";
    return head([
      "# Launch:  OMP_NUM_THREADS=" + threads + " python run_aer.py",
      "import math, random, time",
      "from qiskit import QuantumCircuit, transpile",
      "from qiskit_aer import AerSimulator",
      ""
    ].concat(builder(QISKIT, ctx.cls)).concat(fileNote(ctx, "Read it with qc = QuantumCircuit.from_qasm_file(\"circuit.qasm\") in place of build(n).")).concat([
      "",
      "n = " + ctx.n,
      "qc = build(n)",
      samples ? "qc.measure_all()" : "qc.save_statevector()",
      "sim = AerSimulator(method=\"statevector\", device=\"CPU\", precision=\"double\",",
      "                   max_parallel_threads=" + threads + ")  # fusion is on by default",
      "tqc = transpile(qc, sim, optimization_level=0)",
      ""
    ]).concat(timed("result = sim.run(tqc" + (samples ? ", shots=1024" : "") + ").result()")), "Qiskit Aer, shared-memory engine, " + (threads === 1 ? "one thread" : "one node, " + threads + " threads"), "Qiskit Aer");
  }
  function aerMPI(ctx, nodes) {
    var samples = ctx.output === "samples";
    return head([
      "# Launch on " + nodes + " x86 nodes, 128 ranks per node, one thread each (Section 5.3):",
      "#   srun --nodes=" + nodes + " --ntasks-per-node=128 --cpus-per-task=1 --cpu-bind=cores python run_aer_mpi.py",
      "# Needs Qiskit Aer built from source with MPI (-DAER_MPI=True).",
      "import math, random, time",
      "from qiskit import QuantumCircuit, transpile",
      "from qiskit_aer import AerSimulator",
      ""
    ].concat(builder(QISKIT, ctx.cls)).concat([
      "",
      "n = " + ctx.n,
      "ranks = " + nodes + " * 128",
      "qc = build(n)",
      samples ? "qc.measure_all()" : "# the state stays divided among the ranks",
      "sim = AerSimulator(method=\"statevector\", device=\"CPU\", precision=\"double\",",
      "                   blocking_enable=True,",
      "                   blocking_qubits=min(26, n - int(math.log2(ranks))))  # chunks of at most 2^26 amplitudes",
      "tqc = transpile(qc, sim, optimization_level=0)",
      ""
    ]).concat(timed("result = sim.run(tqc" + (samples ? ", shots=1024" : "") + ").result()")), "Qiskit Aer, distributed cache-blocking engine on CPUs", "Qiskit Aer");
  }
  function aerGPU(ctx) {
    var samples = ctx.output === "samples";
    return head([
      "# Launch:  python run_aer_gpu.py   (one A100)",
      "import math, random, time",
      "from qiskit import QuantumCircuit, transpile",
      "from qiskit_aer import AerSimulator",
      ""
    ].concat(builder(QISKIT, ctx.cls)).concat(fileNote(ctx, "Read it with qc = QuantumCircuit.from_qasm_file(\"circuit.qasm\") in place of build(n).")).concat([
      "",
      "n = " + ctx.n,
      "qc = build(n)",
      samples ? "qc.measure_all()" : "qc.save_statevector()  # copies the state to host memory inside the timed call",
      "sim = AerSimulator(method=\"statevector\", device=\"GPU\", precision=\"double\",",
      "                   cuStateVec_enable=False)  # the dissertation ran Aer's own CUDA kernels",
      "tqc = transpile(qc, sim, optimization_level=0)",
      ""
    ]).concat(timed("result = sim.run(tqc" + (samples ? ", shots=1024" : "") + ").result()")), "Qiskit Aer on one GPU", "Qiskit Aer");
  }
  function aerMGPU(ctx, gpus) {
    var samples = ctx.output === "samples";
    return head([
      "# Launch on " + gpus + " A100-80 (" + gpus / 4 + " node" + (gpus > 4 ? "s" : "") + "), one MPI rank per GPU:",
      "#   export UCX_TLS=rc,sm,cuda_copy,cuda_ipc   # CUDA IPC inside a node (Appendix A.6); the exact list is site-specific",
      "#   mpirun -np " + gpus + " --map-by ppr:4:node python run_aer_mgpu.py",
      "# From n = 32, run each repetition in its own process (Appendix A.6).",
      "# Needs Qiskit Aer built from source with MPI and CUDA (-DAER_MPI=True -DAER_THRUST_BACKEND=CUDA).",
      "import math, random, time",
      "from qiskit import QuantumCircuit, transpile",
      "from qiskit_aer import AerSimulator",
      ""
    ].concat(builder(QISKIT, ctx.cls)).concat([
      "",
      "n = " + ctx.n,
      "gpus = " + gpus,
      "qc = build(n)",
      samples ? "qc.measure_all()" : "# nothing is saved, so the state stays on the GPUs (Section 5.4)",
      "sim = AerSimulator(method=\"statevector\", device=\"GPU\", precision=\"double\", cuStateVec_enable=False,",
      "                   blocking_enable=True,",
      "                   blocking_qubits=min(26, n - int(math.log2(gpus))))  # chunks of at most 2^26 amplitudes",
      "tqc = transpile(qc, sim, optimization_level=0)",
      ""
    ]).concat(timed("result = sim.run(tqc" + (samples ? ", shots=1024" : "") + ").result()")), "Qiskit Aer, distributed engine on " + gpus + " GPUs", "Qiskit Aer");
  }
  function aerDM(ctx) {
    return head([
      "# Launch:  python run_aer_dm.py",
      "import math, random, time",
      "from qiskit import QuantumCircuit, transpile",
      "from qiskit_aer import AerSimulator",
      "from qiskit_aer.noise import NoiseModel, depolarizing_error",
      ""
    ].concat(builder(QISKIT, "dense")).concat([
      "",
      "n = " + ctx.n,
      "p = 0.01  # depolarising parameter of Section 5.6",
      "noise = NoiseModel()",
      "noise.add_all_qubit_quantum_error(depolarizing_error(p, 1), [\"h\"])",
      "noise.add_all_qubit_quantum_error(depolarizing_error(p, 2), [\"cp\", \"swap\"])",
      "qc = build(n)",
      "qc.save_density_matrix()",
      "sim = AerSimulator(method=\"density_matrix\", precision=\"double\", noise_model=noise)",
      "tqc = transpile(qc, sim, optimization_level=0)",
      ""
    ]).concat(timed("result = sim.run(tqc).result()")), "Qiskit Aer, density matrix with depolarising noise (QFT)", "Qiskit Aer",
    ["Compare backends only with the same channel definition (Section 5.6)."]);
  }
  function aerStab(ctx) {
    return head([
      "# Launch:  OMP_NUM_THREADS=1 python run_aer_stabilizer.py",
      "import math, random, time",
      "from qiskit import QuantumCircuit, transpile",
      "from qiskit_aer import AerSimulator",
      ""
    ].concat(builder(QISKIT, "clifford")).concat(fileNote(ctx, "Read it with qc = QuantumCircuit.from_qasm_file(\"circuit.qasm\") in place of build(n).")).concat([
      "",
      "n = " + ctx.n,
      "qc = build(n)",
      "qc.measure_all()",
      "sim = AerSimulator(method=\"stabilizer\")",
      "tqc = transpile(qc, sim, optimization_level=0)",
      ""
    ]).concat(timed("counts = sim.run(tqc, shots=1024).result().get_counts()")), "Qiskit Aer Stabilizer, sampled output", "Qiskit Aer");
  }
  function qulacsCPU(ctx, threads) {
    var samples = ctx.output === "samples";
    return head([
      "# Launch:  OMP_NUM_THREADS=" + threads + " python run_qulacs.py",
      "import cmath, math, random, time",
      "from qulacs import QuantumState, QuantumCircuit",
      QULACS_IMPORTS,
      ""
    ].concat(builder(QULACS, ctx.cls)).concat([
      "",
      "n = " + ctx.n,
      "circuit = build(n)  # applied gate by gate, without the optimiser, as in the dissertation",
      ""
    ]).concat(timed("state = QuantumState(n); circuit.update_quantum_state(state)  # the timed call also allocates the state (Table 4.4)")).concat(
      samples ? ["samples = state.sampling(1024)"] : []), "Qulacs, CPU state vector, " + (threads === 1 ? "one thread" : threads + " threads"), "Qulacs");
  }
  function qulacsGPU(ctx) {
    var samples = ctx.output === "samples";
    return head([
      "# Launch:  python run_qulacs_gpu.py   (one A100; needs the GPU build of Qulacs)",
      "import cmath, math, random, time",
      "from qulacs import QuantumStateGpu, QuantumCircuit",
      QULACS_IMPORTS,
      ""
    ].concat(builder(QULACS, ctx.cls)).concat([
      "",
      "n = " + ctx.n,
      "circuit = build(n)",
      ""
    ]).concat(timed("state = QuantumStateGpu(n); circuit.update_quantum_state(state)  # no copy to host memory")).concat(
      samples ? ["samples = state.sampling(1024)"] : ["# state.get_vector() copies the state to host memory, outside the timed call"]), "Qulacs on one GPU", "Qulacs");
  }
  function mpiQulacs(ctx, nodes) {
    return head([
      "# Launch on " + nodes + " x86 nodes, one rank per node with 128 OpenMP threads pinned to cores (Section 5.3):",
      "#   OMP_NUM_THREADS=128 OMP_PROC_BIND=close OMP_PLACES=cores \\",
      "#   srun --nodes=" + nodes + " --ntasks-per-node=1 --cpus-per-task=128 python run_mpiqulacs.py",
      "# Needs the MPI build of Qulacs.",
      "import cmath, math, random, time",
      "from qulacs import QuantumState, QuantumCircuit",
      "from qulacs.circuit import QuantumCircuitOptimizer",
      QULACS_IMPORTS,
      ""
    ].concat(builder(QULACS, ctx.cls)).concat([
      "",
      "n = " + ctx.n,
      "circuit = build(n)",
      "# block size 2 and FusedSWAP insertion; mpi_size 0 takes the MPI world size",
      "QuantumCircuitOptimizer().optimize(circuit, 2, 1)",
      "state = QuantumState(n, use_multi_cpu=True)  # divided among the ranks",
      ""
    ]).concat(timed("circuit.update_quantum_state(state)")), "mpiQulacs, distributed state vector on " + nodes + " nodes", "mpiQulacs");
  }
  function cudaqGPU(ctx, opts) {
    var samples = ctx.output === "samples";
    var mg = opts.gpus > 1;
    var lines = [];
    if (mg) {
      lines.push("# Launch on " + opts.gpus + " A100" + (opts.gpus > 4 ? "-80 (" + opts.gpus / 4 + " nodes)" : " of one node") + ", one MPI rank per GPU:");
      lines.push("#   mpirun -np " + opts.gpus + " python run_cudaq_mgpu.py");
    } else lines.push("# Launch:  python run_cudaq.py   (one A100)");
    lines = lines.concat(["import math, random, time", "import numpy as np", "import cudaq", ""]);
    if (mg) lines.push("cudaq.mpi.initialize()");
    lines.push("cudaq.set_target(\"nvidia\", option=\"" + (mg ? "mgpu,fp64" : "fp64") + "\")  # single precision is the default of this target", "");
    lines = lines.concat(builder(CUDAQ, ctx.cls)).concat(["", "n = " + ctx.n, "kernel = build(n" + (samples ? ", measure=True" : "") + ")", ""]);
    if (samples) lines = lines.concat(timed("counts = cudaq.sample(kernel, shots_count=1024)"));
    else if (opts.host) lines = lines.concat(timed("amplitudes = np.array(cudaq.get_state(kernel))  # copies the state to host memory"));
    else lines = lines.concat(timed("state = cudaq.get_state(kernel)  # the state stays on the GPU" + (mg ? "s" : "")));
    if (mg) lines.push("cudaq.mpi.finalize()");
    return head(lines, "CUDA-Q, nvidia target" + (mg ? " with the mgpu option on " + opts.gpus + " GPUs" : " on one GPU"), "CUDA-Q");
  }
  function cudaqTN(ctx, rings) {
    return head([
      "# Launch:  python run_cudaq_tensornet.py   (one A100)",
      "import math, random, time",
      "import cudaq",
      "",
      "cudaq.set_target(\"tensornet\")  # exact contraction through cuTensorNet, double precision by default",
      ""
    ].concat(builder(CUDAQ, ctx.cls === "deep" ? "deep" : "lowent", rings)).concat([
      "",
      "n = " + ctx.n,
      "kernel = build(n, measure=True)",
      ""
    ]).concat(timed("counts = cudaq.sample(kernel, shots_count=1024)  # the path search runs inside this call")), "CUDA-Q tensor network, 1024 samples", "CUDA-Q");
  }
  function cudaqStim(ctx) {
    return head([
      "# Launch:  python run_cudaq_stim.py",
      "import math, random, time",
      "import cudaq",
      "",
      "cudaq.set_target(\"stim\")",
      ""
    ].concat(builder(CUDAQ, "clifford")).concat(["", "n = " + ctx.n, "kernel = build(n, measure=True)", ""]).concat(
      timed("counts = cudaq.sample(kernel, shots_count=1024)")), "CUDA-Q Stim target", "CUDA-Q");
  }
  function qiboSV(ctx, opts) {
    var samples = ctx.output === "samples";
    return head([
      "# Launch:  python run_qibo.py",
      "import math, random, time",
      "import qibo",
      "from qibo import Circuit, gates",
      "",
      opts.platform ? "qibo.set_backend(\"qibojit\", platform=\"" + opts.platform + "\")" : "qibo.set_backend(\"numpy\")",
      "qibo.set_dtype(\"complex128\")",
      ""
    ].concat(builder(QIBO, ctx.cls)).concat([
      "",
      "n = " + ctx.n,
      "c = build(n)",
      samples ? "c.add(gates.M(*range(n)))" : "",
      ""
    ]).concat(timed("result = c(" + (samples ? "nshots=1024" : "") + ")"))
      , opts.platform ? "Qibo, qibojit backend on " + (opts.platform === "cupy" ? "the GPU (CuPy)" : "CPU threads (Numba)") : "Qibo, NumPy backend", "Qibo");
  }
  function qiboDM(ctx) {
    return head([
      "# Launch:  python run_qibo_dm.py",
      "import math, random, time",
      "import qibo",
      "from qibo import Circuit, gates",
      "",
      "qibo.set_backend(\"numpy\")",
      ""
    ].concat(builder(QIBO, "dense")).concat([
      "",
      "n = " + ctx.n,
      "p = 0.01  # depolarising parameter of Section 5.6, the same channel as Qiskit Aer",
      "c = build(n, density_matrix=True, noise=p)",
      ""
    ]).concat(timed("rho = c().state()")), "Qibo, NumPy backend, density matrix with depolarising noise (QFT)", "Qibo",
    ["Compare backends only with the same channel definition (Section 5.6)."]);
  }
  function qiboClifford(ctx) {
    return head([
      "# Launch:  python run_qibo_clifford.py",
      "import math, random, time",
      "import qibo",
      "from qibo import Circuit, gates",
      "",
      "qibo.set_backend(\"clifford\")",
      ""
    ].concat(builder(QIBO, "clifford")).concat(["", "n = " + ctx.n, "c = build(n)", ""]).concat(
      timed("result = c()  # builds the tableau without sampling")).concat(["tableau = result.symplectic_matrix"]), "Qibo Clifford backend, tableau output", "Qibo");
  }
  function questC(ctx, mode) {
    var cls = ctx.cls;
    var body;
    if (cls === "dense") body = [
      "    for (int j = 0; j < n; j++) {",
      "        applyHadamard(q, j);",
      "        for (int k = j + 1; k < n; k++)",
      "            applyTwoQubitPhaseShift(q, k, j, M_PI / (qreal) (1LL << (k - j)));",
      "    }",
      "    for (int j = 0; j < n / 2; j++)",
      "        applySwap(q, j, n - 1 - j);"
    ];
    else if (cls === "clifford") body = [
      "    srand(1);",
      "    for (int l = 0; l < 10; l++) {",
      "        for (int i = 0; i < n; i++) {",
      "            switch (rand() % 6) {",
      "                case 0: applyHadamard(q, i); break;",
      "                case 1: applyS(q, i); break;",
      "                case 2: applyPhaseShift(q, i, -M_PI / 2); break;",
      "                case 3: applyPauliX(q, i); break;",
      "                case 4: applyPauliY(q, i); break;",
      "                default: applyPauliZ(q, i);",
      "            }",
      "        }",
      "        for (int i = 0; i + 1 < n; i += 2) applyControlledPauliX(q, i, i + 1);",
      "        for (int i = 1; i + 1 < n; i += 2) applyControlledPauliX(q, i, i + 1);",
      "    }"
    ];
    else body = [
      "    srand(1);",
      "    for (int i = 0; i < n; i++) { applyRotateZ(q, i, A()); applyRotateX(q, i, A()); }",
      "    for (int r = 0; r < 8; r++) {",
      "        for (int i = 0; i < n; i++) applyControlledPauliX(q, i, (i + 1) % n);",
      "        if (r < 7) for (int i = 0; i < n; i++) { applyRotateZ(q, i, A()); applyRotateX(q, i, A()); applyRotateZ(q, i, A()); }",
      "    }",
      "    for (int i = 0; i < n; i++) { applyRotateX(q, i, A()); applyRotateZ(q, i, A()); }"
    ];
    var gpu = mode === "gpu";
    var threads = mode === "thread" ? 1 : 128;
    var build = [
      "// Build QuEST 4.2.0 with its own kernels, double precision (Table 4.3):",
      "//   cmake -B build -DFLOAT_PRECISION=2 -DENABLE_MULTITHREADING=ON" + (gpu ? " -DENABLE_CUDA=ON -DENABLE_CUQUANTUM=OFF -DCMAKE_CUDA_ARCHITECTURES=80" : "") +
        " -DUSER_SOURCE=run_quest.c -DOUTPUT_EXE=run_quest",
      "//   cmake --build build -j",
      gpu ? "// Run:  ./build/run_quest   (one A100)" : "// Run:  OMP_NUM_THREADS=" + threads + " ./build/run_quest",
      "// The dissertation's C program read the circuit from an OpenQASM file (Section 4.4.1); this one builds it in code."
    ];
    var text = build.concat([
      "#define _GNU_SOURCE",
      "#include \"quest.h\"",
      "#include <math.h>",
      "#include <stdio.h>",
      "#include <stdlib.h>",
      "#include <time.h>",
      "#ifndef M_PI",
      "#define M_PI 3.14159265358979323846",
      "#endif",
      "#define A() (2 * M_PI * rand() / (qreal) RAND_MAX)  /* random rotation angle */",
      "",
      "int main(void) {",
      "    initQuESTEnv();",
      "    int n = " + ctx.n + ";",
      "    Qureg q = createQureg(n);",
      "    initZeroState(q);",
      "    struct timespec t0, t1;",
      "    syncQuESTEnv();",
      "    clock_gettime(CLOCK_MONOTONIC, &t0);"
    ]).concat(body).concat([
      "    syncQuESTEnv();",
      "    clock_gettime(CLOCK_MONOTONIC, &t1);",
      "    printf(\"simulation time %.4f s\\n\", (t1.tv_sec - t0.tv_sec) + 1e-9 * (t1.tv_nsec - t0.tv_nsec));",
      "    printf(\"P(0...0) = %g\\n\", (double) calcProbOfBasisState(q, 0));",
      "    destroyQureg(q);",
      "    finalizeQuESTEnv();",
      "    return 0;",
      "}"
    ]);
    return text.map(function (l) { return l.indexOf("# ") === 0 ? "//" + l.slice(1) : l; });
  }

  /* ---------- selection ---------- */
  function forOutcome(rec, ctx) {
    var b = rec.b, reg = String(rec.regime || "");
    var c = { n: ctx.n, cls: ctx.cls || "dense", output: ctx.output, fromFile: !!ctx.fromFile };
    var lines = null, file = null, lang = "python";
    if (rec.kind === "dm") {
      if (b === "Qiskit Aer") { lines = aerDM(c); file = "run_aer_dm.py"; }
      else if (b === "Qibo NumPy") { lines = qiboDM(c); file = "run_qibo_dm.py"; }
    } else if (b === "Qiskit Aer Stabilizer") { lines = aerStab(c); file = "run_aer_stabilizer.py"; }
    else if (b === "Qibo Clifford") { lines = qiboClifford(c); file = "run_qibo_clifford.py"; }
    else if (b === "CUDA-Q Stim") { lines = cudaqStim(c); file = "run_cudaq_stim.py"; }
    else if (b === "CUDA-Q" && reg.indexOf("Tensor network") === 0) {
      lines = cudaqTN(c, c.cls === "deep" ? 20 : 1); file = "run_cudaq_tensornet.py";
    } else if (b === "Qulacs") {
      if (reg.indexOf("A100") !== -1) { lines = qulacsGPU(c); file = "run_qulacs_gpu.py"; }
      else { lines = qulacsCPU(c, reg.indexOf("128 threads") !== -1 ? 128 : 1); file = "run_qulacs.py"; }
    } else if (b === "mpiQulacs") { lines = mpiQulacs(c, 64); file = "run_mpiqulacs.py"; }
    else if (b === "Qiskit Aer") {
      if (reg.indexOf("128 MPI ranks") !== -1) { lines = aerMPI(c, 16); file = "run_aer_mpi.py"; }
      else if (reg.indexOf("16 A100-80") !== -1) { lines = aerMGPU(c, 16); file = "run_aer_mgpu.py"; }
      else if (reg.indexOf("8 A100-80") !== -1) { lines = aerMGPU(c, 8); file = "run_aer_mgpu.py"; }
      else if (reg.indexOf("A100") !== -1) { lines = aerGPU(c); file = "run_aer_gpu.py"; }
      else { lines = aerCPU(c, reg.indexOf("128 threads") !== -1 ? 128 : 1); file = "run_aer.py"; }
    } else if (b === "CUDA-Q") {
      if (reg.indexOf("8 A100-80") !== -1) { lines = cudaqGPU(c, { gpus: 8 }); file = "run_cudaq_mgpu.py"; }
      else if (reg.indexOf("of one node") !== -1) { lines = cudaqGPU(c, { gpus: c.n <= 32 ? 1 : 4, host: false }); file = c.n <= 32 ? "run_cudaq.py" : "run_cudaq_mgpu.py"; if (c.n <= 32) lines.splice(2, 0, "# One A100-80 holds the state up to n = 32; four GPUs of the node shorten the run (Table 5.5): mgpu,fp64 with mpirun -np 4."); }
      else { lines = cudaqGPU(c, { gpus: 1, host: c.output === "state" }); file = "run_cudaq.py"; }
    } else if (b === "QuEST") {
      lang = "c";
      file = "run_quest.c";
      lines = questC(c, reg.indexOf("A100") !== -1 ? "gpu" : reg.indexOf("128 threads") !== -1 ? "node" : "thread");
    } else if (b === "qibojit") {
      lines = qiboSV(c, { platform: reg.indexOf("A100") !== -1 ? "cupy" : "numba" }); file = "run_qibo.py";
    } else if (b === "Qibo NumPy") {
      lines = qiboSV(c, {}); file = "run_qibo.py";
    }
    if (!lines) return null;
    return { file: file, lang: lang, text: join(lines) };
  }

  window.RunConfig = { forOutcome: forOutcome };
})();
