/*
 * Interface of the Quantum Simulator Selector, in two phases, the questions and the
 * result, beside Figure 5.13 (js/flow.js), in which the path of the answers is drawn and
 * whose branches and boxes also set the answers. Decision logic lives in window.Selector
 * (js/rules.js), the measurements in js/data.js and js/evidence.js, the OpenQASM reader in
 * js/qasm.js, the run configurations in js/runconfig.js and the side tools in js/tools.js.
 */
(function () {
  "use strict";

  var S = window.Selector, E = window.Evidence, Q = window.QASM, RC = window.RunConfig, T = window.Tools, F = window.Flow;
  var CANONICAL = "https://madalenarb.github.io/quantum-simulator-selector/";
  function $(id) { return document.getElementById(id); }
  var views = { ask: $("askView"), result: $("resultView") };
  var stepsEl = $("steps"), reviewBar = $("reviewBar"), restartBtn = $("restartBtn");
  var colFig = $("colFig"), flowScroll = $("flowScroll");
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Two columns from this width (css/style.css); below it the figure follows the text.
  var wide = window.matchMedia ? window.matchMedia("(min-width: 1244px)") : { matches: false };
  flowScroll.innerHTML = F.svg();
  var flowSvg = flowScroll.querySelector("svg");

  var EXAMPLE = {
    noise: "no",
    circuits: ["qft", "ghz"],
    other: null,
    output: "samples",
    n: 30,
    hw: ["gpu", "cpu"],
    cpuScale: "node"
  };

  var A = emptyAnswers();
  var review = false;      // true after "Change answers": edits wait for "Show the result"
  var isExample = false;
  var editing = null;      // question reopened by "Change" or "Previous"
  var nDraft = 30;
  var draft = freshDraft();
  var lastResult = null, lastFlow = null, lastPaths = [];
  var qasmInfo = null;     // analysis of the last OpenQASM file read

  /* ---------- helpers ---------- */
  function emptyAnswers() { return { circuits: [], other: null, hw: [] }; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function freshDraft() {
    return {
      circuits: A.circuits ? A.circuits.slice() : [],
      otherOn: !!(A.other && A.other.name),
      otherName: A.other ? A.other.name : "",
      otherCls: A.other ? A.other.cls : null,
      otherSrc: A.other && A.other.src ? A.other.src : null,
      hw: S.hwList(A).slice()
    };
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function strip(html) { var d = document.createElement("div"); d.innerHTML = html; return d.textContent || ""; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function lc(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
  function warn(s) { return "<span class=\"warn\">" + s + "</span>"; }
  function sup(s) { return String(s).replace(/2\^(\d+)/g, function (m, d) { return "2" + d.split("").map(function (x) { return "⁰¹²³⁴⁵⁶⁷⁸⁹"[+x]; }).join(""); }); }
  function show(name) { Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; }); }
  function scrollToEl(node) {
    var top = node.getBoundingClientRect().top + window.pageYOffset - 16;
    window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? "auto" : "smooth" });
  }
  function copyText(text, status, holder, label) {
    function fallback() {
      holder.innerHTML = "";
      var ta = el("textarea", "copybox");
      ta.readOnly = true;
      ta.value = text;
      ta.setAttribute("aria-label", label);
      holder.appendChild(ta);
      ta.focus(); ta.select();
      status.textContent = "Select all and copy";
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { status.textContent = "Copied"; holder.innerHTML = ""; }, fallback);
      } else fallback();
    } catch (e) { fallback(); }
  }

  /* ---------- shareable links ---------- */
  var CLS_KEYS = S.OTHER_CLASSES;
  var ALLOWED = {
    noise: ["no", "yes"], out: ["samples", "state", "tableau"], cpu: ["thread", "node", "few", "many"],
    gpus: ["eight", "sixteen"]
  };
  function encode(a) {
    var p = [];
    function add(k, v) { if (v !== undefined && v !== null && v !== "") p.push(k + "=" + encodeURIComponent(v)); }
    add("noise", a.noise);
    if (a.noise !== "yes") {
      add("c", (a.circuits || []).join(","));
      if (a.other && a.other.name) { add("other", a.other.name); add("ocls", a.other.cls); if (a.other.src === "qasm") add("osrc", "qasm"); }
      add("out", a.output);
    }
    add("n", a.n);
    if (a.hw && a.hw.length) add("hw", a.hw.join(","));
    add("cpu", a.cpuScale);
    add("gpus", a.gpuCount);
    return p.join("&");
  }
  function decode(search) {
    var params = {};
    String(search || "").replace(/^\?/, "").split("&").forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf("=");
      var k = i === -1 ? kv : kv.slice(0, i), v = i === -1 ? "" : kv.slice(i + 1);
      try { params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, " ")); } catch (e) { /* ignore malformed pair */ }
    });
    if (!params.noise || ALLOWED.noise.indexOf(params.noise) === -1) return null;
    var a = emptyAnswers();
    a.noise = params.noise;
    if (a.noise !== "yes") {
      a.circuits = String(params.c || "").split(",").filter(function (id) { return S.CIRCUIT_BY_ID[id]; });
      a.circuits = a.circuits.filter(function (id, i) { return a.circuits.indexOf(id) === i; });
      var name = String(params.other || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);
      if (name && CLS_KEYS.indexOf(params.ocls) !== -1) a.other = { name: name, cls: params.ocls, src: params.osrc === "qasm" ? "qasm" : null };
      if (ALLOWED.out.indexOf(params.out) !== -1) a.output = params.out;
      if (a.output === "tableau" && !S.groupsOf(a).some(function (g) { return g.cls === "clifford"; })) a.output = null;
    }
    if (/^\d{1,4}$/.test(params.n || "")) { var n = parseInt(params.n, 10); if (n >= 2 && n <= 1000) a.n = n; }
    if (params.hw) a.hw = ["gpu", "cpu"].filter(function (h) { return String(params.hw).split(",").indexOf(h) !== -1; });
    if (ALLOWED.cpu.indexOf(params.cpu) !== -1) a.cpuScale = params.cpu;
    if (ALLOWED.gpus.indexOf(params.gpus) !== -1) a.gpuCount = params.gpus;
    return a;
  }
  // Keep only the answers the flow asks for, so links stay short and unambiguous.
  function pruned(a) {
    var f = S.flow(a), b = { noise: a.noise, circuits: [], other: null, hw: [] };
    f.qs.forEach(function (id) {
      if (id === "structure") { b.circuits = a.circuits.slice(); b.other = a.other ? clone(a.other) : null; }
      else if (id === "output") b.output = a.output;
      else if (id === "hw") b.hw = S.hwList(a).slice();
      else b[id] = a[id];
    });
    return b;
  }
  function baseUrl() {
    var l = window.location;
    var local = l.protocol === "http:" || l.protocol === "https:";
    if (local && (/github\.io$/.test(l.hostname) || l.hostname === "localhost" || l.hostname === "127.0.0.1")) return l.origin + l.pathname;
    return CANONICAL;
  }
  function shareUrl() { return baseUrl() + "?" + encode(pruned(A)); }
  function clearUrl() {
    try {
      if (window.location.search && window.history && window.history.replaceState) window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    } catch (e) { /* not allowed in this context */ }
  }

  /* ---------- memory ---------- */
  function memLog2(kind, n) { return kind === "dm" ? 2 * n + 4 : n + 4; }
  function platforms(kind) { return kind === "dm" ? S.DM_PLATFORMS : S.SV_PLATFORMS; }
  function firstFit(kind, n) {
    var list = platforms(kind);
    for (var i = 0; i < list.length; i++) if (n <= list[i].n) return list[i];
    return null;
  }
  function liveText(n) {
    if (A.noise === "yes") {
      var fitD = firstFit("dm", n);
      return "A density matrix of " + S.bytesLog2(2 * n + 4) + ", " +
        (fitD ? "which the platform of the noise study holds" : warn("more than the platform of the noise study holds; exact density matrices stop at n = 16"));
    }
    var tmp = clone(A); tmp.n = n;
    var ms = S.groupsOf(tmp).map(function (g) { return S.methodOf(tmp, g); });
    var size = S.bytesLog2(n + 4);
    if (ms.length && !ms.some(function (m) { return m === "sv"; })) {
      var how = [];
      if (ms.some(S.isStab)) how.push("stabiliser simulation");
      if (ms.some(S.isTN)) how.push("a tensor network");
      return "A state vector would need " + size + ", but your circuits use " + how.join(" and ") + " instead";
    }
    var fit = firstFit("sv", n);
    return "A state vector of " + size + ", " + (fit ? "which fits " + lc(fit.label) : warn("beyond every platform in this dissertation"));
  }

  /* ---------- labels ---------- */
  var HW_NAME = { cpu: "CPUs", gpu: "GPUs" };
  function optionsFor(id) { return S.QUESTIONS[id].options ? S.QUESTIONS[id].options(A) : []; }
  function circuitNames() {
    var names = (A.circuits || []).map(function (cid) { return S.CIRCUIT_BY_ID[cid] ? S.CIRCUIT_BY_ID[cid].name : cid; });
    if (A.other && A.other.name) names.push(esc(A.other.name) + (A.other.cls === "unsure" ? " (structure unknown)" : A.other.src === "qasm" ? " (from your file)" : ""));
    return names;
  }
  function answerLabel(id) {
    if (id === "n") return "<i>n</i> = " + A.n;
    if (id === "structure") return circuitNames().join(", ");
    if (id === "hw") {
      var h = S.hwList(A);
      return h.length === 2 ? "CPUs and GPUs" : h[0] === "gpu" ? "NVIDIA A100 GPUs" : "CPUs";
    }
    var opts = optionsFor(id);
    for (var j = 0; j < opts.length; j++) if (opts[j].v === A[id]) return opts[j].t;
    return "";
  }
  function helpFor(q) { return typeof q.help === "function" ? q.help(A) : q.help; }

  /* ---------- answering ---------- */
  function afterAnswer() {
    editing = null;
    isExample = false;
    holdFigure = false;
    S.dropHints(A);
    var f = S.flow(A);
    if (f.done && !review) { showResult(); return; }
    renderAsk({ focus: true });
  }
  function setAnswer(id, v) {
    A[id] = v;
    if (id === "noise" && A.n == null && !qasmInfo) nDraft = v === "yes" ? 12 : 30;
    afterAnswer();
  }
  function commitStructure() {
    A.circuits = draft.circuits.slice();
    A.other = draft.otherOn ? { name: draft.otherName.trim(), cls: draft.otherCls, src: draft.otherSrc === "qasm" ? "qasm" : null } : null;
    var hasClifford = S.groupsOf(A).some(function (g) { return g.cls === "clifford"; });
    if (A.output === "tableau" && !hasClifford) A.output = null;
    if (A.other && A.other.src === "qasm" && qasmInfo && A.n == null) nDraft = Math.min(1000, Math.max(2, qasmInfo.n));
    afterAnswer();
  }
  function commitHw() {
    A.hw = ["gpu", "cpu"].filter(function (h) { return draft.hw.indexOf(h) !== -1; });
    afterAnswer();
  }
  function reset() {
    clearUrl();
    A = emptyAnswers();
    holdFigure = false;
    review = false; isExample = false; editing = null; nDraft = 30; qasmInfo = null;
    draft = freshDraft();
    lastResult = null;
    renderAsk({ focus: true });
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }
  function showExample() {
    A = clone(EXAMPLE);
    holdFigure = false;
    isExample = true; review = false; editing = null;
    showResult();
  }

  /* ---------- questionnaire ---------- */
  function doneRow(id) {
    var q = S.QUESTIONS[id];
    var card = el("div", "card");
    var main = el("div", "done-main");
    main.appendChild(el("span", "done-q", q.short));
    main.appendChild(el("span", "done-a", answerLabel(id)));
    card.appendChild(main);
    var b = el("button", "linkbtn", "Change");
    b.type = "button";
    b.setAttribute("aria-label", "Change " + q.short.toLowerCase());
    b.addEventListener("click", function () { reopen(id); });
    card.appendChild(b);
    return card;
  }
  function reopen(id) {
    holdFigure = false;
    editing = id;
    if (id === "n" && A.n != null) nDraft = A.n;
    draft = freshDraft();
    renderAsk({ focus: true });
  }

  function questionCard(id, index, f) {
    var q = S.QUESTIONS[id];
    var card = el("div", "card");
    var prompt = el("h4", "q-prompt", q.prompt);
    prompt.id = "q-" + id;
    card.appendChild(prompt);
    card.appendChild(el("p", "q-help", helpFor(q)));
    if (id === "output" && qasmInfo && A.other && A.other.src === "qasm" && qasmInfo.measures) {
      card.appendChild(el("p", "q-hint", "Your file ends in " + qasmInfo.measures + " measurement" + (qasmInfo.measures === 1 ? "" : "s") + ", so samples may be what it needs."));
    }
    // What a branch chosen in the figure already says about this question.
    var said = id === "structure" && A.notClifford ? "circuits with gates outside the Clifford set"
      : id === "n" && A.nRange ? (A.nRange[0] <= 2 ? "at most " + A.nRange[1] : A.nRange[1] >= S.LIMITS.gpu16 ? "at least " + A.nRange[0] : "from " + A.nRange[0] + " to " + A.nRange[1]) + " qubits"
      : id === "cpuScale" && A.cpuNodes ? (A.cpuNodes === "yes" ? "several nodes" : "a single node") : null;
    if (said) card.appendChild(el("p", "q-hint", "Chosen in the figure: " + said + "."));

    if (id === "n") card.appendChild(qubitControls());
    else if (q.multi === "circuits") card.appendChild(circuitPicker());
    else if (q.multi === "toggle") card.appendChild(hwPicker());
    else card.appendChild(singleChoice(id));

    var nav = el("div", "card-nav");
    if (editing === id && S.answered(A, id)) {
      var keep = el("button", "linkbtn", "Keep my previous answer");
      keep.type = "button";
      keep.addEventListener("click", function () { editing = null; renderAsk({ focus: true }); });
      nav.appendChild(keep);
    } else if (index > 0) {
      var prev = el("button", "linkbtn", "Previous question");
      prev.type = "button";
      prev.addEventListener("click", function () { reopen(f.qs[index - 1]); });
      nav.appendChild(prev);
    }
    if (nav.children.length) card.appendChild(nav);
    return card;
  }

  function singleChoice(id) {
    var opts = optionsFor(id);
    var grid = el("div", "opts");
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-labelledby", "q-" + id);
    opts.forEach(function (o, i) {
      var b = el("button", "opt");
      b.type = "button";
      b.id = "opt-" + id + "-" + o.v;
      b.setAttribute("aria-pressed", A[id] === o.v ? "true" : "false");
      b.appendChild(el("span", "mark", ""));
      b.appendChild(el("span", "t", o.t));
      b.appendChild(el("span", "d", o.d));
      b.addEventListener("click", function () { setAnswer(id, o.v); });
      grid.appendChild(b);
    });
    return grid;
  }

  // A Continue button that always responds: it either proceeds or says what is missing.
  function continueRow(onGo) {
    var row = el("div", "continue-row");
    var go = el("button", "btn", "Continue");
    go.type = "button";
    var hint = el("span", "hint");
    hint.setAttribute("aria-live", "polite");
    go.addEventListener("click", onGo);
    row.appendChild(go);
    row.appendChild(hint);
    return { row: row, hint: hint, button: go };
  }
  function fieldError(id) {
    var p = el("p", "field-error");
    p.id = id;
    p.hidden = true;
    p.setAttribute("role", "alert");
    return p;
  }

  function circuitPicker() {
    var box = el("div", "picker");
    var firstTile = null;
    S.CLASS_ORDER.forEach(function (k) {
      var group = el("div", "cgroup");
      var head = el("div", "cgroup-h");
      head.appendChild(el("span", "cgroup-name", S.CLASSES[k].name));
      head.appendChild(el("span", "cgroup-d", S.CLASSES[k].d));
      group.appendChild(head);
      var tiles = el("div", "ctiles");
      S.CIRCUITS.filter(function (c) { return c.cls === k; }).forEach(function (c) {
        var b = el("button", "ctile");
        b.type = "button";
        b.id = "circ-" + c.id;
        b.setAttribute("aria-pressed", draft.circuits.indexOf(c.id) !== -1 ? "true" : "false");
        b.appendChild(el("span", "box", ""));
        var txt = el("span", "ctext");
        txt.appendChild(el("span", "t", c.name));
        txt.appendChild(el("span", "d", c.note));
        b.appendChild(txt);
        b.addEventListener("click", function () {
          var i = draft.circuits.indexOf(c.id);
          if (i === -1) draft.circuits.push(c.id); else draft.circuits.splice(i, 1);
          b.setAttribute("aria-pressed", i === -1 ? "true" : "false");
          refresh();
        });
        if (!firstTile) firstTile = b;
        tiles.appendChild(b);
      });
      group.appendChild(tiles);
      box.appendChild(group);
    });

    // A circuit the researcher describes, or reads from an OpenQASM file
    var og = el("div", "cgroup");
    og.appendChild(el("div", "cgroup-h", "<span class=\"cgroup-name\">Not in the list</span><span class=\"cgroup-d\">Read your own circuit from an OpenQASM file, or name it and say how it is structured</span>"));
    var otile = el("button", "ctile other");
    otile.type = "button";
    otile.id = "circ-other";
    otile.setAttribute("aria-pressed", draft.otherOn ? "true" : "false");
    otile.setAttribute("aria-expanded", draft.otherOn ? "true" : "false");
    otile.setAttribute("aria-controls", "other-box");
    otile.appendChild(el("span", "box", ""));
    var otxt = el("span", "ctext");
    otxt.appendChild(el("span", "t", "Another circuit"));
    otxt.appendChild(el("span", "d", "From an OpenQASM 2 or 3 file, or described by you"));
    otile.appendChild(otxt);
    var obadge = el("span", "conf " + (draft.otherSrc === "qasm" ? "conf-file" : "conf-user"), draft.otherSrc === "qasm" ? S.CONFIDENCE.file.label : S.CONFIDENCE.user.label);
    otile.appendChild(obadge);
    og.appendChild(otile);

    var obox = el("div", "otherbox");
    obox.id = "other-box";
    obox.hidden = !draft.otherOn;

    // OpenQASM reader
    var qbox = el("div", "qasm");
    qbox.appendChild(el("p", "olabel strong", "Read it from an OpenQASM file"));
    var drop = el("div", "qasm-drop");
    var fileIn = el("input");
    fileIn.type = "file";
    fileIn.accept = ".qasm,.qasm2,.qasm3,.inc,.txt,text/plain";
    fileIn.className = "visually-hidden";
    fileIn.id = "qasm-file";
    fileIn.tabIndex = -1;
    var pick = el("button", "btn ghost small", "Choose a file");
    pick.type = "button";
    pick.id = "qasm-pick";
    drop.appendChild(pick);
    drop.appendChild(el("span", "qasm-or", "or drop a .qasm file here"));
    drop.appendChild(fileIn);
    qbox.appendChild(drop);
    var paste = el("details", "qasm-paste");
    paste.appendChild(el("summary", "", "Paste OpenQASM or load an example"));
    var ta = el("textarea", "qasm-text");
    ta.id = "qasm-text";
    ta.rows = 7;
    ta.spellcheck = false;
    ta.setAttribute("aria-label", "OpenQASM source");
    ta.placeholder = "OPENQASM 2.0;\ninclude \"qelib1.inc\";\nqreg q[3];\nh q[0];\ncx q[0],q[1];";
    paste.appendChild(ta);
    var prow = el("div", "qasm-row");
    var readBtn = el("button", "btn small", "Read");
    readBtn.type = "button";
    readBtn.id = "qasm-read";
    prow.appendChild(readBtn);
    prow.appendChild(el("span", "qasm-ex-l", "Examples on 10 qubits"));
    [["qft", "QFT"], ["ghz", "GHZ"], ["clifford", "Clifford"], ["hea", "HEA"]].forEach(function (x) {
      var b = el("button", "chip", x[1]);
      b.type = "button";
      b.id = "qasm-ex-" + x[0];
      b.addEventListener("click", function () { ta.value = Q.example(x[0], 10); read(ta.value, x[1] + " example"); });
      prow.appendChild(b);
    });
    paste.appendChild(prow);
    qbox.appendChild(paste);
    var qerr = fieldError("err-qasm");
    qbox.appendChild(qerr);
    var qres = el("div", "qasm-result");
    qres.setAttribute("aria-live", "polite");
    qbox.appendChild(qres);
    obox.appendChild(qbox);
    if (qasmInfo && draft.otherSrc === "qasm") showAnalysis(qasmInfo);

    obox.appendChild(el("p", "olabel strong sep", "Or name it and choose its structure"));
    var lab = el("label", "olabel", "Circuit name");
    lab.setAttribute("for", "other-name");
    var oin = el("input", "otext");
    oin.type = "text"; oin.id = "other-name"; oin.placeholder = "e.g. quantum walk on a cycle"; oin.maxLength = 80;
    oin.value = draft.otherName;
    oin.setAttribute("aria-describedby", "err-other-name");
    var errName = fieldError("err-other-name");
    obox.appendChild(lab); obox.appendChild(oin); obox.appendChild(errName);
    var clsLabel = el("p", "olabel", "Its structure");
    clsLabel.id = "other-cls-label";
    obox.appendChild(clsLabel);
    var ocls = el("div", "oclasses");
    ocls.setAttribute("role", "group");
    ocls.setAttribute("aria-labelledby", "other-cls-label");
    var firstChip = null;
    var chips = {};
    S.OTHER_CLASSES.forEach(function (k) {
      var info = k === "unsure" ? S.UNSURE : S.CLASSES[k];
      var c = el("button", "chip ocls" + (k === "unsure" ? " unsure" : ""), info.name);
      c.type = "button";
      c.id = "other-cls-" + k;
      c.title = info.d;
      c.setAttribute("aria-pressed", draft.otherCls === k ? "true" : "false");
      c.addEventListener("click", function () {
        draft.otherCls = k;
        if (draft.otherSrc === "qasm" && (!qasmInfo || qasmInfo.cls !== k)) setSrc("user");
        syncChips();
        errCls.hidden = true;
        refresh();
      });
      chips[k] = c;
      if (!firstChip) firstChip = c;
      ocls.appendChild(c);
    });
    var errCls = fieldError("err-other-cls");
    obox.appendChild(ocls);
    obox.appendChild(errCls);
    obox.appendChild(el("p", "ohint", "Not sure? A circuit of only H, S, CNOT and Paulis is Clifford; if every pair of qubits interacts through non-Clifford gates, it is densely connected. Not sure maps it to the dense state vector, which handles any circuit."));
    og.appendChild(obox);
    box.appendChild(og);

    var foot = continueRow(function () { if (validate()) commitStructure(); });
    box.appendChild(foot.row);

    function syncChips() { Object.keys(chips).forEach(function (k) { chips[k].setAttribute("aria-pressed", draft.otherCls === k ? "true" : "false"); }); }
    function setSrc(src) {
      draft.otherSrc = src;
      obadge.className = "conf " + (src === "qasm" ? "conf-file" : "conf-user");
      obadge.textContent = src === "qasm" ? S.CONFIDENCE.file.label : S.CONFIDENCE.user.label;
    }
    function showAnalysis(a) {
      qres.innerHTML = "";
      var card = el("div", "qasm-card");
      var fname = a.fileName ? "<b>" + esc(a.fileName) + "</b>" : "Your circuit";
      card.appendChild(el("p", "qasm-h", fname + (a.version ? ", OpenQASM " + esc(a.version) : "")));
      var dl = el("dl", "qasm-dl");
      function row(k, v) { dl.appendChild(el("dt", "", k)); dl.appendChild(el("dd", "", v)); }
      row("Qubits", String(a.n) + (a.n > 1000 ? " (the selector asks for at most 1000)" : ""));
      row("Gates", a.gates.toLocaleString("en-GB") + (a.gates ? ", of which " + a.oneQ.toLocaleString("en-GB") + " one-qubit and " + a.twoQ.toLocaleString("en-GB") + " two-qubit" + (a.multiQ ? ", and " + a.multiQ + " on three or more" : "") : ""));
      row("Depth", a.depth.toLocaleString("en-GB"));
      if (a.measures) row("Measurements", String(a.measures));
      row("Clifford only", a.clifford ? "Yes" : "No" + (a.firstNonClifford ? ", first non-Clifford gate " + esc(a.firstNonClifford.name) + " on line " + a.firstNonClifford.line : ""));
      if (a.gateCounts.length) row("Most used", esc(a.gateCounts.join(", ")));
      card.appendChild(dl);
      var info = S.CLASSES[a.cls];
      card.appendChild(el("p", "qasm-cls", "Suggested structure: <b>" + info.name + "</b>"));
      var ul = el("ul", "qasm-why");
      a.reasons.forEach(function (r) { ul.appendChild(el("li", "", esc(sup(r)))); });
      if (a.unknownGates.length) ul.appendChild(el("li", "", "Gates without a definition in the file (" + esc(a.unknownGates.slice(0, 5).join(", ")) + ") count as non-Clifford gates on their qubits."));
      card.appendChild(ul);
      card.appendChild(el("p", "qasm-note", "The structure below is set to this class; change it if you know your circuit better. The qubit question will start at <i>n</i> = " + Math.min(1000, Math.max(2, a.n)) + "."));
      qres.appendChild(card);
    }
    function read(text, fileName) {
      qerr.hidden = true;
      var a;
      try { a = Q.analyse(text); } catch (e) {
        qres.innerHTML = "";
        qerr.textContent = (e.line ? "Line " + e.line + ". " : "") + (e.qasm ? e.message : "The file could not be read as OpenQASM.");
        qerr.hidden = false;
        return;
      }
      a.fileName = fileName || null;
      qasmInfo = a;
      var autoName = !draft.otherName.trim() || draft.autoName;
      if (autoName) {
        draft.otherName = (fileName || "Circuit from OpenQASM").replace(/\.(qasm2?|qasm3|txt|inc)$/i, "").slice(0, 80);
        draft.autoName = true;
        oin.value = draft.otherName;
      }
      draft.otherCls = a.cls;
      setSrc("qasm");
      syncChips();
      errName.hidden = true; errCls.hidden = true; oin.removeAttribute("aria-invalid");
      if (A.n == null || editing === "structure") nDraft = Math.min(1000, Math.max(2, a.n));
      showAnalysis(a);
      refresh();
    }
    function readFile(file) {
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { qerr.textContent = "The file is larger than 5 MB."; qerr.hidden = false; return; }
      var fr = new FileReader();
      fr.onload = function () { read(String(fr.result || ""), file.name); };
      fr.onerror = function () { qerr.textContent = "The file could not be opened."; qerr.hidden = false; };
      fr.readAsText(file);
    }
    pick.addEventListener("click", function () { fileIn.click(); });
    fileIn.addEventListener("change", function () { readFile(fileIn.files && fileIn.files[0]); fileIn.value = ""; });
    ["dragenter", "dragover"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); });
    });
    drop.addEventListener("drop", function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) readFile(f);
    });
    readBtn.addEventListener("click", function () {
      if (!ta.value.trim()) { qerr.textContent = "Paste an OpenQASM program first, or load an example."; qerr.hidden = false; ta.focus(); return; }
      read(ta.value, null);
    });

    function selection() {
      var other = draft.otherOn && draft.otherName.trim() && draft.otherCls ? { name: draft.otherName.trim(), cls: draft.otherCls, src: draft.otherSrc } : null;
      return { circuits: draft.circuits, other: other };
    }
    function refresh() {
      var sel = selection();
      var count = sel.circuits.length + (sel.other ? 1 : 0);
      var classes = S.groupsOf(sel).length;
      foot.hint.classList.remove("error");
      foot.hint.textContent = count ? count + " selected, in " + classes + " structure class" + (classes > 1 ? "es" : "") : "";
    }
    function fail(errEl, focusEl, msg) {
      errEl.textContent = msg;
      errEl.hidden = false;
      if (errEl === foot.hint) errEl.classList.add("error");
      if (focusEl.tagName === "INPUT") focusEl.setAttribute("aria-invalid", "true");
      focusEl.focus();
      return false;
    }
    function validate() {
      errName.hidden = true; errCls.hidden = true; oin.removeAttribute("aria-invalid");
      var count = draft.circuits.length;
      if (draft.otherOn) {
        if (!draft.otherName.trim()) return fail(errName, oin, "Give your circuit a name, read it from a file, or untick Another circuit.");
        if (!draft.otherCls) return fail(errCls, firstChip, "Choose its structure, or pick Not sure.");
        count++;
      }
      if (!count) return fail(foot.hint, firstTile, "Select at least one circuit, or add your own under Another circuit.");
      return true;
    }

    otile.addEventListener("click", function () {
      draft.otherOn = !draft.otherOn;
      otile.setAttribute("aria-pressed", draft.otherOn ? "true" : "false");
      otile.setAttribute("aria-expanded", draft.otherOn ? "true" : "false");
      obox.hidden = !draft.otherOn;
      errName.hidden = true; errCls.hidden = true; oin.removeAttribute("aria-invalid");
      if (draft.otherOn) pick.focus();
      refresh();
    });
    oin.addEventListener("input", function () {
      draft.otherName = oin.value;
      draft.autoName = false;
      if (oin.value.trim()) { errName.hidden = true; oin.removeAttribute("aria-invalid"); }
      refresh();
    });
    oin.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); if (validate()) commitStructure(); } });
    refresh();
    return box;
  }

  function hwPicker() {
    var box = el("div", "picker");
    var grid = el("div", "opts");
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-labelledby", "q-hw");
    var first = null;
    optionsFor("hw").forEach(function (o) {
      var b = el("button", "opt check");
      b.type = "button";
      b.id = "opt-hw-" + o.v;
      b.setAttribute("aria-pressed", draft.hw.indexOf(o.v) !== -1 ? "true" : "false");
      b.appendChild(el("span", "box", ""));
      b.appendChild(el("span", "t", o.t));
      b.appendChild(el("span", "d", o.d));
      b.addEventListener("click", function () {
        var i = draft.hw.indexOf(o.v);
        if (i === -1) draft.hw.push(o.v); else draft.hw.splice(i, 1);
        b.setAttribute("aria-pressed", i === -1 ? "true" : "false");
        refresh();
      });
      if (!first) first = b;
      grid.appendChild(b);
    });
    box.appendChild(grid);
    var foot = continueRow(function () {
      if (!draft.hw.length) {
        foot.hint.textContent = "Select CPUs, GPUs or both.";
        foot.hint.classList.add("error");
        first.focus();
        return;
      }
      commitHw();
    });
    function refresh() {
      foot.hint.classList.remove("error");
      foot.hint.textContent = draft.hw.length === 2 ? "You will get one answer for each" : "";
    }
    box.appendChild(foot.row);
    refresh();
    return box;
  }

  function qubitControls() {
    var cfg = A.noise === "yes"
      ? { max: 30, chips: [4, 8, 10, 13, 16, 20] }
      : { max: 600, chips: [20, 24, 28, 30, 31, 32, 33, 34, 35, 36, 60, 500] };
    var box = el("div");
    var row = el("div", "nrow");
    var bigN = el("div", "nbig");
    var label = el("label", "nlabel", "Qubits");
    var input = el("input", "nin");
    input.type = "text"; input.id = "n-input";
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("aria-describedby", "err-n");
    input.value = String(nDraft);
    label.setAttribute("for", "n-input");
    label.appendChild(input);
    row.appendChild(bigN); row.appendChild(label);
    box.appendChild(row);

    var range = el("input");
    range.type = "range"; range.min = "2"; range.max = String(cfg.max); range.step = "1"; range.id = "n-range";
    range.setAttribute("aria-label", "Number of qubits");
    box.appendChild(range);

    var chips = el("div", "chips");
    var picks = cfg.chips.slice();
    if (qasmInfo && A.other && A.other.src === "qasm" && picks.indexOf(qasmInfo.n) === -1 && qasmInfo.n <= 1000) picks.unshift(qasmInfo.n);
    picks.forEach(function (v) {
      var c = el("button", "chip", String(v) + (qasmInfo && A.other && A.other.src === "qasm" && v === qasmInfo.n ? " (your file)" : ""));
      c.type = "button";
      c.addEventListener("click", function () { showN(v, false); });
      chips.appendChild(c);
    });
    box.appendChild(chips);

    var live = el("p", "nlive");
    box.appendChild(live);
    var err = fieldError("err-n");
    box.appendChild(err);

    var go = el("button", "btn");
    go.type = "button";
    box.appendChild(go);

    function parse(v) {
      var s = String(v).trim();
      if (!/^\d+$/.test(s)) return null;
      var k = parseInt(s, 10);
      return k >= 2 && k <= 1000 ? k : null;
    }
    // fromInput: the value came from typing, so the box is left as the user typed it
    function showN(v, fromInput) {
      nDraft = v;
      bigN.innerHTML = "<i>n</i> = " + v;
      if (!fromInput) input.value = String(v);
      range.value = String(Math.min(cfg.max, v));
      live.innerHTML = liveText(v);
      go.textContent = "Set " + v + " qubits";
      err.hidden = true;
      input.removeAttribute("aria-invalid");
    }
    function confirm() {
      var v = parse(input.value);
      if (v === null) {
        err.textContent = "Enter a whole number of qubits from 2 to 1000.";
        err.hidden = false;
        input.setAttribute("aria-invalid", "true");
        input.focus();
        return;
      }
      A.n = v;
      nDraft = v;
      afterAnswer();
    }
    input.addEventListener("input", function () {
      var v = parse(input.value);
      if (v !== null) showN(v, true);
    });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); confirm(); } });
    range.addEventListener("input", function () { showN(parseInt(range.value, 10), false); });
    go.addEventListener("click", confirm);
    showN(nDraft, false);
    return box;
  }

  var LEVELS = { 1: ["First level", "simulation method"], 2: ["Second level", "state-vector backend"] };
  function renderAsk(opts) {
    opts = opts || {};
    show("ask");
    var f = S.flow(A);
    var current = editing;
    if (!current) {
      for (var i = 0; i < f.qs.length; i++) if (!S.answered(A, f.qs[i])) { current = f.qs[i]; break; }
    }
    if (current && !editing && (current === "structure" || current === "hw")) draft = freshDraft();

    stepsEl.innerHTML = "";
    var level = null, list = null;
    f.qs.forEach(function (id, idx) {
      var lv = S.QUESTIONS[id].level;
      if (lv !== level) {
        level = lv;
        var group = el("div", "levelgroup");
        group.appendChild(el("h3", "level", "<b>" + LEVELS[lv][0] + "</b>" + LEVELS[lv][1]));
        list = el("ol", "steps");
        group.appendChild(list);
        stepsEl.appendChild(group);
      }
      var li = el("li", "step");
      var isCurrent = id === current;
      if (isCurrent) li.classList.add("current");
      else if (S.answered(A, id)) li.classList.add("done");
      var num = el("span", "num", String(idx + 1));
      num.setAttribute("aria-hidden", "true");
      li.appendChild(num);
      li.appendChild(isCurrent ? questionCard(id, idx, f) : doneRow(id));
      list.appendChild(li);
    });

    var answeredCount = f.qs.filter(function (id) { return S.answered(A, id); }).length;
    restartBtn.hidden = answeredCount === 0;
    reviewBar.hidden = !(review && f.done && !editing);
    updateFigure();

    if (opts.focus) {
      var target = current
        ? stepsEl.querySelector(".step.current .opt[aria-pressed=\"true\"]") || stepsEl.querySelector(".step.current .opt, .step.current .ctile, .step.current .nin")
        : reviewBar.querySelector(".btn");
      if (target) {
        target.focus({ preventScroll: true });
        target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
      }
    }
  }

  /* ---------- Figure 5.13 ---------- */
  // The paths to draw: those of the outcomes once a result is shown, otherwise the answers so far.
  function currentPaths() {
    if (!views.result.hidden && lastResult) {
      var list = [];
      lastResult.blocks.forEach(function (b) { b.outcomes.forEach(function (o) { list.push({ path: o.path }); }); });
      return list;
    }
    return A.noise == null ? [] : S.figPaths(A);
  }
  function updateFigure() {
    lastPaths = currentPaths();
    F.mark(flowSvg, lastPaths);
    placeFigure();
  }
  // On wide screens the figure stays in view beside the text for the whole length of the
  // page and, where the window is lower than the figure, scrolls on its own
  // (css/style.css), here to the point where the path ends. On narrow screens the figure
  // follows the text and is panned sideways to that point. After a choice made in the
  // figure itself (holdFigure), the figure stays where it is.
  var holdFigure = false;
  function placeFigure() {
    var fp = F.focusPoint(lastPaths);
    if (!wide.matches) {
      var pans = flowScroll.scrollWidth > flowScroll.clientWidth + 1;
      $("panHint").hidden = !pans;
      if (pans && !holdFigure) flowScroll.scrollLeft = (fp ? fp.x : 0.5) * flowScroll.scrollWidth - flowScroll.clientWidth / 2;
      return;
    }
    $("panHint").hidden = true;
    if (holdFigure || colFig.scrollHeight <= colFig.clientHeight + 1) return;
    var svgBox = flowSvg.getBoundingClientRect();
    var svgTop = svgBox.top - colFig.getBoundingClientRect().top + colFig.scrollTop;
    colFig.scrollTop = fp ? Math.max(0, svgTop + fp.y * svgBox.height - colFig.clientHeight / 2) : 0;
  }
  var placeTimer = null;
  window.addEventListener("resize", function () { clearTimeout(placeTimer); placeTimer = setTimeout(placeFigure, 60); });

  /* ---------- choosing in the figure ---------- */
  // Each yes, no and box of the figure is a button. Choosing one sets the answers that it
  // implies (Selector.aim), keeps the others, and shows the result once the query is complete.
  var picks = Array.prototype.slice.call(flowSvg.querySelectorAll(".pick"));
  var flowStatus = $("flowStatus");
  function signature(a) {
    return JSON.stringify([a.noise || null, a.circuits || [], a.other || null, a.output || null, a.n == null ? null : a.n,
      S.hwList(a), a.cpuScale || null, a.gpuCount || null, !!a.notClifford, a.nRange || null, a.cpuNodes || null]);
  }
  function pickedName(g) {
    var node = g.getAttribute("data-node");
    if (node) return F.BOXES[node].b + ", " + strip(F.BOXES[node].text);
    var e = g.getAttribute("data-edge").split(":");
    return strip(F.DECISIONS[e[0]].text) + " " + e[1];
  }
  function pickInFigure(g) {
    var node = g.getAttribute("data-node"), edge = String(g.getAttribute("data-edge") || "").split(":");
    var next = S.aim(A, node ? { box: node } : { d: edge[0], ans: edge[1] });
    var complete = S.flow(next).done;
    if (signature(next) === signature(A) && (complete ? !views.result.hidden : views.result.hidden)) {
      flowStatus.textContent = pickedName(g) + ": the answers already say so.";
      return;
    }
    clearUrl();
    A = next;
    review = false; isExample = false; editing = null;
    holdFigure = true;
    nDraft = A.n != null ? A.n : A.nRange ? Math.min(A.nRange[1], Math.max(A.nRange[0], 30)) : A.noise === "yes" ? 12 : 30;
    draft = freshDraft();
    if (complete) {
      showResult();
      flowStatus.textContent = pickedName(g) + ": answers set, result shown.";
      return;
    }
    // Where the figure follows the questions, keep it under the pointer while they change height.
    var before = flowSvg.getBoundingClientRect().top;
    renderAsk({ focus: false });
    var shift = flowSvg.getBoundingClientRect().top - before;
    if (!wide.matches && Math.abs(shift) > 1) window.scrollBy(0, shift);
    var f = S.flow(A), waiting = null;
    for (var i = 0; i < f.qs.length; i++) if (!S.answered(A, f.qs[i])) { waiting = f.qs[i]; break; }
    flowStatus.textContent = pickedName(g) + ": answers set." + (waiting ? " Next question: " + strip(S.QUESTIONS[waiting].prompt) : "");
  }
  flowSvg.addEventListener("click", function (e) {
    var g = e.target && e.target.closest ? e.target.closest(".pick") : null;
    if (g && flowSvg.contains(g)) pickInFigure(g);
  });
  // One tab stop for the figure: the arrow keys move between its buttons.
  function roveTo(g) {
    picks.forEach(function (p) { p.setAttribute("tabindex", p === g ? "0" : "-1"); });
  }
  if (picks.length) roveTo(picks[0]);
  flowSvg.addEventListener("focusin", function (e) {
    var g = e.target && e.target.closest ? e.target.closest(".pick") : null;
    if (g) roveTo(g);
  });
  flowSvg.addEventListener("keydown", function (e) {
    var g = e.target && e.target.closest ? e.target.closest(".pick") : null;
    if (!g) return;
    var i = picks.indexOf(g), to = null;
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); pickInFigure(g); return; }
    if (e.key === "ArrowRight" || e.key === "ArrowDown") to = picks[(i + 1) % picks.length];
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") to = picks[(i - 1 + picks.length) % picks.length];
    else if (e.key === "Home") to = picks[0];
    else if (e.key === "End") to = picks[picks.length - 1];
    if (to) { e.preventDefault(); roveTo(to); to.focus(); }
  });

  /* ---------- result ---------- */
  function showResult() {
    lastResult = S.recommendAll(A);
    lastFlow = S.flow(A);
    renderResults(lastResult, lastFlow);
    show("result");
    updateFigure();
    var top = views.result.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) scrollToEl(views.result);
    $("rHeading").focus({ preventScroll: true });
  }

  /* ---------- parts of the result ---------- */
  function meter(kind, n, refLabel) {
    var box = el("div");
    var k = kind === "dm" ? "dm" : "sv";
    var l = memLog2(k, n);
    var list = platforms(k);
    var name = k === "dm" ? "Density matrix" : (refLabel ? "A dense state vector would need" : "State vector");
    box.appendChild(el("div", "meter-label", "<span>" + name + "</span><b>" + S.bytesLog2(l) + "</b>"));
    var bar = el("div", "bar");
    var lo = 10, hi = 50;
    var pct = function (x) { return Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100)); };
    var fill = el("div", "fill" + (n > list[list.length - 1].n ? " over" : ""));
    fill.style.width = pct(l) + "%";
    bar.appendChild(fill);
    ["KiB", "MiB", "GiB", "TiB", "PiB"].forEach(function (u, i) {
      var x = lo + i * 10;
      var t = el("div", "tick"); t.style.left = pct(x) + "%"; bar.appendChild(t);
      var tl = el("div", "tlabel", u); tl.style.left = pct(x) + "%"; bar.appendChild(tl);
    });
    list.forEach(function (p) {
      var c = el("div", "cap");
      c.style.left = "calc(" + pct(memLog2(k, p.n)) + "% - 1px)";
      c.title = p.label + ", up to n = " + p.n;
      bar.appendChild(c);
    });
    box.appendChild(bar);
    var ul = el("ul", "fits");
    list.forEach(function (p) {
      var ok = n <= p.n;
      var li = el("li", ok ? "yes" : "no");
      li.appendChild(el("span", "mk", ok ? "✓" : "✗"));
      var txt = el("span", "fit-text");
      txt.appendChild(el("span", "fit-name", p.label));
      var status;
      if (p.measured == null) status = el("span", "fit-status none", "No measurement in the dissertation");
      else if (p.measured >= p.n) status = el("span", "fit-status full", "Measured up to <i>n</i> = " + p.measured);
      else status = el("span", "fit-status part", "Measured up to <i>n</i> = " + p.measured + "; capacity beyond");
      if (p.measured != null && n > p.measured && n <= p.n) status.innerHTML += "; your size lies beyond the measurements";
      txt.appendChild(status);
      li.appendChild(txt);
      li.appendChild(el("span", "cap-n", "holds <i>n</i> ≤ " + p.n));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    box.appendChild(el("p", "fit-legend", "<b>Holds</b> is the largest double-precision state that fits; <b>measured</b> is the largest size this dissertation ran there."));
    return box;
  }

  // Backend name as a link to its source repository; opens in a new tab.
  function repoLink(name) {
    var a = el("a", "repo", esc(name));
    a.href = S.REPOS[name];
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = "Open the " + name + " repository on GitHub";
    a.setAttribute("aria-label", name + ", source repository on GitHub (opens in a new tab)");
    return a;
  }
  // Turn the bold backend names in an "Also consider" line into repository links.
  function linkNames(p) {
    Array.prototype.slice.call(p.querySelectorAll("b")).forEach(function (b) {
      var name = b.textContent;
      if (!S.REPOS[name]) return;
      var a = repoLink(name);
      a.classList.add("inline");
      b.textContent = "";
      b.appendChild(a);
    });
    return p;
  }

  // How the dissertation ran the backend of this outcome, for the circuits and the size of
  // the query, and where the library documents those settings (js/runconfig.js).
  function runConfigOf(rec, block) {
    return RC.forOutcome(rec, {
      n: A.n,
      output: A.output === "tableau" && block && block.cls !== "clifford" ? "state" : A.output,
      circuits: block ? block.circuits : [],
      noisy: A.noise === "yes"
    });
  }
  function runConfigView(rec, block) {
    var cfg = runConfigOf(rec, block);
    if (!cfg) return null;
    var det = el("details", "runcfg");
    det.appendChild(el("summary", "", "<span class=\"ev-h\">Run configuration</span> <span class=\"ev-refs\">as run in the dissertation</span>"));
    var body = el("div", "rc-body");
    body.appendChild(el("p", "rc-note", "How the dissertation ran this backend in this regime, written for the circuits and the size of your query, with tips where good practice goes beyond those runs. The calls that set it up are in the documentation of the library, at the pages listed below."));
    var dl = el("dl", "rc");
    cfg.rows.forEach(function (r) {
      dl.appendChild(el("dt", "", r[0]));
      dl.appendChild(el("dd", "", r[1]));
    });
    body.appendChild(dl);
    body.appendChild(el("p", "rc-docs-h", "In the documentation of " + esc(cfg.lib)));
    var ul = el("ul", "rc-docs");
    cfg.docs.forEach(function (d) {
      var li = el("li");
      var a = el("a", "", esc(d.t));
      a.href = d.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.setAttribute("aria-label", cfg.lib + " documentation, " + d.t + " (opens in a new tab)");
      li.appendChild(a);
      li.appendChild(el("span", "d", ": " + d.d));
      ul.appendChild(li);
    });
    body.appendChild(ul);
    body.appendChild(el("p", "rc-foot", cfg.foot));
    det.appendChild(body);
    return det;
  }

  // One outcome: the method and the backend, as the two levels of the framework give them,
  // the reason, and the path, measurements, run configuration and conditions behind it.
  function outcomeView(o, bigView, block) {
    var r = o.rec;
    var wrap = el("div", "outcome-block");
    if (o.hw && S.hwList(A).length === 2) wrap.appendChild(el("p", "hwtag", "On " + HW_NAME[o.hw]));
    var parts = String(r.regime).split(" · ");
    var outside = r.b.indexOf("No feasible") === 0 || r.b.indexOf("Beyond") === 0 || r.b === "Trajectory sampling";
    var box = el("div", "obox" + (r.out ? " out" : ""));
    box.style.setProperty("--c", S.colourOf(r.b));
    box.style.setProperty("--t", S.tintOf(r.b));
    var title = el(bigView ? "h3" : "h4", "bname");
    title.appendChild(S.REPOS[r.b] ? repoLink(r.b) : document.createTextNode(r.b));
    box.appendChild(title);
    if (outside) {
      box.appendChild(el("span", "btext", lc(parts.join(", "))));
      wrap.appendChild(el("div", "sel-out")).appendChild(box);
    } else {
      if (parts.length > 1) box.appendChild(el("span", "btext", parts.slice(1).join(", ")));
      var dl = el("dl", "sel");
      dl.appendChild(el("dt", "", "Method"));
      dl.appendChild(el("dd", "", parts[0] + (r.kind === "sv" ? ", in double precision" : "")));
      dl.appendChild(el("dt", "", "Backend"));
      dl.appendChild(el("dd")).appendChild(box);
      wrap.appendChild(dl);
    }
    if (r.out) wrap.appendChild(el("p", "outnote", (outside ? "" : "<b>Beyond the measured range.</b> ") + r.out));
    wrap.appendChild(el("p", "ev", r.ev));
    var fb = o.path && o.path.end ? F.BOXES[o.path.end] : null;
    if (fb && !outside && fb.b !== r.b && !(fb.also && fb.also.indexOf(r.b) !== -1)) {
      wrap.appendChild(el("p", "fignote", "<b>Finer than Figure 5.13.</b> The figure summarises this regime with the box " + fb.b + " (" + fb.text + "); at this size and on this circuit the measurements give " + r.b + "."));
    }
    if (r.alt) wrap.appendChild(linkNames(el("p", "alt", "Also consider " + r.alt + ".")));
    if (r.note) wrap.appendChild(el("p", "alt", r.note));
    if (o.path) {
      var pd = el("details", "pathd");
      pd.open = !wide.matches;
      pd.appendChild(el("summary", "", "<span class=\"ev-h\">Path through Figure 5.13</span>"));
      pd.appendChild(F.pathList(o.path));
      wrap.appendChild(pd);
    }
    var model = E.model(r, { n: A.n, A: A });
    if (model) {
      o.model = model;
      wrap.appendChild(E.render(model, { open: bigView }));
    }
    var rc = runConfigView(r, block);
    if (rc) wrap.appendChild(rc);
    if (r.caveats && r.caveats.length) {
      var det = el("details", "conds");
      if (bigView) det.open = true;
      det.appendChild(el("summary", "", "<span class=\"ev-h\">Holds under " + r.caveats.length + " condition" + (r.caveats.length > 1 ? "s" : "") + "</span>"));
      var ul = el("ul", "caveats");
      r.caveats.forEach(function (c) { ul.appendChild(el("li", "", c)); });
      det.appendChild(ul);
      wrap.appendChild(det);
    }
    return wrap;
  }

  function workloadLine() {
    if (A.noise === "yes") return "Exact noisy evolution on " + A.n + " qubits";
    var names = circuitNames();
    var what = names.length <= 2 ? names.join(" and ") : names.length + " circuits";
    var out = { samples: "returning measurement samples", state: "returning the full state", tableau: "returning the stabiliser tableau" }[A.output] || "";
    return what + " on " + A.n + " qubits, " + out;
  }

  function outsideView(res) {
    var items = T.outside(A, res);
    var box = el("div");
    var on = items.filter(function (x) { return x.on; }), off = items.filter(function (x) { return !x.on; });
    var ul = el("ul", "outside");
    on.forEach(function (x) { ul.appendChild(el("li", "", "<b>" + x.t + "</b> " + x.d)); });
    box.appendChild(ul);
    if (off.length) {
      var det = el("details", "outside-more");
      det.appendChild(el("summary", "", "Other limits of the measurements (" + off.length + ")"));
      var ul2 = el("ul", "outside");
      off.forEach(function (x) { ul2.appendChild(el("li", "", "<b>" + x.t + "</b> " + x.d)); });
      det.appendChild(ul2);
      box.appendChild(det);
    }
    return box;
  }

  function renderResults(res, f) {
    var outs = [];
    res.blocks.forEach(function (b) { b.outcomes.forEach(function (o) { outs.push(o); }); });
    var single = outs.length === 1;
    var anyOut = outs.some(function (o) { return o.rec.out; });
    var anyUnsure = res.blocks.some(function (b) { return b.unsure.length; });

    outs.forEach(function (o) { if (o.path) o.path.out = !!o.rec.out; });
    var noneMeasured = outs.every(function (o) { return o.rec.evk && o.rec.evk.type === "none"; });
    $("rHeading").textContent = noneMeasured ? "Outside the measured configurations" : single ? "Recommended configuration" : "Recommended configurations";
    $("rSub").innerHTML = workloadLine() + "." + (single ? "" : " One configuration for each circuit structure" + (S.hwList(A).length === 2 ? " and each kind of hardware" : "") + ".");
    var remarks = [];
    if (isExample) remarks.push("This is an example query.");
    remarks.push(noneMeasured ? "No configuration of the dissertation covers this query." : anyOut ? "Part of the answer lies beyond the measured range and is marked with a dashed outline." : "The answer lies within the measured range.");
    if (anyUnsure) remarks.push("Some circuits are outside the benchmark set, so their placement is inconclusive.");
    $("rFlags").textContent = remarks.join(" ");

    var cont = $("outcomes");
    cont.innerHTML = "";
    res.blocks.forEach(function (b) {
      var card = el("section", "block");
      if (b.cls) {
        var bh = el("div", "block-h");
        bh.appendChild(el("p", "block-cls", S.CLASSES[b.cls].name));
        var badges = el("p", "cbadges");
        b.circuits.forEach(function (c, i) {
          if (i) badges.appendChild(document.createTextNode(", "));
          var s = el("span", "cbadge conf-" + c.conf, esc(c.name) + (c.conf === "measured" ? "" : " (" + lc(S.CONFIDENCE[c.conf].label) + ")"));
          s.title = S.CONFIDENCE[c.conf].label + ": " + c.note;
          badges.appendChild(s);
        });
        bh.appendChild(badges);
        card.appendChild(bh);
        if (b.unsure.length) {
          var list = b.unsure.map(function (c) { return esc(c.name); }).join(", ");
          var all = b.unsure.length === b.circuits.length;
          var plural = b.unsure.length > 1;
          var fromFile = b.unsure.every(function (c) { return c.conf === "file"; });
          card.appendChild(el("p", "incon",
            "<b>" + (fromFile ? "Classified from your file" : "Inconclusive") + " for " + list + ".</b> " + (plural ? "These circuits are" : "This circuit is") +
            " outside the benchmark set and " + (fromFile ? "placed in this class by the analysis of its gates" : "mapped to this class by structure") + ", so " +
            (all ? "the recommendation is a best guess." : "the recommendation is measured for the other circuits and only expected for " + (plural ? "these." : "this one."))));
        }
      }
      var outsEl = el("div", "block-outs" + (b.outcomes.length > 1 ? " pair" : ""));
      b.outcomes.forEach(function (o) { outsEl.appendChild(outcomeView(o, single, b)); });
      card.appendChild(outsEl);
      cont.appendChild(card);
    });

    var refOnly = res.blocks.every(function (b) { return b.outcomes.every(function (o) { return o.rec.kind === "sv-ref"; }); });
    var mem = $("memory"); mem.innerHTML = ""; mem.appendChild(meter(res.kind, A.n, refOnly));
    var outside = $("outside"); outside.innerHTML = ""; outside.appendChild(outsideView(res));
    $("copyStatus").textContent = "";
    $("copyFallback").innerHTML = "";
    primeTools();
  }

  function summaryText(res, qs) {
    var lines = ["Quantum Simulator Selector, a prototype of the two-level selection framework (Section 5.8)", shareUrl(), ""];
    qs.forEach(function (id) { if (S.answered(A, id)) lines.push(S.QUESTIONS[id].short + ": " + strip(answerLabel(id))); });
    res.blocks.forEach(function (b) {
      lines.push("");
      if (b.cls) lines.push("== " + S.CLASSES[b.cls].name + ": " + b.circuits.map(function (c) { return c.name + " (" + S.CONFIDENCE[c.conf].label + ")"; }).join(", "));
      b.outcomes.forEach(function (o) {
        var r = o.rec;
        lines.push((o.hw ? "On " + HW_NAME[o.hw] + ": " : "") + r.b + ", " + lc(strip(r.regime).replace(/ · /g, ", ")));
        if (o.path) lines.push("Path in Figure 5.13: " + F.pathText(o.path));
        lines.push(strip(r.ev));
        if (r.alt) lines.push("Also consider " + strip(r.alt) + ".");
        if (r.note) lines.push(strip(r.note));
        if (r.out) lines.push("Range: " + strip(r.out));
        (r.caveats || []).forEach(function (c) { lines.push("- " + strip(c)); });
        E.lines(o.model || E.model(r, { n: A.n, A: A })).forEach(function (l) { lines.push(strip(l)); });
        var cfg = runConfigOf(r, b);
        if (cfg) {
          lines.push("Run configuration, as run in the dissertation:");
          cfg.rows.forEach(function (row) { lines.push("  " + row[0] + ": " + strip(row[1].replace(/<br>|<\/span>/g, " ")).trim()); });
          cfg.docs.forEach(function (d) { lines.push("  Documentation of " + cfg.lib + ", " + d.t + ": " + d.url); });
        }
      });
    });
    lines.push("", "Fastest configurations measured on Deucalion and on the i9-13900KS platform, in double precision.");
    return lines.join("\n");
  }

  /* ---------- tools ---------- */
  var toolsPrimed = { mem: false, cmp: false };
  function toolDefaults() {
    var c = "qft";
    if (lastResult && lastResult.blocks.length && lastResult.blocks[0].cls) c = S.circuitClass({ structure: lastResult.blocks[0].cls });
    var n = A.n || 30;
    var hw = S.hwList(A);
    var bCfg = n <= 31 ? (hw.indexOf("gpu") !== -1 ? "gpu1h" : "thread") : n <= 34 ? "g4" : n === 35 ? "g8" : "g16";
    return { n: n, c: c, dm: A.noise === "yes", a: n <= 33 ? "node" : "x64", b: bCfg, device: A.noise === "yes" ? "i9" : hw.indexOf("gpu") !== -1 || !hw.length ? "a100-80" : "x86" };
  }
  function buildTool(which) {
    var d = toolDefaults();
    if (which === "mem") { var mb = $("memToolBody"); mb.innerHTML = ""; mb.appendChild(T.memoryTool({ n: Math.min(d.n, 80), dm: d.dm, device: d.device })); toolsPrimed.mem = true; }
    else { var cb = $("cmpToolBody"); cb.innerHTML = ""; cb.appendChild(T.compareTool({ n: Math.min(Math.max(d.n, 2), 39), c: d.c, a: d.a, b: d.b })); toolsPrimed.cmp = true; }
  }
  // Closed tools pick up the current query the next time they open.
  function primeTools() {
    if (!$("memTool").open) toolsPrimed.mem = false;
    if (!$("cmpTool").open) toolsPrimed.cmp = false;
  }
  $("memTool").addEventListener("toggle", function () { if ($("memTool").open && !toolsPrimed.mem) buildTool("mem"); });
  $("cmpTool").addEventListener("toggle", function () { if ($("cmpTool").open && !toolsPrimed.cmp) buildTool("cmp"); });

  /* ---------- wiring ---------- */
  $("exampleBtn").addEventListener("click", showExample);
  restartBtn.addEventListener("click", reset);
  $("showBtn").addEventListener("click", function () { if (S.flow(A).done) showResult(); });
  $("changeBtn").addEventListener("click", function () {
    clearUrl();
    holdFigure = false;
    review = true; editing = null; isExample = false;
    renderAsk({ focus: false });
    scrollToEl(views.ask);
  });
  $("newBtn").addEventListener("click", reset);
  $("copyBtn").addEventListener("click", function () { copyText(summaryText(lastResult, lastFlow.qs), $("copyStatus"), $("copyFallback"), "Summary to copy"); });
  $("linkBtn").addEventListener("click", function () { copyText(shareUrl(), $("copyStatus"), $("copyFallback"), "Link to this result"); });

  // A shared link opens its result directly; the bare address always opens an empty questionnaire.
  var shared = window.location.search ? decode(window.location.search) : null;
  if (shared && S.flow(shared).done) {
    A = shared;
    lastResult = S.recommendAll(A);
    lastFlow = S.flow(A);
    renderResults(lastResult, lastFlow);
    show("result");
    updateFigure();
  } else {
    // An incomplete or malformed link is ignored, so the questionnaire always starts empty.
    clearUrl();
    renderAsk({ focus: false });
  }
})();
