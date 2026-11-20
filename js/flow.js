/*
 * Figure 5.13 of the dissertation as a live drawing: the two-level selection flowchart in
 * the shapes and colours of the original, with the path of the current answers drawn in.
 * The layout follows the figure; the ids of decisions and boxes are the ones that
 * Selector.figPath() (js/rules.js) returns.
 *
 * Flow.svg() returns the drawing as an SVG string, Flow.mark(svg, paths) draws the paths
 * of Selector.figPaths() into it, and Flow.pathList(path) gives the same path as a list
 * for narrow screens and screen readers. The yes and no of every decision and every box
 * are buttons (class "pick", with data-edge or data-node), which js/app.js turns into
 * answers through Selector.aim().
 */
(function () {
  "use strict";

  var S = window.Selector;
  var W = 760, H = 906;
  var V = "<tspan class=\"var\">n</tspan>";
  var NV = "<i>n</i>";

  // Decisions: centre (x, y), half-width w, half-height h, lines in the drawing, text in lists.
  var DECISIONS = {
    noise: { x: 379, y: 100, w: 67, h: 32, t: ["Exact noisy", "evolution?"], text: "Exact noisy evolution?" },
    clifford: { x: 379, y: 184, w: 70, h: 34, t: ["Clifford gates", "only?"], text: "Clifford gates only?" },
    tn: { x: 379, y: 272, w: 76, h: 36, t: ["Suited to a", "tensor network?"], text: "Suited to a tensor network?" },
    samples: { x: 540, y: 272, w: 50, h: 28, t: ["Samples", "only?"], text: "Samples only?" },
    gpu: { x: 379, y: 446, w: 79, h: 38, t: ["GPU execution", "chosen?"], text: "GPU execution chosen?" },
    n33: { x: 256, y: 532, w: 68, h: 34, t: [V + " ≤ 33?"], sub: ["one CPU node"], text: NV + " ≤ 33? (one CPU node)" },
    nodes: { x: 256, y: 617, w: 67, h: 33, t: ["Several", "nodes?"], text: "Several nodes?" },
    n23: { x: 502, y: 532, w: 53, h: 27, t: [V + " ≤ 23?"], text: NV + " ≤ 23?" },
    n34: { x: 502, y: 617, w: 68, h: 34, t: [V + " ≤ 34?"], sub: ["four A100-80"], text: NV + " ≤ 34? (four A100-80)" },
    n30: { x: 502, y: 711, w: 86, h: 42, t: [V + " ≤ 30?"], sub: ["one-GPU", "comparison"], text: NV + " ≤ 30? (one-GPU comparison)" }
  };

  // Outcome boxes: corner (x, y), size, the backend named, lines in the drawing, text in lists.
  var BOXES = {
    dm: { x: 597, y: 75, w: 153, h: 50, b: "Qiskit Aer", t: ["density matrix, measured", "fastest from " + V + " ≈ 8"], text: "density matrix, measured fastest from " + NV + " ≈ 8" },
    stabAer: { x: 597, y: 147, w: 153, h: 35, b: "Qiskit Aer Stabilizer", t: ["for sampled output"], text: "for sampled output" },
    stabQibo: { x: 597, y: 186, w: 153, h: 35, b: "Qibo Clifford", t: ["for the tableau alone"], text: "for the tableau alone" },
    tnBox: { x: 612, y: 239, w: 138, h: 66, b: "CUDA-Q", t: ["tensor network,", V + " = 500 reached", "on the circuits tested"], text: "tensor network, " + NV + " = 500 reached on the circuits tested" },
    mpi34: { x: 10, y: 514, w: 134, h: 36, b: "mpiQulacs", t: [V + " = 34 on 64 nodes"], text: NV + " = 34 on 64 nodes" },
    aerNodes: { x: 10, y: 571, w: 134, h: 51, b: "Qiskit Aer", t: ["up to 16 nodes,", "128 ranks per node"], text: "up to 16 nodes, 128 ranks per node" },
    mpiNodes: { x: 10, y: 626, w: 134, h: 36, b: "mpiQulacs", t: ["32 and 64 nodes"], text: "32 and 64 nodes" },
    thread: { x: 188, y: 672, w: 136, h: 36, b: "Qulacs", t: ["one thread"], text: "one thread" },
    node: { x: 188, y: 712, w: 136, h: 36, b: "Qiskit Aer", t: ["128 threads"], text: "128 threads" },
    gpuQulacs: { x: 612, y: 514, w: 138, h: 36, b: "Qulacs", t: ["one GPU"], text: "one GPU" },
    cq8: { x: 612, y: 579, w: 138, h: 36, b: "CUDA-Q", t: ["eight GPUs, " + V + " = 35"], text: "eight GPUs, " + NV + " = 35" },
    aer16: { x: 612, y: 619, w: 138, h: 36, b: "Qiskit Aer", t: ["sixteen GPUs, " + V + " = 35"], text: "sixteen GPUs, " + NV + " = 35" },
    cqNode: { x: 612, y: 686, w: 138, h: 51, b: "CUDA-Q", t: ["one to four GPUs of", "one node, " + V + " = 31 to 34"], text: "one to four GPUs of one node, " + NV + " = 31 to 34" },
    aerGpu: { x: 426, y: 771, w: 152, h: 50, b: "Qiskit Aer", t: ["one GPU, QFT, from", V + " = 24 to 30"], text: "one GPU, QFT, from " + NV + " = 24 to 30" },
    cqGpu: { x: 426, y: 825, w: 152, h: 66, b: "CUDA-Q", t: ["one GPU, HEA and", "Clifford, from " + V + " = 25 to", "30; Qulacs at " + V + " = 24"], text: "one GPU, HEA and Clifford, from " + NV + " = 25 to 30; Qulacs at " + NV + " = 24", also: ["Qulacs"] }
  };

  // The two start boxes, one per level.
  var STARTS = {
    start: { x: 190, y: 14, w: 378, h: 36, t: ["Circuit of " + V + " qubits and the output that the task requires"], text: "Circuit of " + NV + " qubits and the output that the task requires" },
    sv: { x: 270, y: 352, w: 218, h: 38, t: ["Dense state vector", "in double precision"], text: "Dense state vector in double precision" }
  };

  // Arrows: polyline points, and the yes or no beside them.
  var EDGES = [
    { id: "start>noise", pts: [[379, 50], [379, 68]] },
    { id: "noise:yes", pts: [[446, 100], [597, 100]], label: "yes", lx: 522, ly: 94 },
    { id: "noise:no", pts: [[379, 132], [379, 150]], label: "no", lx: 386, ly: 145, anchor: "start" },
    { id: "clifford:yes", pts: [[449, 184], [597, 184]], label: "yes", lx: 522, ly: 178 },
    { id: "clifford:no", pts: [[379, 218], [379, 236]], label: "no", lx: 386, ly: 231, anchor: "start" },
    { id: "tn:yes", pts: [[455, 272], [490, 272]], label: "yes", lx: 472, ly: 266 },
    { id: "samples:yes", pts: [[590, 272], [612, 272]], label: "yes", lx: 600, ly: 266 },
    { id: "tn:no", pts: [[379, 308], [379, 352]], label: "no", lx: 386, ly: 334, anchor: "start" },
    { id: "samples:no", pts: [[540, 300], [540, 371], [488, 371]], label: "no", lx: 547, ly: 334, anchor: "start" },
    { id: "sv>gpu", pts: [[379, 390], [379, 408]] },
    { id: "gpu:no", pts: [[300, 446], [256, 446], [256, 498]], label: "no", lx: 278, ly: 440 },
    { id: "gpu:yes", pts: [[458, 446], [502, 446], [502, 505]], label: "yes", lx: 480, ly: 440 },
    { id: "n33:no", pts: [[188, 532], [144, 532]], label: "no", lx: 166, ly: 526 },
    { id: "n33:yes", pts: [[256, 566], [256, 584]], label: "yes", lx: 263, ly: 579, anchor: "start" },
    { id: "nodes:yes", pts: [[189, 617], [144, 617]], label: "yes", lx: 166, ly: 611 },
    { id: "nodes:no", pts: [[256, 650], [256, 672]], label: "no", lx: 263, ly: 665, anchor: "start" },
    { id: "n23:yes", pts: [[555, 532], [612, 532]], label: "yes", lx: 584, ly: 526 },
    { id: "n23:no", pts: [[502, 559], [502, 583]], label: "no", lx: 509, ly: 575, anchor: "start" },
    { id: "n34:no", pts: [[570, 617], [612, 617]], label: "no", lx: 591, ly: 611 },
    { id: "n34:yes", pts: [[502, 651], [502, 669]], label: "yes", lx: 509, ly: 664, anchor: "start" },
    { id: "n30:no", pts: [[588, 711], [612, 711]], label: "no", lx: 600, ly: 705 },
    { id: "n30:yes", pts: [[502, 753], [502, 771]], label: "yes", lx: 509, ly: 766, anchor: "start" }
  ];

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  // Lines of text centred on (cx, cy).
  function lines(cx, cy, list, cls, lh, firstCls) {
    var y0 = cy - (list.length - 1) * lh / 2 + 4;
    return "<text class=\"" + cls + "\" text-anchor=\"middle\">" + list.map(function (l, i) {
      return "<tspan x=\"" + cx + "\" y=\"" + (y0 + i * lh).toFixed(1) + "\"" + (i === 0 && firstCls ? " class=\"" + firstCls + "\"" : "") + ">" + l + "</tspan>";
    }).join("") + "</text>";
  }
  function arrow(e) {
    var p = e.pts;
    var a = p[p.length - 2], b = p[p.length - 1];
    var ux = b[0] - a[0], uy = b[1] - a[1], len = Math.sqrt(ux * ux + uy * uy) || 1;
    ux /= len; uy /= len;
    var bx = b[0] - ux * 7.5, by = b[1] - uy * 7.5;
    var head = [[b[0], b[1]], [bx - uy * 3.4, by + ux * 3.4], [bx + uy * 3.4, by - ux * 3.4]].map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" ");
    // the line stops inside the head so that a thick stroke does not blunt the tip
    var sx = b[0] - ux * 5, sy = b[1] - uy * 5;
    var d = "M" + p.slice(0, -1).map(function (q) { return q[0] + " " + q[1]; }).join("L") + "L" + sx.toFixed(1) + " " + sy.toFixed(1);
    var line = "<path class=\"ln\" d=\"" + d + "\"/><polygon points=\"" + head + "\"/>";
    if (!e.label) return "<g class=\"edge\" data-edge=\"" + e.id + "\">" + line + "</g>";
    // A branch is a button: the arrow and its yes or no, with a wider area that takes the pointer.
    var first = p[0], second = p[1];
    var vx = first[0] - second[0], vy = first[1] - second[1], vl = Math.sqrt(vx * vx + vy * vy) || 1;
    var hit = "M" + (first[0] + vx / vl * 8).toFixed(1) + " " + (first[1] + vy / vl * 8).toFixed(1) +
      p.slice(1, -1).map(function (q) { return "L" + q[0] + " " + q[1]; }).join("") + "L" + (b[0] + ux * 4).toFixed(1) + " " + (b[1] + uy * 4).toFixed(1);
    var question = plain(DECISIONS[e.id.split(":")[0]].text);
    return "<g class=\"edge pick\" data-edge=\"" + e.id + "\" role=\"button\" tabindex=\"-1\" aria-label=\"" + esc(question + " " + e.label) + "\">" +
      "<path class=\"hit\" d=\"" + hit + "\"/><rect class=\"hit\" x=\"" + (e.anchor === "start" ? e.lx - 4 : e.lx - 15) + "\" y=\"" + (e.ly - 13) + "\" width=\"30\" height=\"18\"/>" +
      line + "<text x=\"" + e.lx + "\" y=\"" + e.ly + "\" text-anchor=\"" + (e.anchor || "middle") + "\">" + e.label + "</text></g>";
  }
  function plain(h) { return String(h).replace(/<[^>]+>/g, ""); }

  function svg() {
    var o = [];
    o.push("<svg class=\"flow\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 " + W + " " + H + "\" width=\"" + W + "\" height=\"" + H + "\" role=\"group\" aria-label=\"Figure 5.13 of the dissertation: two-level selection of a simulation method and a state-vector backend. Each yes, no and box sets the answers.\">");
    o.push("<rect class=\"panel\" x=\"3\" y=\"3\" width=\"754\" height=\"317\" rx=\"8\"/>");
    o.push("<rect class=\"panel\" x=\"3\" y=\"340\" width=\"754\" height=\"562\" rx=\"8\"/>");
    o.push("<text class=\"level\" x=\"12\" y=\"21\"><tspan class=\"lv\">First level</tspan><tspan x=\"12\" dy=\"15\">simulation method</tspan></text>");
    o.push("<text class=\"level\" x=\"12\" y=\"358\"><tspan class=\"lv\">Second level</tspan><tspan x=\"12\" dy=\"15\">state-vector backend</tspan></text>");
    EDGES.forEach(function (e) { o.push(arrow(e)); });
    Object.keys(STARTS).forEach(function (id) {
      var b = STARTS[id];
      o.push("<g class=\"node startbox\" data-node=\"" + id + "\"><rect x=\"" + b.x + "\" y=\"" + b.y + "\" width=\"" + b.w + "\" height=\"" + b.h + "\" rx=\"5\"/>" +
        lines(b.x + b.w / 2, b.y + b.h / 2, b.t, "st", 15) + "</g>");
    });
    Object.keys(DECISIONS).forEach(function (id) {
      var d = DECISIONS[id];
      var path = "M" + d.x + " " + (d.y - d.h) + "L" + (d.x + d.w) + " " + d.y + "L" + d.x + " " + (d.y + d.h) + "L" + (d.x - d.w) + " " + d.y + "Z";
      var body;
      if (d.sub) {
        var all = d.t.concat(d.sub), lh = 12.5, y0 = d.y - (all.length - 1) * lh / 2 + 4;
        body = "<text class=\"dt\" text-anchor=\"middle\">" + all.map(function (l, i) {
          return "<tspan x=\"" + d.x + "\" y=\"" + (y0 + i * lh).toFixed(1) + "\"" + (i >= d.t.length ? " class=\"sub\"" : "") + ">" + l + "</tspan>";
        }).join("") + "</text>";
      } else body = lines(d.x, d.y, d.t, "dt", 14);
      o.push("<g class=\"node dec\" data-node=\"" + id + "\"><path d=\"" + path + "\"/>" + body + "</g>");
    });
    Object.keys(BOXES).forEach(function (id) {
      var b = BOXES[id];
      o.push("<g class=\"node box pick\" data-node=\"" + id + "\" role=\"button\" tabindex=\"-1\" aria-label=\"" + esc(b.b + ", " + plain(b.text)) + "\" style=\"--c:" + S.colourOf(b.b) + ";--t:" + S.tintOf(b.b) + "\"><rect x=\"" + b.x + "\" y=\"" + b.y + "\" width=\"" + b.w + "\" height=\"" + b.h + "\" rx=\"4\"/>" +
        lines(b.x + b.w / 2, b.y + b.h / 2, [esc(b.b)].concat(b.t), "bt", 14, "bname") + "</g>");
    });
    o.push("</svg>");
    return o.join("");
  }

  // Elements of the drawing that a path passes: nodes and edges on it, boxes it ends in,
  // the decision that waits for an answer.
  function trace(p, acc) {
    acc.node.start = true;
    acc.edge["start>noise"] = true;
    p.steps.forEach(function (s) { acc.node[s.d] = true; acc.edge[s.d + ":" + s.a] = true; });
    if (p.sv) acc.node.sv = true;
    if (p.sv && (p.open === "gpu" || p.steps.some(function (s) { return s.d === "gpu"; }))) acc.edge["sv>gpu"] = true;
    if (p.open) { acc.node[p.open] = true; acc.open[p.open] = true; }
    if (p.end) { acc.node[p.end] = true; acc.end[p.end] = true; if (p.out) acc.out[p.end] = true; }
    if (p.pair) p.pair.forEach(function (b) { acc.node[b] = true; });
  }
  // Draw the paths into the figure; with none, the figure is shown as printed.
  function mark(root, paths) {
    if (!root) return;
    var acc = { node: {}, edge: {}, end: {}, open: {}, out: {} };
    var any = paths && paths.length > 0;
    (paths || []).forEach(function (x) { trace(x.path || x, acc); });
    root.classList.toggle("has-path", any);
    Array.prototype.forEach.call(root.querySelectorAll(".node"), function (g) {
      var id = g.getAttribute("data-node");
      g.classList.toggle("on", !!acc.node[id]);
      g.classList.toggle("end", !!acc.end[id]);
      g.classList.toggle("open", !!acc.open[id]);
      g.classList.toggle("out", !!acc.out[id]);
      if (g.classList.contains("pick")) g.setAttribute("aria-pressed", acc.end[id] ? "true" : "false");
    });
    Array.prototype.forEach.call(root.querySelectorAll(".edge"), function (g) {
      var on = !!acc.edge[g.getAttribute("data-edge")];
      g.classList.toggle("on", on);
      if (g.classList.contains("pick")) g.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  // Centre of the element where the paths end or wait, in drawing units, to keep it in view.
  function focusPoint(paths) {
    var pts = [];
    (paths || []).forEach(function (x) {
      var p = x.path || x, b = p.end ? BOXES[p.end] : null;
      if (b) pts.push([b.x + b.w / 2, b.y + b.h / 2]);
      else if (p.open) pts.push([DECISIONS[p.open].x, DECISIONS[p.open].y]);
      else if (p.pair) pts.push([BOXES[p.pair[0]].x + BOXES[p.pair[0]].w / 2, BOXES[p.pair[0]].y + BOXES[p.pair[0]].h]);
      else if (p.sv) pts.push([STARTS.sv.x + STARTS.sv.w / 2, STARTS.sv.y + STARTS.sv.h / 2]);
    });
    if (!pts.length) return null;
    var x = 0, y = 0;
    pts.forEach(function (q) { x += q[0]; y += q[1]; });
    return { x: x / pts.length / W, y: y / pts.length / H };
  }

  /* ---------- the same path as a list ---------- */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  // p.out (set by the interface) marks a box that is reached beyond the measured range.
  function pathList(p) {
    var ol = el("ol", "pathlist");
    ol.appendChild(el("li", "pl-start", STARTS.start.text));
    var enteredSV = false;
    function enter() {
      if (!enteredSV && p.sv) { enteredSV = true; ol.appendChild(el("li", "pl-start", STARTS.sv.text)); }
    }
    p.steps.forEach(function (s) {
      if (s.d === "gpu") enter();
      var li = el("li", "pl-dec");
      li.appendChild(el("span", "pl-q", DECISIONS[s.d].text));
      li.appendChild(el("span", "pl-a", s.a));
      if (s.note) li.appendChild(el("span", "pl-note", s.note + "."));
      ol.appendChild(li);
    });
    enter();
    if (p.open) {
      var w = el("li", "pl-dec pl-open");
      w.appendChild(el("span", "pl-q", DECISIONS[p.open].text));
      w.appendChild(el("span", "pl-a", "to be answered"));
      ol.appendChild(w);
    }
    (p.end ? [p.end] : p.pair || []).forEach(function (id) {
      var b = BOXES[id];
      var li = el("li", "pl-box" + (p.end ? "" : " pl-pending") + (p.out || p.none ? " out" : ""));
      li.style.setProperty("--c", S.colourOf(b.b));
      li.style.setProperty("--t", S.tintOf(b.b));
      li.appendChild(el("span", "bname", esc(b.b)));
      li.appendChild(el("span", "pl-bt", b.text));
      ol.appendChild(li);
    });
    if (p.none) ol.appendChild(el("li", "pl-none", p.none + "."));
    return ol;
  }
  // Plain text of a path, for the copied summary.
  function pathText(p) {
    function plain(h) { return String(h).replace(/<[^>]+>/g, ""); }
    var parts = p.steps.map(function (s) { return plain(DECISIONS[s.d].text) + " " + s.a; });
    if (p.end) parts.push("box: " + BOXES[p.end].b + ", " + plain(BOXES[p.end].text));
    else if (p.none) parts.push(p.none);
    return parts.join("; ");
  }

  window.Flow = { svg: svg, mark: mark, focusPoint: focusPoint, pathList: pathList, pathText: pathText, BOXES: BOXES, DECISIONS: DECISIONS, STARTS: STARTS, W: W, H: H };
})();
