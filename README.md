# Quantum Simulator Selector (prototype)

A mock of the automated selector proposed in Section 6.3 of the dissertation. It asks the
researcher what they need, walks the two-level framework of Section 5.8 (simulation method,
then backend), and returns the fastest configuration measured in Chapter 5, with the evidence,
the conditions under which it holds, the memory the state needs, and the decision path.

## How it works

1. **Questionnaire.** One question at a time, each a gate on a qubit wire, while the page
   shows "Measuring". Circuits and hardware are multi-select; an unlisted circuit can be named
   and classified, or marked "Not sure". Answered gates can be changed at any time.
2. **Collapse.** When the last answer is in, a short sequence ("Collapsing the state…") runs
   while the Bloch sphere collapses. It can be skipped.
3. **Readout.** One outcome per structure class (and per hardware, if both were chosen), with
   the measured evidence, the conditions, the memory meter and the decision path. "Change
   answers" reopens the questionnaire in review mode, where edits wait for "Measure again".

"See an example result" on the first screen runs a sample query (QFT, GHZ and Grover search,
30 qubits, CPUs and GPUs).

## Open it

No build step and no dependencies.

**Option 1, from a local server (recommended):**

```
cd quantum-simulator-selector
python3 -m http.server 8000
```

Then open http://localhost:8000 in a browser.

**Option 2:** double-click `index.html`. It also works from the file system.

The fonts load from Google Fonts when online; offline, the page falls back to system fonts.

## Files

- `index.html` — page structure for the three phases
- `css/style.css` — visual design (tokens at the top)
- `js/rules.js` — the questions, the circuit catalogue (each circuit's structure class and
  whether it was measured, matched by gate set, or is inconclusive), the memory limits, and
  every decision rule with its measured numbers and section references. New backends or
  workloads are added here.
- `js/app.js` — the interface (questionnaire, validation, collapse sequence, readout, copy summary)
- `js/bloch.js` — the Bloch spheres, which tilt as questions are answered and collapse at the readout

## Scope

Recommendations reflect the measurements of this dissertation: Deucalion x86 nodes (two AMD
EPYC 7742), A100-40 and A100-80 nodes with four GPUs, and an i9-13900KS workstation for the
density-matrix runs, all in double precision. Results outside the measured range, and states
that no platform of the study holds, are flagged as such. Other circuits, builds or machines
may rank differently.
