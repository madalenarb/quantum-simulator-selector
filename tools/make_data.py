"""Builds js/data.js, the measured times behind the selector.

Usage:  python tools/make_data.py INPUT_DIR

INPUT_DIR holds three files from the thesis data:
  values.xlsx           the values plotted in Figure 5.1 (sheet "All points")
  QUEST_GPU_FINAL.md    the QuEST 4.2 runs on one A100-40 (Figure 5.1, GPU row) and on
                        1 to 16 A100-80 (Figures 5.6 and 5.7)
  tn_figure_values.csv  the values plotted in Figure 5.12
tools/inputs/ ships weak.json and dm.json, read from the plotted Figures 5.4 and 5.9.
Tables 5.3 and 5.5 are typed in below. Needs openpyxl.
"""
import openpyxl, json, re, csv, collections, os, sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
IN = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "js", "data.js")

def sig(x, k=4):
    if x is None: return None
    if x == 0: return 0
    return float(f'{x:.{k}g}')

# ---------- Figure 5.1 (values.xlsx: the values the plot script drew) ----------
wb = openpyxl.load_workbook(os.path.join(IN, 'values.xlsx'), data_only=True)
rows = list(wb['All points'].iter_rows(min_row=2, values_only=True))
REG = {'1 thread (x86 EPYC 7742)': 'thread', '128 threads (x86 EPYC 7742)': 'node', 'Single GPU (A100)': 'gpu'}
CIR = {'QFT': 'qft', 'HEA': 'hea', 'Clifford': 'clifford'}
BK = {'Qulacs': 'Qulacs', 'Qiskit Aer': 'Qiskit Aer', 'QuEST': 'QuEST', 'CUDA-Q': 'CUDA-Q', 'Qibo': 'Qibo NumPy', 'Qibo-qibojit': 'qibojit'}
sweep = {r: {c: collections.defaultdict(dict) for c in CIR.values()} for r in REG.values()}
notes = collections.defaultdict(dict)
for r in rows:
    reg, cir, bk, n, t, _, _, note = r[:8]
    reg, cir, bk, n = REG[reg], CIR[cir], BK[bk], int(n)
    if reg == 'gpu' and bk == 'QuEST':
        continue                                              # replaced by the exclusive QuEST 4.2 runs below
    sweep[reg][cir][bk][n] = sig(t)
    if note == 'login node':
        notes[f'{reg}|{cir}|{bk}'][n] = 'ran on a login node, not a full-node time (Figure 5.1 caption)'
for n in (9, 10, 11, 12):
    notes['node|qft|Qulacs'][n] = 'ran confined to one core, not a full-node time (Figure 5.1 caption)'
# QuEST 4.2 on one A100-40: fastest of ten repetitions on a reserved node (QUEST_GPU_FINAL.md)
md = open(os.path.join(IN, 'QUEST_GPU_FINAL.md'), encoding='utf-8').read()
sec = md.split('## Fig 5.1, GPU row')[1].split('## Fig 5.6')[0]
for cname, ckey in [('### QFT', 'qft'), ('### HEA', 'hea'), ('### Clifford', 'clifford')]:
    part = sec.split(cname)[1].split('###')[0]
    for n, f in re.findall(r'^\| (\d+) \| ([\d.]+) \|', part, re.M):
        sweep['gpu'][ckey]['QuEST'][int(n)] = sig(float(f))

def series_dict(d):
    return {b: [[n, d[b][n]] for n in sorted(d[b])] for b in d}
sweep_js = {r: {c: series_dict(sweep[r][c]) for c in sweep[r]} for r in sweep}

# ---------- Figs 5.6 and 5.7: QFT on 1 to 16 A100-80, state kept on the GPUs (medians) ----------
fig57 = md.split('## Fig 5.7')[1].split('**Cells QuEST cannot run**')[0]
multigpu = {'CUDA-Q': collections.defaultdict(dict), 'Qiskit Aer': collections.defaultdict(dict), 'QuEST': collections.defaultdict(dict)}
for line in fig57.splitlines():
    m = re.match(r'^\| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\S+) \| (\S+) \| (\S+) \| (\S+) \| (\S+) \| (\S+) \| (\S+) \| (\S+) \|$', line)
    if not m: continue
    n, g = int(m.group(1)), int(m.group(2))
    quest, status, cq, aer = m.group(5), m.group(9), m.group(11), m.group(12)
    if status == 'ok': multigpu['QuEST'][n][g] = sig(float(quest))
    if cq not in ('—', '-'): multigpu['CUDA-Q'][n][g] = sig(float(cq))
    if aer not in ('—', '-'): multigpu['Qiskit Aer'][n][g] = sig(float(aer))
multigpu_js = {b: {str(n): dict(sorted((str(g), t) for g, t in d.items())) for n, d in sorted(v.items())} for b, v in multigpu.items()}

