# Quantum Simulator Selector (prototype)

A mock of the automated selector proposed in Section 6.3 of the dissertation. It asks the
researcher what they need, walks the two-level framework of Section 5.8 (simulation method,
then backend), and returns the fastest configuration measured in Chapter 5, with the evidence,
the conditions under which it holds, the memory the state needs, and the decision path.

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

- `index.html` — page structure
- `css/style.css` — visual design (tokens at the top)
- `js/rules.js` — the questions and every decision rule, with the measured numbers and
  section references. New backends or workloads are added here.
- `js/app.js` — the interface (question flow, result panel, memory meter, copy summary)
- `js/bloch.js` — the decorative Bloch sphere, which collapses when a recommendation is made

## Scope

Recommendations reflect the measurements of this dissertation: Deucalion x86 nodes (two AMD
EPYC 7742), A100-40 and A100-80 nodes with four GPUs, and an i9-13900KS workstation for the
density-matrix runs, all in double precision. Results outside the measured range are flagged
as such. Other circuits, builds or machines may rank differently.
