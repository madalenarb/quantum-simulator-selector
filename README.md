# Quantum Simulator Selector (prototype)

The prototype mentioned in Section 6.3 of the dissertation *Accelerating Quantum Circuit
Simulation with NVIDIA GPUs and tools editing* (Madalena Barros, Instituto Superior Técnico,
2026). It encodes both levels of the selection framework of Section 5.8 and the results of
Chapter 5 as rules: it asks what the researcher needs, or takes the answers from Figure 5.13
itself, follows the figure (simulation method first, state-vector backend second) and returns
the configuration that was fastest in the measurements, with those measurements, every other
backend measured at that size, how the dissertation ran it, and the limits of the
measurements.

Published at https://madalenarb.github.io/quantum-simulator-selector/

## How it works

1. **Questions.** One question at a time, grouped as in Figure 5.13: the first level
   (noise, circuits, output, qubits) decides the simulation method, the second level
   (hardware and its scale) the state-vector backend. Circuits and hardware are
   multi-select. The circuits listed are the ones that the dissertation ran: the QFT, the
   HEA (one layer and several), GHZ and the ten-layer Clifford circuit. A circuit of the
   researcher's own can be read from an OpenQASM 2 or 3 file (or pasted), named and
   classified by hand, or marked "Not sure"; its result is then marked as a best guess.
   Answers can be changed at any time.
2. **Figure 5.13.** The flowchart of the dissertation is drawn beside the questions, in its
   own shapes and colours. The path of the answers is drawn into it as they are given, and
   the box that the query reaches is outlined. On narrow screens the same path is also given
   as a list. The figure also takes answers: every yes and no and every box is a button.
   A branch sets what it decides (the circuits, the hardware, the size or the scale) and
   leaves the other answers as they are; a box sets a complete query that ends in it,
   keeping the current circuits and size where the box stands for them and otherwise
   taking the circuit and size of the box. The result appears as soon as the query is
   complete.
3. **Result.** One configuration per circuit structure (and per hardware, if both were
   chosen). Each one gives
   - the method and the backend, as the two levels of the framework select them, and the
     reason, with its section of the dissertation;
   - **Path through Figure 5.13**: the decisions taken and the box reached;
   - **Measurements**: a plot of the series it rests on, with the size asked marked, and a
     table of every backend measured at that size, ranked by time, with its ratio to the
     fastest and one observation from Chapter 5;
   - **Run configuration**: how the dissertation ran that backend in that regime (version,
     layout, settings, what the timer covers and the repetitions, from Tables 4.3 and 4.4 and
     Sections 4.3 and 4.4), written for the circuits and the size of the query, with links
     to the pages of the library's documentation that describe those settings, and with
     tips where good practice goes beyond those runs (thread pinning and placement, gate
     fusion in Qulacs, leaving the state on the GPU, tuning the transport between nodes).
     The page gives no code, since the calls belong to each library and change between
     versions;
   - the conditions under which it holds.

   Below them come the memory the state needs on every platform and what lies outside the
   measurements for this query.

"See an example" runs a sample query (QFT and GHZ, 30 qubits, CPUs and GPUs).
**Copy link** copies a link that reopens the same result; the bare address always opens an
empty set of questions, and "New query" clears the link from the address bar.

The **Tools** at the bottom work with or without a query: a memory calculator (state vector
or density matrix, double or single precision, any number of devices, with the exchange buffer
of distributed QuEST) and a side-by-side comparison of two execution configurations from the
measured series.

## How the configuration is chosen

The rules in `js/rules.js` follow Tables 5.9 and 5.10 and the boxes of Figure 5.13. Every
query has one path through the figure (`figPath()`), and the box at its end names the backend
that the framework recommends for that regime. `aim()` goes the other way, from a branch or a
box of the figure to the answers. The text of Chapter 5 refines the boxes where
it gives sizes: on one thread, for example, Qiskit Aer leads the QFT from n = 21 to 28 and
QuEST the Clifford circuit from n = 13 to 28, although the box of the figure is Qulacs. When
the result departs from the box in this way, the page says so.

