/*
 * Bloch spheres. Bloch.create(canvas) returns a sphere whose state vector precesses while a
 * query is open, tilts towards |0> as questions are answered, spins up while the result is
 * computed, and collapses onto the pole with a pulse when the outcome is read out.
 */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var css = getComputedStyle(document.documentElement);
  var GOLD = css.getPropertyValue("--gold").trim() || "#e6b566";
  var ICE = css.getPropertyValue("--ice").trim() || "#86d4f0";
  var FAINT = css.getPropertyValue("--faint").trim() || "#5f6c86";
  var MONO = css.getPropertyValue("--f-mono").trim() || "monospace";
  var TILT = 0.32;

  function noop() {}

  function rgba(hex, a) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var v = parseInt(h, 16);
    return "rgba(" + ((v >> 16) & 255) + "," + ((v >> 8) & 255) + "," + (v & 255) + "," + a + ")";
  }

  function create(canvas, options) {
    options = options || {};
    if (!canvas || !canvas.getContext) {
      return { set: noop, spin: noop, collapse: noop, reset: noop, resize: noop };
    }
    var ctx = canvas.getContext("2d");
    var baseSpeed = options.speed || 0.012;
    var state = { theta: Math.PI / 2, phi: 0.6, target: Math.PI / 2, pulse: 0, done: false, speed: baseSpeed };
    var size = 220, dpr = 1;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      size = Math.max(120, Math.round(rect.width));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
    }

    function project(x, y, z, r) {
      var zz = y * Math.sin(TILT) + z * Math.cos(TILT);
      return { x: x * r, y: -zz * r };
    }

    function ellipse(cx, cy, rx, ry, style, width) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(rx, 0.01), Math.max(ry, 0.01), 0, 0, Math.PI * 2);
      ctx.strokeStyle = style;
      ctx.lineWidth = width || 1;
      ctx.stroke();
    }

    function draw() {
      var w = size, cx = w / 2, cy = w / 2, r = w * 0.36;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, w);

      var g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.35);
      g.addColorStop(0, rgba(ICE, 0.08));
      g.addColorStop(1, rgba(ICE, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2); ctx.fill();

      ellipse(cx, cy, r, r, rgba(ICE, 0.4), 1.2);
      ellipse(cx, cy, r, r * Math.sin(TILT), rgba(ICE, 0.28), 1);
      for (var k = 0; k < 3; k++) {
        var a = state.phi * 0.35 + k * Math.PI / 3;
        ellipse(cx, cy, r * Math.abs(Math.cos(a)), r * Math.cos(TILT), rgba(ICE, 0.1), 1);
      }

      var top = project(0, 0, 1, r), bot = project(0, 0, -1, r);
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(cx + top.x, cy + top.y); ctx.lineTo(cx + bot.x, cy + bot.y);
      ctx.strokeStyle = rgba(ICE, 0.25); ctx.lineWidth = 1; ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = Math.round(w / 18) + "px " + MONO;
      ctx.fillStyle = FAINT;
      ctx.textAlign = "center";
      ctx.fillText("|0⟩", cx + top.x, cy + top.y - 10);
      ctx.fillText("|1⟩", cx + bot.x, cy + bot.y + 20);

      var s = project(Math.sin(state.theta) * Math.cos(state.phi), Math.sin(state.theta) * Math.sin(state.phi), Math.cos(state.theta), r);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + s.x, cy + s.y);
      ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke();
      ctx.save();
      ctx.shadowColor = GOLD; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(cx + s.x, cy + s.y, Math.max(4, w / 48), 0, Math.PI * 2);
      ctx.fillStyle = GOLD; ctx.fill();
      ctx.restore();

      if (state.pulse > 0) {
        var p = 1 - state.pulse;
        ctx.beginPath(); ctx.arc(cx, cy, r * (0.3 + p * 1.0), 0, Math.PI * 2);
        ctx.strokeStyle = rgba(GOLD, state.pulse * 0.7); ctx.lineWidth = 1.5; ctx.stroke();
      }
    }

    function tick() {
      if (canvas.offsetParent !== null) {
        if (!state.done) state.phi += state.speed;
        state.theta += (state.target - state.theta) * 0.07;
        if (state.pulse > 0) state.pulse = Math.max(0, state.pulse - 0.018);
        draw();
      }
      requestAnimationFrame(tick);
    }

    function settle() { if (reduce) { state.theta = state.target; state.pulse = 0; draw(); } }

    resize();
    window.addEventListener("resize", function () { resize(); draw(); });
    draw();
    if (!reduce) requestAnimationFrame(tick);

    return {
      // progress in [0, 1]; done collapses the vector onto |0>
      set: function (progress, done, animate) {
        var wasDone = state.done;
        state.done = !!done;
        state.speed = baseSpeed;
        state.target = done ? 0.0001 : (Math.PI / 2) * (1 - 0.55 * Math.max(0, Math.min(1, progress)));
        if (done && !wasDone && animate) state.pulse = 1;
        if (!animate && done) state.theta = state.target;
        settle();
      },
      spin: function (speed) {
        state.done = false;
        state.speed = speed || baseSpeed * 6;
        state.target = Math.PI / 2;
        settle();
      },
      collapse: function () {
        state.done = true;
        state.speed = baseSpeed;
        state.target = 0.0001;
        state.pulse = 1;
        settle();
      },
      reset: function () {
        state.theta = Math.PI / 2; state.target = Math.PI / 2; state.done = false; state.pulse = 0; state.speed = baseSpeed;
        draw();
      },
      resize: function () { resize(); draw(); }
    };
  }

  window.Bloch = { create: create };
})();
