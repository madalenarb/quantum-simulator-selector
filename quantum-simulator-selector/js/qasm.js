/*
 * OpenQASM 2 and 3 reader for the selector. It parses the common subset that circuit
 * libraries export (registers, gate calls with parameters and modifiers, gate
 * definitions, measurement, reset, barrier, if), expands user-defined gates, and
 * analyses the circuit: qubit count, gate counts, depth, whether every gate is
 * Clifford (an exact test), and how the two-qubit gates connect the register, which
 * suggests one of the four structure classes (a heuristic).
 *
 * QASM.analyse(text) returns the analysis or throws { line, message }.
 * QASM.example(kind, n) returns an OpenQASM 2 example circuit.
 */
(function () {
  "use strict";

  var MAX_TEXT = 5 * 1024 * 1024;
  var MAX_OPS = 2000000;

  /* ---------- complex 2x2 algebra for the Clifford test ---------- */
  function cx(re, im) { return { re: re, im: im || 0 }; }
  function cmul(a, b) { return cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re); }
  function cadd(a, b) { return cx(a.re + b.re, a.im + b.im); }
  function cexp(t) { return cx(Math.cos(t), Math.sin(t)); }
  function cconj(a) { return cx(a.re, -a.im); }
  function cabs(a) { return Math.sqrt(a.re * a.re + a.im * a.im); }
  function M(a, b, c, d) { return [[a, b], [c, d]]; }
  function mmul(A, B) {
    return M(cadd(cmul(A[0][0], B[0][0]), cmul(A[0][1], B[1][0])), cadd(cmul(A[0][0], B[0][1]), cmul(A[0][1], B[1][1])),
      cadd(cmul(A[1][0], B[0][0]), cmul(A[1][1], B[1][0])), cadd(cmul(A[1][0], B[0][1]), cmul(A[1][1], B[1][1])));
  }
  function dag(A) { return M(cconj(A[0][0]), cconj(A[1][0]), cconj(A[0][1]), cconj(A[1][1])); }
  function scale(A, c) { return M(cmul(A[0][0], c), cmul(A[0][1], c), cmul(A[1][0], c), cmul(A[1][1], c)); }
  var ONE = cx(1), ZERO = cx(0), I_ = cx(0, 1);
  var PI = Math.PI;
  var P_I = M(ONE, ZERO, ZERO, ONE), P_X = M(ZERO, ONE, ONE, ZERO), P_Y = M(ZERO, cx(0, -1), I_, ZERO), P_Z = M(ONE, ZERO, ZERO, cx(-1));
  var PAULIS = [P_I, P_X, P_Y, P_Z];
  function near(a, b) { return Math.abs(a.re - b.re) < 1e-7 && Math.abs(a.im - b.im) < 1e-7; }
  function meq(A, B) { return near(A[0][0], B[0][0]) && near(A[0][1], B[0][1]) && near(A[1][0], B[1][0]) && near(A[1][1], B[1][1]); }
  // U = c P for a Pauli P? Returns c or null.
  function pauliFactor(U) {
    for (var i = 0; i < 4; i++) {
      var P = PAULIS[i];
      var tr = cadd(cmul(cconj(P[0][0]), U[0][0]), cadd(cmul(cconj(P[1][0]), U[1][0]), cadd(cmul(cconj(P[0][1]), U[0][1]), cmul(cconj(P[1][1]), U[1][1]))));
      var c = cx(tr.re / 2, tr.im / 2);
      if (Math.abs(cabs(c) - 1) < 1e-7 && meq(scale(P, c), U)) return { c: c, p: i };
    }
    return null;
  }
  function quarterPhase(c) { return near(c, ONE) || near(c, I_) || near(c, cx(-1)) || near(c, cx(0, -1)); }
  // A one-qubit gate is Clifford when it maps X and Z to Paulis under conjugation.
  function clifford1(U) {
    var a = pauliFactor(mmul(mmul(U, P_X), dag(U)));
    var b = pauliFactor(mmul(mmul(U, P_Z), dag(U)));
    return !!(a && b && a.p !== 0 && b.p !== 0);
  }
  // Singly controlled U is Clifford when U is a Pauli times a phase in {1, i, -1, -i}.
  function cliffordCtrl(U) { var f = pauliFactor(U); return !!(f && quarterPhase(f.c)); }
  function mpow(U, k) {
    var R = P_I, B = k < 0 ? dag(U) : U, e = Math.abs(k);
    while (e > 0) { if (e & 1) R = mmul(R, B); B = mmul(B, B); e >>= 1; }
    return R;
  }

  function U3(t, p, l) {
    var c = Math.cos(t / 2), s = Math.sin(t / 2);
    return M(cx(c), cmul(cexp(l), cx(-s)), cmul(cexp(p), cx(s)), cmul(cexp(p + l), cx(c)));
  }
  function RX(t) { var c = Math.cos(t / 2), s = Math.sin(t / 2); return M(cx(c), cx(0, -s), cx(0, -s), cx(c)); }
  function RY(t) { var c = Math.cos(t / 2), s = Math.sin(t / 2); return M(cx(c), cx(-s), cx(s), cx(c)); }
  function RZ(t) { return M(cexp(-t / 2), ZERO, ZERO, cexp(t / 2)); }
  function PH(l) { return M(ONE, ZERO, ZERO, cexp(l)); }
  var R2 = 1 / Math.sqrt(2);
  var H = M(cx(R2), cx(R2), cx(R2), cx(-R2));
  var S = PH(PI / 2), SDG = PH(-PI / 2), T = PH(PI / 4), TDG = PH(-PI / 4);
  var SX = M(cx(0.5, 0.5), cx(0.5, -0.5), cx(0.5, -0.5), cx(0.5, 0.5));
  function multipleOf(x, step) { var r = x / step; return Math.abs(r - Math.round(r)) < 1e-9; }

  // Standard gates of qelib1.inc and stdgates.inc. m: matrix of a one-qubit gate; t: target of a controlled gate.
  var LIB = {
    id: { q: 1, p: 0, m: function () { return P_I; } },
    u0: { q: 1, p: 1, m: function () { return P_I; } },
    x: { q: 1, p: 0, m: function () { return P_X; } },
    y: { q: 1, p: 0, m: function () { return P_Y; } },
    z: { q: 1, p: 0, m: function () { return P_Z; } },
    h: { q: 1, p: 0, m: function () { return H; } },
    s: { q: 1, p: 0, m: function () { return S; } },
    sdg: { q: 1, p: 0, m: function () { return SDG; } },
    t: { q: 1, p: 0, m: function () { return T; } },
    tdg: { q: 1, p: 0, m: function () { return TDG; } },
    sx: { q: 1, p: 0, m: function () { return SX; } },
    sxdg: { q: 1, p: 0, m: function () { return dag(SX); } },
    rx: { q: 1, p: 1, m: function (a) { return RX(a[0]); } },
    ry: { q: 1, p: 1, m: function (a) { return RY(a[0]); } },
    rz: { q: 1, p: 1, m: function (a) { return RZ(a[0]); } },
    p: { q: 1, p: 1, m: function (a) { return PH(a[0]); } },
    u1: { q: 1, p: 1, m: function (a) { return PH(a[0]); } },
    phase: { q: 1, p: 1, m: function (a) { return PH(a[0]); } },
    u2: { q: 1, p: 2, m: function (a) { return U3(PI / 2, a[0], a[1]); } },
    u3: { q: 1, p: 3, m: function (a) { return U3(a[0], a[1], a[2]); } },
    u: { q: 1, p: 3, m: function (a) { return U3(a[0], a[1], a[2]); } },
    U: { q: 1, p: 3, m: function (a) { return U3(a[0], a[1], a[2]); } },
    cx: { q: 2, p: 0, ctrl: 1, t: function () { return P_X; } },
    CX: { q: 2, p: 0, ctrl: 1, t: function () { return P_X; } },
    cnot: { q: 2, p: 0, ctrl: 1, t: function () { return P_X; } },
    cy: { q: 2, p: 0, ctrl: 1, t: function () { return P_Y; } },
    cz: { q: 2, p: 0, ctrl: 1, t: function () { return P_Z; } },
    ch: { q: 2, p: 0, ctrl: 1, t: function () { return H; } },
    cs: { q: 2, p: 0, ctrl: 1, t: function () { return S; } },
    csdg: { q: 2, p: 0, ctrl: 1, t: function () { return SDG; } },
    csx: { q: 2, p: 0, ctrl: 1, t: function () { return SX; } },
    crx: { q: 2, p: 1, ctrl: 1, t: function (a) { return RX(a[0]); } },
    cry: { q: 2, p: 1, ctrl: 1, t: function (a) { return RY(a[0]); } },
    crz: { q: 2, p: 1, ctrl: 1, t: function (a) { return RZ(a[0]); } },
    cp: { q: 2, p: 1, ctrl: 1, t: function (a) { return PH(a[0]); } },
    cu1: { q: 2, p: 1, ctrl: 1, t: function (a) { return PH(a[0]); } },
    cphase: { q: 2, p: 1, ctrl: 1, t: function (a) { return PH(a[0]); } },
    cu3: { q: 2, p: 3, ctrl: 1, t: function (a) { return U3(a[0], a[1], a[2]); } },
    cu: { q: 2, p: 4, ctrl: 1, t: function (a) { return scale(U3(a[0], a[1], a[2]), cexp(a[3])); } },
    swap: { q: 2, p: 0, cliff: true },
    iswap: { q: 2, p: 0, cliff: true },
    ecr: { q: 2, p: 0, cliff: true },
    dcx: { q: 2, p: 0, cliff: true },
    rxx: { q: 2, p: 1, half: true },
    ryy: { q: 2, p: 1, half: true },
    rzz: { q: 2, p: 1, half: true },
    rzx: { q: 2, p: 1, half: true },
    ccx: { q: 3, p: 0, cliff: false },
    ccz: { q: 3, p: 0, cliff: false },
    cswap: { q: 3, p: 0, cliff: false },
    rccx: { q: 3, p: 0, cliff: false },
    c3x: { q: 4, p: 0, cliff: false },
    rc3x: { q: 4, p: 0, cliff: false },
    c3sqrtx: { q: 4, p: 0, cliff: false },
    c4x: { q: 5, p: 0, cliff: false }
  };

  var WIDE = { swap: 1, iswap: 1, dcx: 1, cswap: 1 };

  /* ---------- tokens ---------- */
  function fail(line, message) { var e = new Error(message); e.line = line; e.qasm = true; throw e; }
  function tokenize(src) {
    var toks = [], i = 0, line = 1, n = src.length;
    var two = { "->": 1, "**": 1, "==": 1, "!=": 1, "<=": 1, ">=": 1, "&&": 1, "||": 1, "<<": 1, ">>": 1, "+=": 1, "-=": 1, "*=": 1, "/=": 1, "++": 1 };
    while (i < n) {
      var ch = src[i];
      if (ch === "\n") { line++; i++; continue; }
      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\f" || ch === "\v" || ch === "﻿") { i++; continue; }
      if (ch === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
      if (ch === "/" && src[i + 1] === "*") {
        i += 2;
        while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; }
        i += 2;
        continue;
      }
      if (ch === "#" || (ch === "@" && /[A-Za-z]/.test(src[i + 1] || "") && (toks.length === 0 || toks[toks.length - 1].v === ";" || toks[toks.length - 1].v === "}" || toks[toks.length - 1].v === "{"))) {
        // pragma or annotation line
        while (i < n && src[i] !== "\n") i++;
        continue;
      }
      if (ch === "\"" || ch === "'") {
        var j = i + 1;
        while (j < n && src[j] !== ch && src[j] !== "\n") j++;
        toks.push({ k: "str", v: src.slice(i + 1, j), line: line });
        i = j + 1;
        continue;
      }
      var num = /^(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?/.exec(src.slice(i, i + 64));
      if (num && num[0] !== ".") {
        toks.push({ k: "num", v: parseFloat(num[0].replace(/_/g, "")), raw: num[0], line: line });
        i += num[0].length;
        if (src[i] === "i" && src[i + 1] === "m") i += 2;
        continue;
      }
      var id = /^[A-Za-z_$À-￿][A-Za-z0-9_$À-￿]*/.exec(src.slice(i, i + 256));
      if (id) { toks.push({ k: "id", v: id[0], line: line }); i += id[0].length; continue; }
      var pair = src.substr(i, 2);
      if (two[pair]) { toks.push({ k: "op", v: pair, line: line }); i += 2; continue; }
      toks.push({ k: "op", v: ch, line: line });
      i++;
    }
    toks.push({ k: "eof", v: "", line: line });
    return toks;
  }

  /* ---------- parser ---------- */
  function Parser(toks) { this.t = toks; this.i = 0; }
  Parser.prototype.peek = function (o) { return this.t[this.i + (o || 0)]; };
  Parser.prototype.next = function () { return this.t[this.i++]; };
  Parser.prototype.is = function (v) { var p = this.peek(); return p.v === v && p.k !== "str"; };
  Parser.prototype.eat = function (v) { if (this.is(v)) { this.i++; return true; } return false; };
  Parser.prototype.expect = function (v) {
    var p = this.next();
    if (p.v !== v || p.k === "str") fail(p.line, "Expected “" + v + "” but found “" + (p.k === "eof" ? "end of file" : p.v) + "”.");
    return p;
  };
  Parser.prototype.ident = function () {
    var p = this.next();
    if (p.k !== "id") fail(p.line, "Expected a name but found “" + (p.k === "eof" ? "end of file" : p.v) + "”.");
    return p.v;
  };
  Parser.prototype.int = function () {
    var p = this.next();
    if (p.k !== "num" || p.v !== Math.floor(p.v)) fail(p.line, "Expected a whole number but found “" + p.v + "”.");
    return p.v;
  };
  Parser.prototype.skipTo = function (v) {
    var depth = 0;
    while (true) {
      var p = this.next();
      if (p.k === "eof") fail(p.line, "Missing “" + v + "”.");
      if (p.v === v && depth === 0 && p.k !== "str") return;
      if (p.v === "(" || p.v === "[" || p.v === "{") depth++;
      else if (p.v === ")" || p.v === "]" || p.v === "}") depth--;
    }
  };

  // Expressions: + - * / ^ ** unary minus, functions and constants.
  var CONST = { pi: PI, "π": PI, tau: 2 * PI, "τ": 2 * PI, euler: Math.E, "ℇ": Math.E };
  var FUNCS = { sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, ln: Math.log, log: Math.log, sqrt: Math.sqrt,
    asin: Math.asin, acos: Math.acos, atan: Math.atan, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan, abs: Math.abs };
  Parser.prototype.expr = function () { return this.addExpr(); };
  Parser.prototype.addExpr = function () {
    var a = this.mulExpr();
    while (this.is("+") || this.is("-")) { var op = this.next().v; a = { t: "bin", op: op, a: a, b: this.mulExpr() }; }
    return a;
  };
  Parser.prototype.mulExpr = function () {
    var a = this.unary();
    while (this.is("*") || this.is("/") || this.is("%")) { var op = this.next().v; a = { t: "bin", op: op, a: a, b: this.unary() }; }
    return a;
  };
  Parser.prototype.unary = function () {
    if (this.eat("-")) return { t: "neg", a: this.unary() };
    if (this.eat("+")) return this.unary();
    return this.power();
  };
  Parser.prototype.power = function () {
    var a = this.atom();
    if (this.is("^") || this.is("**")) { this.next(); return { t: "bin", op: "^", a: a, b: this.unary() }; }
    return a;
  };
  Parser.prototype.atom = function () {
    var p = this.next();
    if (p.k === "num") return { t: "num", v: p.v };
    if (p.v === "(") { var e = this.expr(); this.expect(")"); return e; }
    if (p.k === "id") {
      if (this.is("(") && FUNCS[p.v]) {
        this.next();
        var arg = this.expr();
        this.expect(")");
        return { t: "call", f: p.v, a: arg, line: p.line };
      }
      return { t: "id", v: p.v, line: p.line };
    }
    fail(p.line, "Unexpected “" + (p.k === "eof" ? "end of file" : p.v) + "” in an expression.");
  };
  function evalExpr(e, env) {
    switch (e.t) {
      case "num": return e.v;
      case "neg": return -evalExpr(e.a, env);
      case "call": return FUNCS[e.f](evalExpr(e.a, env));
      case "id":
        if (env && Object.prototype.hasOwnProperty.call(env, e.v)) return env[e.v];
        if (Object.prototype.hasOwnProperty.call(CONST, e.v)) return CONST[e.v];
        fail(e.line, "Unknown parameter “" + e.v + "”. Bind the circuit's parameters to numbers before exporting it.");
        break;
      default:
        var a = evalExpr(e.a, env), b = evalExpr(e.b, env);
        if (e.op === "+") return a + b;
        if (e.op === "-") return a - b;
        if (e.op === "*") return a * b;
        if (e.op === "/") return a / b;
        if (e.op === "%") return a % b;
        return Math.pow(a, b);
    }
  }

  Parser.prototype.exprList = function () {
    var list = [];
    this.expect("(");
    if (!this.is(")")) {
      list.push(this.expr());
      while (this.eat(",")) list.push(this.expr());
    }
    this.expect(")");
    return list;
  };
  // A qubit argument: name, name[i], name[a:b], or a physical qubit $k.
  Parser.prototype.qarg = function () {
    var p = this.peek();
    var name = this.ident();
    if (this.eat("[")) {
      var lo = this.expr();
      var hi = null;
      if (this.eat(":")) { hi = this.expr(); if (this.eat(":")) { var step = this.expr(); hi = { range: true, hi: hi, step: step }; } }
      this.expect("]");
      return { name: name, idx: lo, hi: hi, line: p.line };
    }
    return { name: name, line: p.line };
  };
  Parser.prototype.qargs = function () {
    var list = [this.qarg()];
    while (this.eat(",")) list.push(this.qarg());
    return list;
  };
  var MODS = { ctrl: 1, negctrl: 1, inv: 1, pow: 1 };
  Parser.prototype.call = function (inDef) {
    var mods = [];
    var start = this.peek();
    while (this.peek().k === "id" && MODS[this.peek().v] && (this.peek(1).v === "@" || this.peek(1).v === "(")) {
      var m = this.next().v, arg = null;
      if (this.is("(")) { this.next(); arg = this.expr(); this.expect(")"); }
      this.expect("@");
      mods.push({ m: m, arg: arg });
    }
    var name = this.ident();
    var params = this.is("(") ? this.exprList() : [];
    var qa = this.is(";") ? [] : this.qargs();
    this.expect(";");
    return { name: name, mods: mods, params: params, qargs: qa, line: start.line };
  };

  /* ---------- program ---------- */
  function parse(text) {
    if (text.length > MAX_TEXT) fail(1, "The file is larger than 5 MB.");
    var P = new Parser(tokenize(text));
    var prog = { version: null, regs: [], regByName: {}, defs: {}, ops: [], measures: 0, resets: 0, warnings: [] };
    var nq = 0;
    function addReg(name, size, line) {
      if (prog.regByName[name]) fail(line, "Register “" + name + "” is declared twice.");
      if (size < 1) fail(line, "Register “" + name + "” has no qubits.");
      var r = { name: name, size: size, start: nq };
      nq += size;
      prog.regs.push(r);
      prog.regByName[name] = r;
    }
    function statement(top) {
      var p = P.peek();
      if (p.k === "eof") return false;
      if (p.v === ";") { P.next(); return true; }
      if (p.v === "{") { P.next(); while (!P.is("}")) { if (P.peek().k === "eof") fail(p.line, "Missing “}”."); statement(false); } P.next(); return true; }
      if (p.k !== "id") fail(p.line, "Unexpected “" + p.v + "”.");
      switch (p.v) {
        case "OPENQASM": P.next(); var vt = P.next(); prog.version = vt.raw || String(vt.v); P.expect(";"); return true;
        case "include": P.next(); P.next(); P.expect(";"); return true;
        case "qreg":
          P.next(); var rn = P.ident(); P.expect("["); var rs = P.int(); P.expect("]"); P.expect(";");
          addReg(rn, rs, p.line); return true;
        case "qubit":
          P.next();
          var qs = 1;
          if (P.eat("[")) { qs = P.int(); P.expect("]"); }
          addReg(P.ident(), qs, p.line); P.expect(";"); return true;
        case "creg": case "bit": case "int": case "uint": case "float": case "angle": case "bool": case "complex":
        case "duration": case "stretch": case "const": case "input": case "output": case "array": case "defcalgrammar":
        case "barrier": case "delay": case "gphase":
          P.skipTo(";"); return true;
        case "gate": parseGate(); return true;
        case "opaque":
          P.next(); var on = P.ident(); var op = [];
          if (P.is("(")) { P.next(); if (!P.is(")")) { op.push(P.ident()); while (P.eat(",")) op.push(P.ident()); } P.expect(")"); }
          var oq = [P.ident()]; while (P.eat(",")) oq.push(P.ident());
          P.expect(";");
          prog.defs[on] = { opaque: true, params: op, qubits: oq, line: p.line };
          return true;
        case "measure":
          P.next(); var mq = P.qargs();
          if (P.eat("->")) P.qargs();
          P.expect(";");
          mq.forEach(function (a) { prog.measures += resolve(a).length; });
          return true;
        case "reset":
          P.next(); var rq = P.qargs(); P.expect(";");
          rq.forEach(function (a) { prog.resets += resolve(a).length; });
          return true;
        case "if":
          P.next(); P.expect("("); P.skipTo(")");
          statement(false);
          if (P.peek().v === "else") { P.next(); statement(false); }
          return true;
        case "for": case "while": case "def": case "box": case "switch": case "extern": case "cal": case "defcal": case "let":
        case "return": case "break": case "continue": case "end":
          fail(p.line, "“" + p.v + "” is not supported here. Export the circuit with loops and subroutines unrolled, as circuit libraries do by default.");
          break;
        default:
          // c[0] = measure q[0];  or  c = measure q;
          var j = 0, depth = 0, isMeasure = false;
          while (true) {
            var tk = P.peek(j);
            if (tk.k === "eof" || (tk.v === ";" && depth === 0)) break;
            if (tk.v === "[" || tk.v === "(") depth++;
            if (tk.v === "]" || tk.v === ")") depth--;
            if (tk.v === "=" && depth === 0 && P.peek(j + 1).v === "measure") { isMeasure = true; break; }
            j++;
          }
          if (isMeasure) {
            while (P.peek().v !== "measure") P.next();
            P.next();
            var mq2 = P.qargs(); P.expect(";");
            mq2.forEach(function (a) { prog.measures += resolve(a).length; });
            return true;
          }
          var c = P.call(false);
          apply(c, null, null, p.line);
          return true;
      }
      return true;
    }
    function parseGate() {
      var g = P.next();
      var name = P.ident();
      var params = [];
      if (P.is("(")) { P.next(); if (!P.is(")")) { params.push(P.ident()); while (P.eat(",")) params.push(P.ident()); } P.expect(")"); }
      var qubits = [P.ident()];
      while (P.eat(",")) qubits.push(P.ident());
      P.expect("{");
      var body = [];
      while (!P.is("}")) {
        var t = P.peek();
        if (t.k === "eof") fail(g.line, "The definition of “" + name + "” is not closed.");
        if (t.v === "barrier" || t.v === "gphase") { P.skipTo(";"); continue; }
        if (t.v === "reset" || t.v === "measure") fail(t.line, "“" + t.v + "” inside a gate definition is not allowed.");
        body.push(P.call(true));
      }
      P.next();
      prog.defs[name] = { params: params, qubits: qubits, body: body, line: g.line };
    }
    // Global qubit indices of one argument.
    function resolve(a, scope) {
      if (scope) {
        if (!Object.prototype.hasOwnProperty.call(scope, a.name)) fail(a.line, "Unknown qubit “" + a.name + "” in a gate definition.");
        return [scope[a.name]];
      }
      if (/^\$\d+$/.test(a.name)) {
        var k = parseInt(a.name.slice(1), 10);
        if (!prog.regByName.$) addPhysical(k); else if (k >= prog.regByName.$.size) growPhysical(k);
        return [prog.regByName.$.start + k];
      }
      var r = prog.regByName[a.name];
      if (!r) fail(a.line, "Unknown register “" + a.name + "”.");
      if (a.idx === undefined) { var all = []; for (var i = 0; i < r.size; i++) all.push(r.start + i); return all; }
      var lo = Math.round(evalExpr(a.idx, null));
      if (a.hi) {
        var hiE = a.hi.range ? a.hi.hi : a.hi, st = a.hi.range ? Math.round(evalExpr(a.hi.step, null)) : 1;
        var hi = Math.round(evalExpr(hiE, null)), out = [];
        for (var q = lo; st > 0 ? q <= hi : q >= hi; q += st) {
          if (q < 0 || q >= r.size) fail(a.line, "Index " + q + " is outside register “" + a.name + "” of size " + r.size + ".");
          out.push(r.start + q);
        }
        return out;
      }
      if (lo < 0) lo += r.size;
      if (lo < 0 || lo >= r.size) fail(a.line, "Index " + lo + " is outside register “" + a.name + "” of size " + r.size + ".");
      return [r.start + lo];
    }
    function addPhysical(k) { addReg("$", k + 1, 0); }
    function growPhysical(k) {
      var r = prog.regByName.$;
      if (r.start + r.size === nq) { nq += k + 1 - r.size; r.size = k + 1; }
      else fail(0, "Physical qubits must not be mixed with registers declared after them.");
    }

    // Apply one call: broadcast over registers, expand definitions, record primitive operations.
    function apply(c, scope, env, line) {
      var vals = c.params.map(function (e) { return evalExpr(e, env); });
      var lists = c.qargs.map(function (a) { return resolve(a, scope); });
      var width = 1;
      lists.forEach(function (l) { if (l.length > 1) { if (width > 1 && l.length !== width) fail(c.line, "Registers of different sizes in one call to “" + c.name + "”."); width = l.length; } });
      for (var w = 0; w < width; w++) {
        var qs = lists.map(function (l) { return l.length > 1 ? l[w] : l[0]; });
        applyOne(c, vals, qs, c.mods, 0);
      }
    }
    function applyOne(c, vals, qs, mods, depth) {
      if (depth > 64) fail(c.line, "Gate definitions nest too deeply around “" + c.name + "”.");
      var ctrls = 0, inv = false, power = 1, powNonInt = false;
      mods.forEach(function (m) {
        if (m.m === "ctrl" || m.m === "negctrl") ctrls += m.arg ? Math.round(evalExpr(m.arg, null)) : 1;
        else if (m.m === "inv") inv = !inv;
        else if (m.m === "pow") { var k = evalExpr(m.arg, null); if (k !== Math.round(k)) powNonInt = true; power *= k; }
      });
      var def = prog.defs[c.name];
      var lib = LIB[c.name];
      if (c.name === "U" || c.name === "CX") def = null;
      if (def && !def.opaque) {
        if (vals.length !== def.params.length) fail(c.line, "“" + c.name + "” takes " + def.params.length + " parameter(s) but got " + vals.length + ".");
        var nT = def.qubits.length;
        if (qs.length !== nT + ctrls) fail(c.line, "“" + c.name + "” acts on " + (nT + ctrls) + " qubit(s) but got " + qs.length + ".");
        var controls = qs.slice(0, ctrls), targets = qs.slice(ctrls);
        var sc = {}, en = {};
        def.qubits.forEach(function (q, i) { sc[q] = targets[i]; });
        def.params.forEach(function (p, i) { en[p] = vals[i]; });
        var reps = powNonInt ? 1 : Math.max(1, Math.abs(Math.round(power)));
        var body = def.body;
        for (var r = 0; r < reps; r++) {
          for (var b = 0; b < body.length; b++) {
            var g = body[b];
            var gv = g.params.map(function (e) { return evalExpr(e, en); });
            var gq = g.qargs.map(function (a) { return resolve(a, sc)[0]; });
            var extra = controls.length ? [{ m: "ctrl", arg: { t: "num", v: controls.length } }] : [];
            if (powNonInt) extra.push({ m: "pow", arg: { t: "num", v: 0.5 } });
            applyOne({ name: g.name, line: c.line }, gv, controls.concat(gq), extra.concat(g.mods), depth + 1);
          }
        }
        return;
      }
      var arity = lib ? lib.q : def ? def.qubits.length : qs.length - ctrls;
      if (lib && vals.length !== lib.p && !(c.name === "u0")) fail(c.line, "“" + c.name + "” takes " + lib.p + " parameter(s) but got " + vals.length + ".");
      if (qs.length !== arity + ctrls) fail(c.line, "“" + c.name + "” acts on " + (arity + ctrls) + " qubit(s) but got " + qs.length + ".");
      for (var a = 0; a < qs.length; a++) for (var b2 = a + 1; b2 < qs.length; b2++) if (qs[a] === qs[b2]) fail(c.line, "“" + c.name + "” uses the same qubit twice.");
      var cliff;
      if (!lib) {
        cliff = false;
        if (prog.warnings.indexOf(c.name) === -1) prog.warnings.push(c.name);
      } else if (powNonInt) {
        cliff = false;
      } else if (lib.m) {
        var U = lib.m(vals);
        if (power !== 1) U = mpow(U, Math.round(power));
        if (inv) U = dag(U);
        cliff = ctrls === 0 ? clifford1(U) : ctrls === 1 ? cliffordCtrl(U) : false;
      } else if (lib.t) {
        var Tm = lib.t(vals);
        if (power !== 1) Tm = mpow(Tm, Math.round(power));
        if (inv) Tm = dag(Tm);
        cliff = ctrls === 0 ? cliffordCtrl(Tm) : false;
      } else if (lib.half) {
        cliff = ctrls === 0 && multipleOf(vals[0] * power, PI / 2);
      } else {
        cliff = ctrls === 0 && lib.cliff === true;
      }
      if (prog.ops.length >= MAX_OPS) fail(c.line, "The circuit has more than " + MAX_OPS.toLocaleString("en-GB") + " gates after expansion.");
      prog.ops.push({ name: c.name, q: qs, cliff: cliff, line: c.line });
    }

    while (statement(true)) { /* next statement */ }
    prog.n = nq;
    return prog;
  }

  /* ---------- analysis ---------- */
  function analyse(text) {
    var prog = parse(String(text || ""));
    if (!prog.n) fail(1, "No qubits are declared (qreg in OpenQASM 2, qubit in OpenQASM 3).");
    var n = prog.n, ops = prog.ops;
    var depthOf = new Array(n);
    for (var i = 0; i < n; i++) depthOf[i] = 0;
    var oneQ = 0, twoQ = 0, multiQ = 0, depth = 0, longRange = 0, firstNon = null;
    var pairs = {}, pairCount = 0;
    var cut = new Array(Math.max(1, n - 1));
    for (var k = 0; k < cut.length; k++) cut[k] = 0;
    var counts = {};
    ops.forEach(function (o) {
      counts[o.name] = (counts[o.name] || 0) + 1;
      var d = 0;
      o.q.forEach(function (q) { if (depthOf[q] > d) d = depthOf[q]; });
      d += 1;
      o.q.forEach(function (q) { depthOf[q] = d; });
      if (d > depth) depth = d;
      if (!o.cliff && !firstNon) firstNon = o;
      if (o.q.length === 1) { oneQ++; return; }
      if (o.q.length === 2) twoQ++; else multiQ++;
      var lo = Math.min.apply(null, o.q), hi = Math.max.apply(null, o.q);
      if (hi - lo > 1 && o.q.length === 2) longRange++;
      // Bits by which the gate can raise the Schmidt rank across a cut it crosses: one for controlled
      // gates and two-qubit rotations (operator Schmidt rank 2), two for swap-like or unknown gates.
      var w = WIDE[o.name] || !LIB[o.name] ? 2 : 1;
      for (var c = lo; c < hi; c++) cut[c] += w;
      for (var a = 0; a < o.q.length; a++) for (var b = a + 1; b < o.q.length; b++) {
        var x = Math.min(o.q[a], o.q[b]), y = Math.max(o.q[a], o.q[b]), key = x * 1048576 + y;
        if (!pairs[key]) { pairs[key] = 1; pairCount++; }
      }
    });
    var maxCut = n > 1 ? Math.max.apply(null, cut) : 0;
    var allPairs = n * (n - 1) / 2;
    var pairFraction = allPairs ? pairCount / allPairs : 0;
    var longFraction = twoQ ? longRange / twoQ : 0;
    var clifford = ops.length > 0 && !firstNon;
    var cls, reasons = [];
    if (!ops.length) {
      cls = "lowent";
      reasons.push("The file has no gates, so the state stays a product state.");
    } else if (clifford) {
      cls = "clifford";
      reasons.push("Every gate is a Clifford gate (an exact test on the gate matrices, angles included), so stabiliser simulation applies.");
    } else if (twoQ + multiQ === 0) {
      cls = "lowent";
      reasons.push("No gate acts on two qubits, so the state stays a product state.");
    } else if (maxCut <= 2) {
      cls = "lowent";
      reasons.push("The gates that cross any cut of the qubit chain can raise its Schmidt rank to at most " + Math.pow(2, maxCut) + ", so the entanglement stays bounded, as in GHZ and the one-layer HEA.");
    } else if (pairFraction >= 0.5 && n >= 4) {
      cls = "dense";
      reasons.push(Math.round(pairFraction * 100) + " % of all qubit pairs share a gate, close to the all-to-all coupling of the QFT.");
    } else if (longFraction > 0.5) {
      cls = "dense";
      reasons.push(Math.round(longFraction * 100) + " % of the two-qubit gates join qubits that are not neighbours in the register, so the entanglement does not stay local.");
    } else {
      cls = "deep";
      reasons.push("Most two-qubit gates join neighbouring qubits, but the gates that cross the busiest cut of the qubit chain can raise its Schmidt rank up to 2^" + maxCut + ", so the entanglement can build up with depth, as in the HEA.");
    }
    if (!clifford && firstNon) reasons.push("The first non-Clifford gate is “" + firstNon.name + "” on line " + firstNon.line + ".");
    var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 6).map(function (g) { return g + " ×" + counts[g]; });
    return {
      version: prog.version, n: n, registers: prog.regs.map(function (r) { return { name: r.name, size: r.size }; }),
      gates: ops.length, oneQ: oneQ, twoQ: twoQ, multiQ: multiQ, depth: depth, measures: prog.measures, resets: prog.resets,
      clifford: clifford, firstNonClifford: firstNon ? { name: firstNon.name, line: firstNon.line } : null,
      pairFraction: pairFraction, maxCut: maxCut, longFraction: longFraction, gateCounts: top,
      cls: cls, reasons: reasons,
      unknownGates: prog.warnings.slice()
    };
  }

  /* ---------- examples (OpenQASM 2) ---------- */
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function example(kind, n) {
    n = Math.max(2, Math.min(64, n | 0));
    var L = ["OPENQASM 2.0;", "include \"qelib1.inc\";", "qreg q[" + n + "];"];
    var i, j, l;
    if (kind === "qft") {
      L.splice(0, 0, "// Quantum Fourier transform on " + n + " qubits");
      for (j = 0; j < n; j++) {
        L.push("h q[" + j + "];");
        for (var k = j + 1; k < n; k++) L.push("cp(pi/" + Math.pow(2, k - j) + ") q[" + k + "],q[" + j + "];");
      }
      for (j = 0; j < Math.floor(n / 2); j++) L.push("swap q[" + j + "],q[" + (n - 1 - j) + "];");
    } else if (kind === "ghz") {
      L.splice(0, 0, "// GHZ state preparation on " + n + " qubits");
      L.push("creg c[" + n + "];", "h q[0];");
      for (i = 0; i + 1 < n; i++) L.push("cx q[" + i + "],q[" + (i + 1) + "];");
      L.push("measure q -> c;");
    } else if (kind === "clifford") {
      L.splice(0, 0, "// Ten layers of random one-qubit Clifford gates and CNOT stages on " + n + " qubits");
      var r = rng(7), G = ["h", "s", "sdg", "x", "y", "z"];
      for (l = 0; l < 10; l++) {
        for (i = 0; i < n; i++) L.push(G[Math.floor(r() * 6)] + " q[" + i + "];");
        for (i = 0; i + 1 < n; i += 2) L.push("cx q[" + i + "],q[" + (i + 1) + "];");
        for (i = 1; i + 1 < n; i += 2) L.push("cx q[" + i + "],q[" + (i + 1) + "];");
      }
    } else {
      L.splice(0, 0, "// Hardware-efficient ansatz with eight CNOT rings on " + n + " qubits");
      var ra = rng(11);
      var ang = function () { return (ra() * 2 * Math.PI).toFixed(6); };
      for (i = 0; i < n; i++) L.push("rz(" + ang() + ") q[" + i + "];", "rx(" + ang() + ") q[" + i + "];");
      for (l = 0; l < 8; l++) {
        for (i = 0; i < n; i++) L.push("cx q[" + i + "],q[" + ((i + 1) % n) + "];");
        if (l < 7) for (i = 0; i < n; i++) L.push("rz(" + ang() + ") q[" + i + "];", "rx(" + ang() + ") q[" + i + "];", "rz(" + ang() + ") q[" + i + "];");
      }
      for (i = 0; i < n; i++) L.push("rx(" + ang() + ") q[" + i + "];", "rz(" + ang() + ") q[" + i + "];");
    }
    return L.join("\n") + "\n";
  }

  window.QASM = { analyse: analyse, example: example, parse: parse, _clifford1: clifford1, _cliffordCtrl: cliffordCtrl };
})();