Where a regime has a measured sweep (Figure 5.1), the rule is also checked against the
measurement at the size asked. If another backend measured more than 10 % faster there, the
result switches to it and says so; within 10 % the rule stands and the near tie is listed under
the conditions. Points that the Figure 5.1 caption marks as not full-node times never decide a
result.

The single-GPU boxes (n = 24 to 30) rest on runs that copy the state to host memory, and the
one-GPU-node box (n = 31 to 34) on runs that leave the state on the GPUs, as in Section 5.8.

Times are the values plotted in Chapter 5. Values between two measured sizes are interpolated
(marked ~), and values beyond the end of a series are extrapolated with at least a doubling per
qubit for state vectors and a fourfold growth for density matrices (marked ≈). Configurations
that cannot hold the state show no time.

## OpenQASM reader

`js/qasm.js` reads the subset that circuit libraries export: registers (`qreg`, `qubit`),
gate calls with parameters and broadcast over registers, the gates of `qelib1.inc` and
`stdgates.inc`, user-defined gates (expanded), the modifiers `ctrl`, `negctrl`, `inv` and
`pow`, measurement, reset, barrier and `if`. Loops and subroutines are reported as
unsupported. From the expanded circuit it counts qubits, gates and depth and suggests one of
the circuit structures of Table 5.9:

- **Clifford-only**, by an exact test on the gate matrices, angles included;
- **Low-bond-dimension circuits** when the gates crossing any cut of the qubit chain can raise
  its Schmidt rank to at most 4;
- **Densely connected non-Clifford** when half of all qubit pairs share a gate, or most
  two-qubit gates join qubits that are not neighbours;
- **Growing local entanglement** otherwise.

The last three are heuristics, so the result marks the circuit as "From your file" and the
structure can be changed by hand. Files stay in the browser; nothing is uploaded.

## Open it

No build step and no dependencies.

**Option 1, from a local server (recommended):**

```
cd quantum-simulator-selector
python3 -m http.server 8000
```

Then open http://localhost:8000 in a browser.

**Option 2:** double-click `index.html`. It also works from the file system; copied links
then point to the published site.

The page loads no fonts, images or libraries from other sites, and stores nothing in the
browser.

## Files

- `index.html`: page structure, with the questions, the result, the figure and the tools
- `css/style.css`: the look of the page, taken from the dissertation: the sans-serif of its
  text, the colours and shapes of Figure 5.13, ruled tables and plots drawn like those of
  Chapter 5 (tokens at the top)
- `js/data.js`: the measured times behind every plot and ranking, generated by
  `tools/make_data.py`; do not edit by hand
- `js/rules.js`: the questions, the catalogue of measured circuits with their structure
  classes, the memory limits, every decision rule with its section references, the path of
  each query through Figure 5.13, and the answers that follow from a choice made in the
  figure. New backends or workloads are added here.
- `js/flow.js`: Figure 5.13 as a drawing whose branches and boxes are buttons, the path of
  the answers in it, and the same path as a list
- `js/evidence.js`: the plots, the rankings with one observation per backend, and the
  interpolation and extrapolation rules
- `js/qasm.js`: the OpenQASM reader and its structure analysis
- `js/runconfig.js`: the run configurations (how the dissertation ran each backend in each
  regime) and the addresses of the documentation pages
- `js/tools.js`: the memory calculator, the comparison of two configurations, and the list of
  limits of the measurements
- `js/app.js`: the interface (questions, validation, links, result, copy summary)
- `tools/make_data.py` and `tools/inputs/`: rebuild `js/data.js` from the thesis data files
  (`python tools/make_data.py DIR`, where `DIR` holds `values.xlsx`, `QUEST_GPU_FINAL.md`
  and `tn_figure_values.csv`; see the header of the script)

## Scope

Recommendations reflect the measurements of the dissertation: Deucalion x86 nodes (two AMD
EPYC 7742), A100-40 and A100-80 nodes with four GPUs, and the i9-13900KS platform for the
density-matrix runs, all in double precision. Results outside the measured range, and states
that no platform of the study holds, are flagged as such. Other circuits, builds or machines
may rank differently. The run configurations describe the runs of the dissertation; the
documentation of each library, which the page links to, is the reference for setting them up.
