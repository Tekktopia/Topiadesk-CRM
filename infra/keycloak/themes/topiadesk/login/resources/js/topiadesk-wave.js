function initTopiaDeskWave() {
  "use strict";

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  var canvas = document.createElement("canvas");
  canvas.id = "topiadesk-wave-canvas";
  document.body.insertBefore(canvas, document.body.firstChild);
  var ctx = canvas.getContext("2d");

  var ORANGE = [245, 144, 30];
  var BLUE = [20, 123, 198];

  var dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  var width = 0;
  var height = 0;
  var strandGradient = null;

  function buildGradient() {
    var gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "rgb(" + ORANGE.join(",") + ")");
    gradient.addColorStop(
      0.5,
      "rgb(" +
        Math.round((ORANGE[0] + BLUE[0]) / 2) +
        "," +
        Math.round((ORANGE[1] + BLUE[1]) / 2) +
        "," +
        Math.round((ORANGE[2] + BLUE[2]) / 2) +
        ")"
    );
    gradient.addColorStop(1, "rgb(" + BLUE.join(",") + ")");
    return gradient;
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    strandGradient = buildGradient(); // only depends on width, so only rebuilt on resize
  }
  window.addEventListener("resize", resize);
  resize();

  // A dense woven mesh of thin near-parallel threads (not a handful of
  // isolated strokes) — each thread shares the group's base frequency but
  // carries a small, steadily-incrementing phase offset from the next,
  // which is what produces the flowing "ribbon of fabric" interference
  // look rather than a stack of obviously separate sine lines. Two bright
  // "spine" threads are layered on top with full brightness, matching the
  // single dominant bright streak in the reference.
  var strands = [];
  var MESH_COUNT = 46;
  for (var m = 0; m < MESH_COUNT; m++) {
    var t0 = m / (MESH_COUNT - 1); // 0..1 across the mesh
    strands.push({
      baseY: 0.5 + (t0 - 0.5) * 0.05,
      amp: 0.05 + Math.sin(t0 * Math.PI) * 0.16 + (m % 5) * 0.006,
      freq: 1.35 + t0 * 0.5,
      speed: 0.00026 + (m % 3) * 0.00002,
      phase: t0 * Math.PI * 3.2,
      width: 0.8,
      alpha: 0.05 + Math.sin(t0 * Math.PI) * 0.09,
    });
  }
  // Bright spine threads, drawn last so they sit on top of the mesh.
  strands.push({ baseY: 0.5, amp: 0.17, freq: 1.5, speed: 0.00027, phase: 0, width: 2.2, alpha: 0.9, spine: true });
  strands.push({ baseY: 0.5, amp: 0.14, freq: 1.5, speed: 0.00027, phase: 0.35, width: 1.3, alpha: 0.5, spine: true });

  function waveY(strand, xNorm, t) {
    var mesh = Math.sin(xNorm * Math.PI * 2 * strand.freq + t * strand.speed + strand.phase);
    var envelope = Math.sin(xNorm * Math.PI); // fades the wave in/out at the screen edges
    return strand.baseY * height + mesh * strand.amp * height * envelope;
  }

  // Traces the strand through quadratic-curve midpoints instead of straight
  // segments — a standard smoothing trick that turns a polyline into a
  // silky continuous curve without needing many more sample points.
  function tracePath(strand, t, steps) {
    var pts = [];
    for (var i = 0; i <= steps; i++) {
      var xNorm = i / steps;
      pts.push([xNorm * width, waveY(strand, xNorm, t)]);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var j = 1; j < pts.length - 1; j++) {
      var mx = (pts[j][0] + pts[j + 1][0]) / 2;
      var my = (pts[j][1] + pts[j + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[j][0], pts[j][1], mx, my);
    }
    var last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
  }

  function drawStrand(strand, t) {
    // Faint mesh threads don't need dense sampling to look smooth; only
    // the bright spine threads get the finer step count.
    var steps = strand.spine ? Math.max(80, Math.floor(width / 6)) : Math.max(30, Math.floor(width / 24));

    ctx.strokeStyle = strandGradient;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (strand.spine) {
      // Layered neon-tube glow: a wide soft halo, a medium halo, then a
      // crisp bright core — three passes over the same smooth path.
      var passes = [
        { widthMul: 5, blur: 22, alpha: strand.alpha * 0.22 },
        { widthMul: 2.4, blur: 10, alpha: strand.alpha * 0.45 },
        { widthMul: 1, blur: 2, alpha: strand.alpha },
      ];
      for (var p = 0; p < passes.length; p++) {
        tracePath(strand, t, steps);
        ctx.globalAlpha = passes[p].alpha;
        ctx.lineWidth = strand.width * passes[p].widthMul;
        ctx.shadowColor = "rgba(150, 190, 230, 0.55)";
        ctx.shadowBlur = passes[p].blur;
        ctx.stroke();
      }
    } else {
      tracePath(strand, t, steps);
      ctx.globalAlpha = strand.alpha;
      ctx.lineWidth = strand.width;
      ctx.shadowColor = "rgba(120, 170, 220, 0.35)";
      ctx.shadowBlur = 1.5;
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  // Particles drift slowly upward near the hero strand and twinkle, then
  // respawn — echoes the reference's ambient dust without being literal.
  var particles = [];
  var PARTICLE_COUNT = 46;
  function spawnParticle(seedX) {
    return {
      x: seedX !== undefined ? seedX : Math.random() * width,
      y: Math.random() * height,
      r: 0.6 + Math.random() * 1.6,
      speed: 6 + Math.random() * 14,
      drift: (Math.random() - 0.5) * 6,
      phase: Math.random() * Math.PI * 2,
      hue: Math.random() < 0.5 ? ORANGE : BLUE,
      life: 0,
      maxLife: 6000 + Math.random() * 6000,
    };
  }
  for (var p = 0; p < PARTICLE_COUNT; p++) {
    particles.push(spawnParticle());
  }

  function drawParticles(dt) {
    for (var i = 0; i < particles.length; i++) {
      var particle = particles[i];
      particle.life += dt;
      particle.y -= (particle.speed * dt) / 1000;
      particle.x += (particle.drift * dt) / 1000;

      var lifeRatio = particle.life / particle.maxLife;
      var fade = Math.sin(Math.min(1, lifeRatio) * Math.PI);
      var alpha = Math.max(0, fade) * 0.55;

      if (particle.life >= particle.maxLife || particle.y < -10 || particle.x < -10 || particle.x > width + 10) {
        particles[i] = spawnParticle(Math.random() * width);
        particles[i].y = height + 10;
        continue;
      }

      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + particle.hue.join(",") + "," + alpha + ")";
      ctx.shadowColor = "rgba(" + particle.hue.join(",") + ",0.6)";
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  var lastTime = null;
  function frame(now) {
    if (lastTime === null) lastTime = now;
    var dt = now - lastTime;
    lastTime = now;

    ctx.clearRect(0, 0, width, height);

    for (var i = 0; i < strands.length; i++) {
      drawStrand(strands[i], now);
    }
    drawParticles(dt);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Keycloak's template renders the brand header as a sibling *before*
// <main>, not inside the card — moved here at runtime so the logo reads
// as part of one composed card instead of a separate floating element.
// Independently gated from the wave init so a failure in one can't take
// down the other.
function nestTopiaDeskBrandHeader() {
  "use strict";
  var header = document.getElementById("kc-header");
  var main = document.querySelector(".pf-v5-c-login__main");
  if (!header || !main) return;
  main.insertBefore(header, main.firstChild);
}

function initTopiaDeskTheme() {
  "use strict";
  nestTopiaDeskBrandHeader();
  initTopiaDeskWave();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTopiaDeskTheme);
} else {
  initTopiaDeskTheme();
}