# ---------- Table 5.5: CUDA-Q on one, two and four A100-80 of one node ----------
gpunode = {
    'qft': {'1': {'28': 0.245, '30': 0.692, '32': 2.617}, '2': {'28': 0.219, '30': 0.561, '32': 1.856, '33': 3.702},
            '4': {'28': 0.177, '30': 0.384, '32': 1.152, '33': 2.149, '34': 4.379}},
    'hea': {'1': {'28': 0.603, '30': 2.187, '32': 8.842}, '2': {'28': 0.416, '30': 1.292, '32': 4.975, '33': 10.318},
            '4': {'28': 0.300, '30': 0.767, '32': 2.663, '33': 5.311, '34': 10.962}}
}

# ---------- Table 5.3: QFT at n = 30 on 1 to 64 x86 nodes, fastest of all repetitions ----------
strong = {
    'mpiQulacs': {'1': 63.04, '2': 39.20, '4': 20.04, '8': 13.83, '16': 5.25, '32': 3.80, '64': 1.20},
    'QuEST': {'1': 251.89, '2': 173.71, '4': 99.85, '8': 61.02, '16': 36.33, '32': 17.44, '64': 11.89},
    'Qiskit Aer': {'1': 14.87, '2': 7.97, '4': 5.39, '8': 2.18, '16': 1.08},
    'Qiskit Aer, one rank per node': {'1': 1084.07, '2': 560.76, '4': 289.54, '8': 145.23, '16': 71.48, '32': 35.78, '64': 18.76}
}
single_job = {'mpiQulacs': ['64'], 'QuEST': ['2', '8', '32', '64']}

# ---------- Figure 5.4: weak scaling, 4 GiB per node (decoded from the PDF, within 0.2 %) ----------
weak = json.load(open(os.path.join(HERE, 'inputs', 'weak.json')))
wmap = {'mpiQulacs (1 rank/node)': 'mpiQulacs', 'QuEST (1 rank/node)': 'QuEST', 'Qiskit Aer (128 ranks/node)': 'Qiskit Aer',
        'Qiskit Aer (1 rank/node)': 'Qiskit Aer, one rank per node'}
weak_js = {wmap[k]: {str(nodes): sig(t, 3) for nodes, t in v.items()} for k, v in weak['series'].items()}

# ---------- Figure 5.9: density matrix with depolarising noise, i9-13900KS (decoded) ----------
dm = json.load(open(os.path.join(HERE, 'inputs', 'dm.json')))
dm_js = {'time': {b: [[int(n), sig(t, 3)] for n, t in sorted(v.items(), key=lambda x: int(x[0]))] for b, v in dm['time'].items()},
         'fidelity': {b: [[int(n), round(t, 3)] for n, t in sorted(v.items(), key=lambda x: int(x[0]))] for b, v in dm['fidelity'].items()}}

# ---------- Figure 5.12: tensor network on one A100-40, 1024 samples (completed runs) ----------
tn = collections.defaultdict(list)
TNMAP = {'CUDA-Q TN, GHZ': 'CUDA-Q · GHZ', 'CUDA-Q TN, HEA L=1': 'CUDA-Q · HEA, one layer', 'CUDA-Q TN, HEA L=20': 'CUDA-Q · HEA, twenty layers',
         'CUDA-Q TN, QFT': 'CUDA-Q · QFT', 'Qibo cuTN, HEA L=1': 'Qibo · HEA, one layer', 'Qibo cuTN, QFT': 'Qibo · QFT',
         'Qulacs SV, QFT': 'Qulacs state vector · QFT', 'Qiskit Aer SV, QFT': 'Qiskit Aer state vector · QFT'}
for r in csv.DictReader(open(os.path.join(IN, 'tn_figure_values.csv'), newline='')):
    if r['status'] != 'completed' or r['series'] not in TNMAP: continue
    tn[TNMAP[r['series']]].append([int(r['n']), sig(float(r['time_s']), 4)])
tn_js = {k: sorted(v) for k, v in tn.items()}

data = {
    'note': 'Measured times in seconds behind the selector. Generated from the thesis data files; see README.md.',
    'sweep': sweep_js, 'notes': {k: {str(n): v for n, v in d.items()} for k, d in notes.items()},
    'gpunode': gpunode, 'multigpu': multigpu_js,
    'strong': {'n': 30, 'series': strong, 'singleJob': single_job},
    'weak': {'n0': 28, 'series': weak_js, 'noMpiRef': sig(weak['aer_single_node_ref'], 3)},
    'dm': dm_js, 'tn': tn_js
}
js = '/* Generated by tools/make_data.py from the data behind Chapter 5. Do not edit by hand. */\nwindow.SelectorData = ' + json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ';\n'
open(OUT, 'w', encoding='utf-8').write(js)
print('wrote', OUT, len(js), 'bytes')
print('multigpu', json.dumps(multigpu_js)[:400])
