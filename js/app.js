/*
 * Interface of the Quantum Simulator Selector, in three phases:
 * the questionnaire ("measuring"), a short collapse sequence, and the readout.
 * All decision logic lives in window.Selector (js/rules.js).
 */
(function () {
  "use strict";

  var S = window.Selector;
  function $(id) { return document.getElementById(id); }
  var views = { ask: $("askView"), collapse: $("collapseView"), result: $("resultView") };
  var stepsEl = $("steps"), statusText = $("statusText"), reviewBar = $("reviewBar"), restartBtn = $("restartBtn");
  var captionEl = $("blochCaption");
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hero = window.Bloch.create($("bloch"), { speed: 0.012 });
  var big = window.Bloch.create($("blochBig"), { speed: 0.02 });

  var EXAMPLE = {
    noise: "no",
    circuits: ["qft", "ghz", "grover"],
    other: null,
    output: "samples",
    n: 30,
    hw: ["gpu", "cpu"],
    cpuScale: "node"
  };

  var A = emptyAnswers();
  var review = false;      // true after "Change answers": edits wait for "Measure again"
  var isExample = false;
  var editing = null;      // question reopened by "Change" or "Previous"
  var nDraft = 30;
  var draft = freshDraft();
  var timers = [];
  var lastResult = null, lastFlow = null;

  /* ---------- helpers ---------- */
  function emptyAnswers() { return { circuits: [], other: null, hw: [] }; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function freshDraft() {
    return {
      circuits: A.circuits ? A.circuits.slice() : [],
      otherOn: !!(A.other && A.other.name),
      otherName: A.other ? A.other.name : "",
      otherCls: A.other ? A.other.cls : null,
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
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function show(name) { Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; }); }
  function scrollToEl(node) {
    var top = node.getBoundingClientRect().top + window.pageYOffset - 16;
    window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? "auto" : "smooth" });
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
      return "Density matrix · " + S.bytesLog2(2 * n + 4) + " · " +
        (fitD ? "fits " + lc(fitD.label) : warn("more than one x86 job holds; exact density matrices stop at n = 16"));
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
    return "State vector · " + size + " · " + (fit ? "fits " + lc(fit.label) : warn("beyond every platform in this dissertation"));
  }

  /* ---------- labels ---------- */
  var HW_NAME = { cpu: "CPUs", gpu: "GPUs" };
  function optionsFor(id) { return S.QUESTIONS[id].options ? S.QUESTIONS[id].options(A) : []; }
  function circuitNames() {
    var names = (A.circuits || []).map(function (cid) {
      for (var i = 0; i < S.CIRCUITS.length; i++) if (S.CIRCUITS[i].id === cid) return S.CIRCUITS[i].name;
      return cid;
    });
    if (A.other && A.other.name) names.push(esc(A.other.name) + (A.other.cls === "unsure" ? " (structure unknown)" : ""));
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
  function ket(i, count) {
    var bits = count <= 2 ? 1 : 2;
    var s = i.toString(2);
    while (s.length < bits) s = "0" + s;
    return "|" + s + "⟩";
  }
  function helpFor(q) { return typeof q.help === "function" ? q.help(A) : q.help; }

  /* ---------- answering ---------- */
  function afterAnswer() {
    editing = null;
    isExample = false;
    var f = S.flow(A);
    if (f.done && !review) { startCollapse(); return; }
    renderAsk({ focus: true });
  }
  function setAnswer(id, v) {
    A[id] = v;
    if (id === "noise" && A.n == null) nDraft = v === "yes" ? 12 : 30;
    afterAnswer();
  }
  function commitStructure() {
    A.circuits = draft.circuits.slice();
    A.other = draft.otherOn ? { name: draft.otherName.trim(), cls: draft.otherCls } : null;
    var hasClifford = S.groupsOf(A).some(function (g) { return g.cls === "clifford"; });
    if (A.output === "tableau" && !hasClifford) A.output = null;
    afterAnswer();
  }
  function commitHw() {
    A.hw = ["gpu", "cpu"].filter(function (h) { return draft.hw.indexOf(h) !== -1; });
    afterAnswer();
  }
  function reset() {
    clearTimers();
    A = emptyAnswers();
    review = false; isExample = false; editing = null; nDraft = 30;
    draft = freshDraft();
    hero.reset();
    renderAsk({ focus: true });
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }
  function showExample() {
    clearTimers();
    A = clone(EXAMPLE);
    isExample = true; review = false; editing = null;
    startCollapse();
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
    editing = id;
    if (id === "n" && A.n != null) nDraft = A.n;
    draft = freshDraft();
    renderAsk({ focus: true });
  }

  function questionCard(id, index, f) {
    var q = S.QUESTIONS[id];
    var card = el("div", "card");
    card.appendChild(el("p", "q-eyebrow", "Gate " + (index + 1) + " · " + q.short));
    var prompt = el("h3", "q-prompt", q.prompt);
    prompt.id = "q-" + id;
    card.appendChild(prompt);
    card.appendChild(el("p", "q-help", helpFor(q)));

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
      var prev = el("button", "linkbtn", "← Previous question");
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
      b.appendChild(el("span", "ket", ket(i, opts.length)));
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
        var badge = el("span", "conf conf-" + c.conf, S.CONFIDENCE[c.conf].label);
        b.appendChild(badge);
        b.title = S.CONFIDENCE[c.conf].d;
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

    // A circuit the researcher describes and classifies
    var og = el("div", "cgroup");
    og.appendChild(el("div", "cgroup-h", "<span class=\"cgroup-name\">Not in the list</span><span class=\"cgroup-d\">Describe your own circuit and say how it is structured</span>"));
    var otile = el("button", "ctile other");
    otile.type = "button";
    otile.id = "circ-other";
    otile.setAttribute("aria-pressed", draft.otherOn ? "true" : "false");
    otile.setAttribute("aria-expanded", draft.otherOn ? "true" : "false");
    otile.setAttribute("aria-controls", "other-box");
    otile.appendChild(el("span", "box", ""));
    var otxt = el("span", "ctext");
    otxt.appendChild(el("span", "t", "Another circuit"));
    otxt.appendChild(el("span", "d", "Name it and choose its structure, or pick Not sure"));
    otile.appendChild(otxt);
    otile.appendChild(el("span", "conf conf-user", "Your mapping"));
    og.appendChild(otile);

    var obox = el("div", "otherbox");
    obox.id = "other-box";
    obox.hidden = !draft.otherOn;
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
    S.OTHER_CLASSES.forEach(function (k) {
      var info = k === "unsure" ? S.UNSURE : S.CLASSES[k];
      var c = el("button", "chip ocls" + (k === "unsure" ? " unsure" : ""), info.name);
      c.type = "button";
      c.id = "other-cls-" + k;
      c.title = info.d;
      c.setAttribute("aria-pressed", draft.otherCls === k ? "true" : "false");
      c.addEventListener("click", function () {
        draft.otherCls = k;
        Array.prototype.forEach.call(ocls.children, function (x) { x.setAttribute("aria-pressed", x === c ? "true" : "false"); });
        errCls.hidden = true;
        refresh();
      });
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

    function selection() {
      var other = draft.otherOn && draft.otherName.trim() && draft.otherCls ? { name: draft.otherName.trim(), cls: draft.otherCls } : null;
      return { circuits: draft.circuits, other: other };
    }
    function refresh() {
      var sel = selection();
      var count = sel.circuits.length + (sel.other ? 1 : 0);
      var classes = S.groupsOf(sel).length;
      foot.hint.classList.remove("error");
      foot.hint.textContent = count ? count + " selected · " + classes + " structure class" + (classes > 1 ? "es" : "") : "";
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
        if (!draft.otherName.trim()) return fail(errName, oin, "Give your circuit a name, or untick Another circuit.");
        if (!draft.otherCls) return fail(errCls, firstChip, "Choose its structure, or pick Not sure.");
        count++;
      }
      if (!count) return fail(foot.hint, firstTile, "Select at least one circuit, or describe your own under Another circuit.");
      return true;
    }

    otile.addEventListener("click", function () {
      draft.otherOn = !draft.otherOn;
      otile.setAttribute("aria-pressed", draft.otherOn ? "true" : "false");
      otile.setAttribute("aria-expanded", draft.otherOn ? "true" : "false");
      obox.hidden = !draft.otherOn;
      errName.hidden = true; errCls.hidden = true; oin.removeAttribute("aria-invalid");
      if (draft.otherOn) oin.focus();
      refresh();
    });
    oin.addEventListener("input", function () {
      draft.otherName = oin.value;
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
    cfg.chips.forEach(function (v) {
      var c = el("button", "chip", String(v));
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
    f.qs.forEach(function (id, idx) {
      var li = el("li", "step");
      var isCurrent = id === current;
      if (isCurrent) li.classList.add("current");
      else if (S.answered(A, id)) li.classList.add("done");
      var g = el("span", "gate", S.QUESTIONS[id].gate);
      g.setAttribute("aria-hidden", "true");
      li.appendChild(g);
      li.appendChild(isCurrent ? questionCard(id, idx, f) : doneRow(id));
      stepsEl.appendChild(li);
    });

    var answeredCount = f.qs.filter(function (id) { return S.answered(A, id); }).length;
    restartBtn.hidden = answeredCount === 0;
    var idxCur = current ? f.qs.indexOf(current) : -1;
    statusText.textContent = review && !current ? "Reviewing your answers" : "Measuring · gate " + (idxCur + 1);
    reviewBar.hidden = !(review && f.done && !editing);
    hero.set(answeredCount / (f.qs.length + 1), false, false);
    captionEl.textContent = review && f.done && !editing ? "Ready to measure again" : "Measuring";

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

  /* ---------- collapse sequence ---------- */
  var SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  function sup(k) { return String(k).split("").map(function (d) { return SUP[+d]; }).join(""); }
  function buildLines() {
    var n = A.n;
    var mem = A.noise === "yes"
      ? "Checking the memory wall: 16 B × 4" + sup(n) + " = " + S.bytesLog2(2 * n + 4) + "…"
      : "Checking the memory wall: 16 B × 2" + sup(n) + " = " + S.bytesLog2(n + 4) + "…";
    var pool = [
      "Applying the Born rule to your answers…",
      "Decohering the other candidates…",
      "Fusing gates before the clock starts…",
      "Waiting for InfiniBand at 0.9 GB/s…",
      "Tracing out the environment…",
      "Contracting the tensor network of options…",
      "Asking Gottesman and Knill…",
      "Swapping a global qubit with a local one…",
      "Skipping the copy to host memory…"
    ];
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return ["Collapsing the state…", mem, pool[0], pool[1], "Reading out the measurement…"];
  }

  function startCollapse() {
    clearTimers();
    lastResult = S.recommendAll(A);
    lastFlow = S.flow(A);
    show("collapse");
    scrollToEl(views.collapse);
    big.resize();
    big.reset();
    big.spin(0.18);
    hero.spin(0.07);
    captionEl.textContent = "Collapsing";
    var lines = buildLines();
    var lineEl = $("collapseLine"), fill = $("collapseFill");
    fill.style.width = "0%";
    if (reduceMotion) {
      lineEl.innerHTML = lines[0];
      fill.style.width = "100%";
      timers.push(setTimeout(finishCollapse, 700));
      return;
    }
    var step = 560;
    lines.forEach(function (text, i) {
      timers.push(setTimeout(function () {
        lineEl.innerHTML = text;
        lineEl.classList.remove("in");
        void lineEl.offsetWidth;
        lineEl.classList.add("in");
        fill.style.width = Math.round(((i + 1) / lines.length) * 100) + "%";
      }, i * step));
    });
    timers.push(setTimeout(function () { big.collapse(); }, (lines.length - 1) * step));
    timers.push(setTimeout(finishCollapse, lines.length * step + 520));
  }

  function finishCollapse() {
    clearTimers();
    big.collapse();
    hero.set(1, true, true);
    renderResults(lastResult, lastFlow);
    show("result");
    scrollToEl(views.result);
    $("rHeading").focus({ preventScroll: true });
  }

  /* ---------- readout ---------- */
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
      li.appendChild(el("span", "mk", ok ? "✓" : "×"));
      var txt = el("span", "fit-text");
      txt.appendChild(el("span", "fit-name", p.label));
      var status;
      if (p.measured == null) status = el("span", "fit-status none", "Not measured in the thesis");
      else if (p.measured >= p.n) status = el("span", "fit-status full", "Measured up to <i>n</i> = " + p.measured);
      else status = el("span", "fit-status part", "Measured up to <i>n</i> = " + p.measured + "; capacity beyond");
      if (p.measured != null && n > p.measured && n <= p.n) status.innerHTML += " · your size not measured";
      txt.appendChild(status);
      li.appendChild(txt);
      li.appendChild(el("span", "cap-n", "holds <i>n</i> ≤ " + p.n));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    box.appendChild(el("p", "fit-legend", "<b>Holds</b> is the largest double-precision state that fits; <b>measured</b> is the largest size this dissertation ran there."));
    return box;
  }

  function pathList(qs) {
    var ol = el("ol", "path");
    qs.forEach(function (id) {
      if (!S.answered(A, id)) return;
      var li = el("li");
      li.appendChild(el("span", "pg", S.QUESTIONS[id].gate));
      li.appendChild(el("span", "", "<span class=\"pq\">" + S.QUESTIONS[id].short + " → </span><span class=\"pa\">" + answerLabel(id) + "</span>"));
      ol.appendChild(li);
    });
    return ol;
  }

  // Backend name as a link to its source repository; opens in a new tab.
  function repoLink(name, withMark) {
    var a = el("a", "repo", esc(name) + (withMark ? "<span class=\"repo-mark\" aria-hidden=\"true\">GitHub ↗</span>" : ""));
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
      var a = repoLink(name, false);
      a.classList.add("inline");
      b.textContent = "";
      b.appendChild(a);
    });
    return p;
  }

  function outcomeView(o, bigView) {
    var r = o.rec;
    var wrap = el("div", "outcome-block" + (bigView ? " big" : ""));
    var head = el("div", "outcome");
    var sw = el("span", "swatch");
    var colour = S.COLOURS[r.b] || "#86d4f0";
    sw.style.background = colour;
    sw.style.setProperty("--swatch-glow", colour);
    if (!reduceMotion) sw.appendChild(el("span", "ring"));
    head.appendChild(sw);
    var nameBox = el("div", "oname");
    if (o.hw) nameBox.appendChild(el("span", "hwtag", "On " + HW_NAME[o.hw]));
    var title = el(bigView ? "h3" : "h4", "outcome-name");
    title.appendChild(S.REPOS[r.b] ? repoLink(r.b, true) : document.createTextNode(r.b));
    nameBox.appendChild(title);
    head.appendChild(nameBox);
    wrap.appendChild(head);
    wrap.appendChild(el("p", "regime", r.regime + (r.kind === "sv" && r.b.indexOf("No feasible") !== 0 && r.b.indexOf("Beyond") !== 0 ? " · double precision" : "")));
    if (r.out) wrap.appendChild(el("p", "outnote", r.out));
    wrap.appendChild(el("p", "ev", r.ev));
    if (r.alt) wrap.appendChild(linkNames(el("p", "alt", "Also consider " + r.alt + ".")));
    if (r.note) wrap.appendChild(el("p", "alt", r.note));
    if (r.caveats && r.caveats.length) {
      var det = el("details", "conds");
      if (bigView) det.open = true;
      det.appendChild(el("summary", "", "Holds under " + r.caveats.length + " condition" + (r.caveats.length > 1 ? "s" : "")));
      var ul = el("ul", "caveats");
      r.caveats.forEach(function (c) { ul.appendChild(el("li", "", c)); });
      det.appendChild(ul);
      wrap.appendChild(det);
    }
    return wrap;
  }

  function workloadLine() {
    if (A.noise === "yes") return "Exact noisy evolution · " + A.n + " qubits";
    var names = circuitNames();
    var what = names.length <= 2 ? names.join(" and ") : names.length + " circuits";
    var out = { samples: "samples", state: "full state", tableau: "tableau" }[A.output] || "";
    return what + " · " + A.n + " qubits · " + out;
  }

  function renderResults(res, f) {
    var outs = [];
    res.blocks.forEach(function (b) { b.outcomes.forEach(function (o) { outs.push(o); }); });
    var single = outs.length === 1;
    var anyOut = outs.some(function (o) { return o.rec.out; });
    var anyUnsure = res.blocks.some(function (b) { return b.unsure.length; });

    $("rEyebrow").textContent = single ? "Measurement outcome" : outs.length + " measurement outcomes";
    var names = [];
    outs.forEach(function (o) { if (names.indexOf(o.rec.b) === -1) names.push(o.rec.b); });
    $("rHeading").textContent = names.join(" · ");
    $("rSub").innerHTML = workloadLine() + (single ? "" : "<br><span class=\"r-sub-note\">One outcome per structure class" + (S.hwList(A).length === 2 ? " and hardware" : "") + "</span>");

    var flags = $("rFlags");
    flags.innerHTML = "";
    if (isExample) flags.appendChild(el("span", "flag ex", "Example query"));
    if (anyUnsure) flags.appendChild(el("span", "flag unsure", "Partly inconclusive"));
    flags.appendChild(el("span", "flag " + (anyOut ? "out" : "in"), anyOut ? "Beyond measured range" : "Within measured range"));

    var cont = $("outcomes");
    cont.innerHTML = "";
    res.blocks.forEach(function (b) {
      var card = el("section", "block");
      if (b.cls) {
        var bh = el("div", "block-h");
        bh.appendChild(el("p", "block-cls", S.CLASSES[b.cls].name));
        var badges = el("div", "cbadges");
        b.circuits.forEach(function (c) {
          var s = el("span", "cbadge conf-" + c.conf, esc(c.name));
          s.title = S.CONFIDENCE[c.conf].label + ": " + c.note;
          badges.appendChild(s);
        });
        bh.appendChild(badges);
        card.appendChild(bh);
        if (b.unsure.length) {
          var list = b.unsure.map(function (c) { return esc(c.name); }).join(", ");
          var all = b.unsure.length === b.circuits.length;
          var plural = b.unsure.length > 1;
          card.appendChild(el("p", "incon",
            "<b>Inconclusive for " + list + ".</b> " + (plural ? "These circuits were" : "This circuit was") +
            " not benchmarked and " + (plural ? "are" : "is") + " mapped to this class by structure, so " +
            (all ? "the outcome is a best guess." : "the outcome is measured for the other circuits and only expected for " + (plural ? "these." : "this one."))));
        }
      }
      var outsEl = el("div", "block-outs" + (b.outcomes.length > 1 ? " pair" : ""));
      b.outcomes.forEach(function (o) { outsEl.appendChild(outcomeView(o, single)); });
      card.appendChild(outsEl);
      cont.appendChild(card);
    });

    var refOnly = res.blocks.every(function (b) { return b.outcomes.every(function (o) { return o.rec.kind === "sv-ref"; }); });
    var mem = $("memory"); mem.innerHTML = ""; mem.appendChild(meter(res.kind, A.n, refOnly));
    var path = $("path"); path.innerHTML = ""; path.appendChild(pathList(f.qs));
    $("copyStatus").textContent = "";
    $("copyFallback").innerHTML = "";
    captionEl.textContent = single ? "Collapsed onto " + outs[0].rec.b : "Collapsed onto " + outs.length + " outcomes";
  }

  function summaryText(res, qs) {
    var lines = ["Quantum Simulator Selector (prototype)", ""];
    qs.forEach(function (id) { if (S.answered(A, id)) lines.push(S.QUESTIONS[id].short + ": " + strip(answerLabel(id))); });
    res.blocks.forEach(function (b) {
      lines.push("");
      if (b.cls) lines.push("== " + S.CLASSES[b.cls].name + ": " + b.circuits.map(function (c) { return c.name + " (" + S.CONFIDENCE[c.conf].label + ")"; }).join(", "));
      b.outcomes.forEach(function (o) {
        var r = o.rec;
        lines.push((o.hw ? "On " + HW_NAME[o.hw] + ": " : "") + r.b + " · " + strip(r.regime));
        lines.push(strip(r.ev));
        if (r.alt) lines.push("Also consider " + strip(r.alt) + ".");
        if (r.note) lines.push(strip(r.note));
        if (r.out) lines.push("Range: " + strip(r.out));
        (r.caveats || []).forEach(function (c) { lines.push("- " + strip(c)); });
      });
    });
    lines.push("", "Fastest configurations measured on Deucalion and an i9-13900KS workstation, double precision.");
    return lines.join("\n");
  }

  function copySummary() {
    var text = summaryText(lastResult, lastFlow.qs);
    var status = $("copyStatus");
    function fallback() {
      var holder = $("copyFallback");
      holder.innerHTML = "";
      var ta = el("textarea", "copybox");
      ta.readOnly = true;
      ta.value = text;
      ta.setAttribute("aria-label", "Summary to copy");
      holder.appendChild(ta);
      ta.focus(); ta.select();
      status.textContent = "Select all and copy";
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { status.textContent = "Copied"; }, fallback);
      } else fallback();
    } catch (e) { fallback(); }
  }

  /* ---------- wiring ---------- */
  $("exampleBtn").addEventListener("click", showExample);
  restartBtn.addEventListener("click", reset);
  $("measureBtn").addEventListener("click", function () { if (S.flow(A).done) startCollapse(); });
  $("skipBtn").addEventListener("click", finishCollapse);
  $("changeBtn").addEventListener("click", function () {
    review = true; editing = null; isExample = false;
    hero.set(0.9, false, false);
    renderAsk({ focus: false });
    scrollToEl(views.ask);
  });
  $("newBtn").addEventListener("click", reset);
  $("copyBtn").addEventListener("click", copySummary);

  renderAsk({ focus: false });
})();
