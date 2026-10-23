/* Interface of the Quantum Simulator Selector. Reads the rules from window.Selector. */
(function () {
  "use strict";

  var S = window.Selector;
  var stepsEl = document.getElementById("steps");
  var resultEl = document.getElementById("result");
  var captionEl = document.getElementById("blochCaption");
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var EXAMPLE = { noise: "no", structure: "dense", output: "state", n: 30, hw: "gpu", host: "yes" };
  var A = copy(EXAMPLE);
  var isExample = true;
  var editing = null;
  var nDraft = 30;

  function copy(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function strip(html) { var d = document.createElement("div"); d.innerHTML = html; return d.textContent || ""; }

  /* ---------- memory ---------- */
  var UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
  function fmtLog2(l) {
    var u = Math.floor(l / 10);
    if (u > 8) return "2<sup>" + l + "</sup> bytes";
    return Math.pow(2, l - 10 * u) + " " + UNITS[u];
  }
  function memLog2(kind, n) { return kind === "dm" ? 2 * n + 4 : n + 4; }
  function platforms(kind) { return kind === "dm" ? S.DM_PLATFORMS : S.SV_PLATFORMS; }
  function firstFit(kind, n) {
    var list = platforms(kind);
    for (var i = 0; i < list.length; i++) if (n <= list[i].n) return list[i];
    return null;
  }
  function liveText(n) {
    var kind = A.noise === "yes" ? "dm" : "sv";
    var name = kind === "dm" ? "Density matrix" : "State vector";
    var fit = firstFit(kind, n);
    var where = fit ? "fits " + fit.label.charAt(0).toLowerCase() + fit.label.slice(1)
                    : "<span class=\"warn\">larger than every platform measured</span>";
    return name + " · " + fmtLog2(memLog2(kind, n)) + " · " + where;
  }

  /* ---------- labels ---------- */
  function optionsFor(id) { return S.QUESTIONS[id].options ? S.QUESTIONS[id].options(A) : []; }
  function answerLabel(id) {
    if (id === "n") return "<i>n</i> = " + A.n;
    var opts = optionsFor(id);
    for (var i = 0; i < opts.length; i++) if (opts[i].v === A[id]) return opts[i].t;
    return "";
  }
  function ket(i, count) {
    var bits = count <= 2 ? 1 : 2;
    var s = i.toString(2);
    while (s.length < bits) s = "0" + s;
    return "|" + s + "⟩";
  }

  /* ---------- actions ---------- */
  function setAnswer(id, v) {
    A[id] = v;
    isExample = false;
    if (id === "structure" && A.output === "tableau" && v !== "clifford") A.output = null;
    if (id === "noise" && A.n == null) nDraft = v === "yes" ? 12 : 30;
    editing = null;
    render({ focus: true, collapse: true });
  }
  function reset() {
    A = {};
    isExample = false;
    editing = null;
    nDraft = 30;
    render({ focus: true });
  }

  /* ---------- question cards ---------- */
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
    b.addEventListener("click", function () {
      editing = id;
      if (id === "n" && A.n != null) nDraft = A.n;
      render({ focus: true });
    });
    card.appendChild(b);
    return card;
  }

  function questionCard(id, index) {
    var q = S.QUESTIONS[id];
    var card = el("div", "card");
    card.appendChild(el("p", "q-eyebrow", "Gate " + (index + 1) + " · " + q.short));
    var prompt = el("h3", "q-prompt", q.prompt);
    prompt.id = "q-" + id;
    card.appendChild(prompt);
    card.appendChild(el("p", "q-help", q.help));

    if (id === "n") {
      card.appendChild(qubitControls());
      return card;
    }

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
    card.appendChild(grid);
    return card;
  }

  function qubitControls() {
    var box = el("div");
    var row = el("div", "nrow");
    var big = el("div", "nbig");
    var label = el("label", "nlabel", "Qubits");
    var input = el("input", "nin");
    input.type = "number"; input.min = "2"; input.max = "1000"; input.step = "1"; input.id = "n-input";
    input.value = String(nDraft);
    input.setAttribute("inputmode", "numeric");
    label.setAttribute("for", "n-input");
    label.appendChild(input);
    row.appendChild(big); row.appendChild(label);
    box.appendChild(row);

    var range = el("input");
    range.type = "range"; range.min = "2"; range.max = "600"; range.step = "1"; range.id = "n-range";
    range.setAttribute("aria-label", "Number of qubits");
    box.appendChild(range);

    var chips = el("div", "chips");
    [8, 13, 20, 24, 30, 33, 34, 35, 60, 500].forEach(function (v) {
      var c = el("button", "chip", String(v));
      c.type = "button";
      c.addEventListener("click", function () { update(v); });
      chips.appendChild(c);
    });
    box.appendChild(chips);

    var live = el("p", "nlive");
    box.appendChild(live);

    var go = el("button", "btn");
    go.type = "button";
    box.appendChild(go);

    function update(v) {
      v = Math.round(Number(v));
      if (!isFinite(v)) return;
      v = Math.max(2, Math.min(1000, v));
      nDraft = v;
      big.innerHTML = "<i>n</i> = " + v;
      if (String(input.value) !== String(v)) input.value = String(v);
      range.value = String(Math.min(600, v));
      live.innerHTML = liveText(v);
      go.textContent = "Set " + v + " qubits";
    }
    function confirm() {
      A.n = nDraft;
      isExample = false;
      editing = null;
      render({ focus: true, collapse: true });
    }
    input.addEventListener("input", function () { if (input.value !== "") update(input.value); });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); update(input.value); confirm(); } });
    range.addEventListener("input", function () { update(range.value); });
    go.addEventListener("click", confirm);
    update(nDraft);
    return box;
  }

  /* ---------- result panel ---------- */
  function meter(kind, n, refLabel) {
    var box = el("div");
    var l = memLog2(kind === "dm" ? "dm" : "sv", n);
    var list = platforms(kind === "dm" ? "dm" : "sv");
    var name = kind === "dm" ? "Density matrix" : (refLabel ? "A dense state vector would need" : "State vector");
    box.appendChild(el("div", "meter-label", "<span>" + name + "</span><b>" + fmtLog2(l) + "</b>"));

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
      c.style.left = "calc(" + pct(memLog2(kind === "dm" ? "dm" : "sv", p.n)) + "% - 1px)";
      c.title = p.label + ", up to n = " + p.n;
      bar.appendChild(c);
    });
    box.appendChild(bar);

    var ul = el("ul", "fits");
    list.forEach(function (p) {
      var ok = n <= p.n;
      var li = el("li", ok ? "yes" : "no");
      li.appendChild(el("span", "mk", ok ? "✓" : "×"));
      li.appendChild(el("span", "", p.label));
      li.appendChild(el("span", "cap-n", "up to <i>n</i> = " + p.n));
      ul.appendChild(li);
    });
    box.appendChild(ul);
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

  function summaryText(r, qs) {
    var lines = ["Quantum Simulator Selector (prototype)", ""];
    qs.forEach(function (id) { if (S.answered(A, id)) lines.push(S.QUESTIONS[id].short + ": " + strip(answerLabel(id))); });
    lines.push("", "Recommendation: " + r.b, r.regime, "", strip(r.ev));
    if (r.alt) lines.push("Also consider: " + strip(r.alt));
    if (r.out) lines.push("Range: " + strip(r.out));
    (r.caveats || []).forEach(function (c) { lines.push("- " + strip(c)); });
    lines.push("", "Fastest configurations measured on Deucalion and an i9-13900KS workstation, double precision.");
    return lines.join("\n");
  }

  function renderWaiting(f) {
    resultEl.className = "result waiting";
    resultEl.innerHTML = "";
    var top = el("div", "r-top");
    top.appendChild(el("p", "r-eyebrow", "Awaiting measurement"));
    resultEl.appendChild(top);
    var o = el("div", "outcome");
    o.appendChild(el("h3", "outcome-name", "Candidates in superposition"));
    resultEl.appendChild(o);
    var wave = el("div", "wave");
    ["Qiskit Aer", "CUDA-Q", "Qulacs", "mpiQulacs", "Qibo", "QuEST"].forEach(function (b) { wave.appendChild(el("span", "", b)); });
    resultEl.appendChild(wave);
    var remaining = f.qs.filter(function (id) { return !S.answered(A, id); }).length || 1;
    resultEl.appendChild(el("p", "alt", editing
      ? "Choose a new answer to measure again."
      : "Answer the remaining question" + (remaining > 1 ? "s" : "") + " to collapse the choice onto one backend."));
    var nShown = A.n != null ? A.n : (f.qs.indexOf("n") !== -1 ? nDraft : null);
    if (nShown != null) {
      resultEl.appendChild(el("p", "subhead", "Memory"));
      resultEl.appendChild(meter(A.noise === "yes" ? "dm" : "sv", nShown, false));
    }
    if (f.qs.some(function (id) { return S.answered(A, id); })) {
      resultEl.appendChild(el("p", "subhead", "Path so far"));
      resultEl.appendChild(pathList(f.qs));
    }
    captionEl.textContent = "Superposition of candidates";
  }

  function renderResult(f, collapse) {
    var r = S.recommend(A);
    resultEl.className = "result";
    resultEl.innerHTML = "";

    var top = el("div", "r-top");
    top.appendChild(el("p", "r-eyebrow", "Measurement outcome"));
    var flags = el("div", "flags");
    if (isExample) flags.appendChild(el("span", "flag ex", "Example query"));
    flags.appendChild(el("span", "flag " + (r.out ? "out" : "in"), r.out ? "Outside measured range" : "Measured"));
    top.appendChild(flags);
    resultEl.appendChild(top);

    var o = el("div", "outcome");
    var sw = el("span", "swatch");
    var colour = S.COLOURS[r.b] || "#86d4f0";
    sw.style.background = colour;
    sw.style.setProperty("--swatch-glow", colour);
    if (collapse && !reduceMotion) sw.appendChild(el("span", "ring"));
    o.appendChild(sw);
    o.appendChild(el("h3", "outcome-name", r.b));
    resultEl.appendChild(o);
    resultEl.appendChild(el("p", "regime", r.regime + (r.kind === "sv" ? " · double precision" : "")));
    if (r.out) resultEl.appendChild(el("p", "outnote", r.out));
    resultEl.appendChild(el("p", "ev", r.ev));
    if (r.alt) resultEl.appendChild(el("p", "alt", "Also consider " + r.alt + "."));

    if (r.caveats && r.caveats.length) {
      resultEl.appendChild(el("p", "subhead", "Holds under these conditions"));
      var ul = el("ul", "caveats");
      r.caveats.forEach(function (c) { ul.appendChild(el("li", "", c)); });
      resultEl.appendChild(ul);
    }

    resultEl.appendChild(el("p", "subhead", "Memory"));
    resultEl.appendChild(meter(r.kind === "dm" ? "dm" : "sv", A.n, r.kind === "sv-ref"));

    resultEl.appendChild(el("p", "subhead", "Decision path"));
    resultEl.appendChild(pathList(f.qs));

    var actions = el("div", "actions");
    var again = el("button", "btn", "New query");
    again.type = "button";
    again.addEventListener("click", reset);
    var cp = el("button", "btn ghost", "Copy summary");
    cp.type = "button";
    var status = el("span", "status");
    status.setAttribute("role", "status");
    cp.addEventListener("click", function () {
      var text = summaryText(r, f.qs);
      function fallback() {
        var old = resultEl.querySelector(".copybox");
        if (old) old.remove();
        var ta = el("textarea", "copybox");
        ta.readOnly = true;
        ta.value = text;
        resultEl.appendChild(ta);
        ta.focus(); ta.select();
        status.textContent = "Select all and copy";
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { status.textContent = "Copied"; }, fallback);
        } else fallback();
      } catch (e) { fallback(); }
    });
    actions.appendChild(again); actions.appendChild(cp); actions.appendChild(status);
    resultEl.appendChild(actions);

    captionEl.textContent = "Collapsed onto " + r.b;
    if (collapse && window.matchMedia && window.matchMedia("(max-width: 920px)").matches) {
      resultEl.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    }
  }

  /* ---------- render ---------- */
  function render(opts) {
    opts = opts || {};
    var f = S.flow(A);
    var current = editing;
    if (!current) {
      for (var i = 0; i < f.qs.length; i++) if (!S.answered(A, f.qs[i])) { current = f.qs[i]; break; }
    }

    stepsEl.innerHTML = "";
    f.qs.forEach(function (id, idx) {
      var li = el("li", "step");
      var isCurrent = id === current;
      if (isCurrent) li.classList.add("current");
      else if (S.answered(A, id)) li.classList.add("done");
      li.appendChild(el("span", "gate", S.QUESTIONS[id].gate));
      li.lastChild.setAttribute("aria-hidden", "true");
      li.appendChild(isCurrent ? questionCard(id, idx) : doneRow(id));
      stepsEl.appendChild(li);
    });

    var done = f.done && !editing;
    var answeredCount = f.qs.filter(function (id) { return S.answered(A, id); }).length;
    var progress = answeredCount / (f.qs.length + (done ? 0 : 1));
    window.Bloch.set(progress, done, !!opts.collapse);

    if (done) renderResult(f, !!opts.collapse);
    else renderWaiting(f);

    if (opts.focus) {
      var target = stepsEl.querySelector(".step.current .opt[aria-pressed=\"true\"], .step.current .opt, .step.current .nin");
      if (target) {
        target.focus({ preventScroll: true });
        target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
      }
    }
  }

  document.getElementById("resetTop").addEventListener("click", reset);
  render();
})();
