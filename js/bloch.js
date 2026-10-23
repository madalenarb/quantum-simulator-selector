/*
 * Decorative Bloch sphere. The state vector precesses on the equator while the query is
 * undecided, tilts towards |0> as questions are answered, and collapses onto the pole with
 * a pulse when a recommendation is measured.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("bloch");
  if (!canvas || !canvas.getContext) {
    window.Bloch = { set: function () {} };
    return;
  }
  var ctx = canvas.getContext("2d");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var css = getComputedStyle(document.documentElement);
  var GOLD = css.getPropertyValue("--gold").trim() || "#e6b566";
  var ICE = css.getPropertyValue("--ice").trim() || "#86d4f0";
  var FAINT = css.getPropertyValue("--faint").trim() || "#5f6c86";

  var TILT = 0.32;
  var state = { theta: Math.PI / 2, phi: 0.6, target: Math.PI / 2, pulse: 0, done: false };
  var size = 220, dpr = 1;

  function resize() {
    var rect = canvas.getBoundingClientRect();
    size = Math.max(120, Math.round(rect.width || 220));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
  }

  function project(x, y, z, r) {
    // Rotate about the x axis by TILT so the equator reads as an ellipse.
    var yy = y * Math.cos(TILT) - z * Math.sin(TILT);
    var zz = y * Math.sin(TILT) + z * Math.cos(TILT);
    return { x: x * r, y: -zz * r, depth: yy };
  }

  function rgba(hex, a) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var v = parseInt(h, 16);
    return "rgba(" + ((v >> 16) & 255) + "," + ((v >> 8) & 255) + "," + (v & 255) + "," + a + ")";
  }

  function ellipse(cx, cy, rx, ry, rot, style, width) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(rx, 0.01), Math.max(ry, 0.01), rot || 0, 0, Math.PI * 2);
    ctx.strokeStyle = style;
    ctx.lineWidth = width || 1;
    ctx.stroke();
  }

  function draw() {
    var w = size, cx = w / 2, cy = w / 2, r = w * 0.36;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, w);

    // halo
    var g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.35);
    g.addColorStop(0, rgba(ICE, 0.08));
    g.addColorStop(1, rgba(ICE, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2); ctx.fill();

    // sphere, equator and two meridians
    ellipse(cx, cy, r, r, 0, rgba(ICE, 0.4), 1.2);
    ellipse(cx, cy, r, r * Math.sin(TILT), 0, rgba(ICE, 0.28), 1);
    for (var k = 0; k < 3; k++) {
      var a = state.phi * 0.35 + k * Math.PI / 3;
      ellipse(cx, cy, r * Math.abs(Math.cos(a)), r * Math.cos(TILT), 0, rgba(ICE, 0.1), 1);
    }

    // z axis
    var top = project(0, 0, 1, r), bot = project(0, 0, -1, r);
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(cx + top.x, cy + top.y); ctx.lineTo(cx + bot.x, cy + bot.y);
    ctx.strokeStyle = rgba(ICE, 0.25); ctx.lineWidth = 1; ctx.stroke();
    ctx.setLineDash([]);

    // labels
    ctx.font = "12px " + (css.getPropertyValue("--f-mono") || "monospace");
    ctx.fillStyle = FAINT;
    ctx.textAlign = "center";
    ctx.fillText("|0⟩", cx + top.x, cy + top.y - 10);
    ctx.fillText("|1⟩", cx + bot.x, cy + bot.y + 20);

    // state vector
    var s = project(Math.sin(state.theta) * Math.cos(state.phi), Math.sin(state.theta) * Math.sin(state.phi), Math.cos(state.theta), r);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + s.x, cy + s.y);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke();
    ctx.save();
    ctx.shadowColor = GOLD; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(cx + s.x, cy + s.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = GOLD; ctx.fill();
    ctx.restore();

    // collapse pulse, an expanding shell that stays inside the canvas
    if (state.pulse > 0) {
      var p = 1 - state.pulse;
      ctx.beginPath(); ctx.arc(cx, cy, r * (0.3 + p * 1.0), 0, Math.PI * 2);
      ctx.strokeStyle = rgba(GOLD, state.pulse * 0.7); ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  function tick() {
    if (!state.done) state.phi += 0.012;
    state.theta += (state.target - state.theta) * 0.06;
    if (state.pulse > 0) state.pulse = Math.max(0, state.pulse - 0.018);
    draw();
    requestAnimationFrame(tick);
  }

  window.Bloch = {
    // progress in [0, 1]; done collapses the vector onto |0>
    set: function (progress, done, animate) {
      var wasDone = state.done;
      state.done = !!done;
      state.target = done ? 0.0001 : (Math.PI / 2) * (1 - 0.55 * Math.max(0, Math.min(1, progress)));
      if (done && !wasDone && animate) state.pulse = 1;
      if (!animate && done) state.theta = state.target;
      if (reduce) {
        state.theta = state.target;
        state.pulse = 0;
        draw();
      }
    }
  };

  resize();
  window.addEventListener("resize", function () { resize(); draw(); });
  draw();
  if (!reduce) requestAnimationFrame(tick);
})();
