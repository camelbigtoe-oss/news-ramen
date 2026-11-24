// News Ramen — pixel-art sky for the Briefing header.
// Drawn at 1/4 resolution and scaled up with crisp pixels. The sky follows the
// real sunrise/sunset in Christchurch, the sun and moon move across it, and the
// current weather adds clouds, rain, snow, fog or lightning over hills and a
// little city skyline whose windows light up at night.

const PX = 4; // one art pixel = 4 CSS pixels
const MIN = 60e3;

// ---------------------------------------------------------------- colour helpers
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const P = {
  nightTop: hex('#070d24'), nightBot: hex('#1b2a5c'),
  duskTop: hex('#2b2d6e'), duskMid: hex('#c0567a'), duskBot: hex('#ff9e6b'),
  dayTop: hex('#2f7fd8'), dayBot: hex('#a6d7ff'),
  greyDayTop: hex('#6d7a8c'), greyDayBot: hex('#a9b3c0'),
  greyNightTop: hex('#151a28'), greyNightBot: hex('#2b3346'),
};
// Seeded random so the skyline and stars stay put between frames.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
}

// ---------------------------------------------------------------- weather → scene
function sceneFrom(w, now) {
  const q = new URLSearchParams(location.search);
  let code = w?.code ?? 2;
  let cloud = w?.cloud ?? 40;
  let wind = w?.wind ?? 10;
  // Test hooks: ?sky=61&hour=21 shows rain at 9pm.
  if (q.get('sky')) { code = +q.get('sky'); cloud = code >= 3 ? 95 : code * 30; }
  if (q.get('wind')) wind = +q.get('wind');
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  if (q.get('hour')) now = dayStart.getTime() + (+q.get('hour')) * 60 * MIN;
  const sr = w?.sunrise?.[0] ?? dayStart.getTime() + 6 * 60 * MIN;
  const ss = w?.sunset?.[0] ?? dayStart.getTime() + 20.5 * 60 * MIN;
  const srNext = w?.sunrise?.[1] ?? sr + 24 * 60 * MIN;
  const rain = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code);
  const snow = [71, 73, 75, 77, 85, 86].includes(code);
  const storm = code >= 95;
  const fog = code === 45 || code === 48;
  const intensity = { 51: 0.3, 53: 0.45, 55: 0.6, 61: 0.5, 63: 0.75, 65: 1, 80: 0.6, 81: 0.8, 82: 1, 71: 0.4, 73: 0.7, 75: 1, 95: 1, 96: 1, 99: 1 }[code] || 0.5;
  // 0 = night, 1 = full day; twilight blends over ~50 minutes either side.
  const tw = 50 * MIN;
  const light = clamp01(Math.min((now - (sr - tw)) / (2 * tw), ((ss + tw) - now) / (2 * tw)));
  const golden = Math.max(0, 1 - Math.min(Math.abs(now - sr), Math.abs(now - ss)) / (70 * MIN)); // dawn/dusk glow
  const day = now >= sr && now <= ss;
  let arc; // position of sun (day) or moon (night) along its path, 0..1
  if (day) arc = (now - sr) / (ss - sr);
  else if (now > ss) arc = (now - ss) / (srNext - ss);
  else arc = (now - (sr - (srNext - ss))) / (srNext - ss);
  const overcast = clamp01((cloud - 30) / 60) * (rain || snow || storm || fog || code === 3 ? 1 : 0.7);
  return { code, cloud, wind, rain, snow, storm, fog, intensity, light, golden, day, arc: clamp01(arc), overcast, now };
}

// Moon phase 0..1 (0 = new, 0.5 = full) from a known new moon.
function moonPhase(t) {
  const syn = 29.530588853 * 24 * 60 * MIN;
  return (((t - Date.UTC(2000, 0, 6, 18, 14)) % syn) + syn) % syn / syn;
}

// ---------------------------------------------------------------- scenery (built once per size)
function buildScenery(W, H) {
  const r = rng(W * 7919 + H);
  const horizon = Math.round(H * 0.68);
  // Port Hills style ridge: a few layered sines.
  const hills = [];
  const ph = r() * 10;
  for (let x = 0; x < W; x++) {
    const y = horizon - 6 - Math.sin(x / 23 + ph) * 4 - Math.sin(x / 9 + ph * 2) * 1.5 - Math.sin(x / 51) * 5;
    hills.push(Math.round(y));
  }
  // City skyline along the bottom, with a little spire and a crane.
  const buildings = [];
  let x = 0;
  while (x < W) {
    const w = 4 + Math.floor(r() * 7);
    const h = 4 + Math.floor(r() * (H * 0.2));
    buildings.push({ x, w, h, windows: [] });
    x += w + (r() < 0.3 ? 1 : 0);
  }
  for (const b of buildings) {
    for (let wy = 2; wy < b.h - 1; wy += 2) for (let wx = 1; wx < b.w - 1; wx += 2) {
      if (r() < 0.55) b.windows.push({ x: b.x + wx, y: wy, on: r(), flick: r() });
    }
  }
  const spire = Math.floor(W * (0.3 + r() * 0.4));
  const crane = Math.floor(W * (0.1 + r() * 0.15));
  const stars = Array.from({ length: Math.floor(W * H / 55) }, () => ({ x: Math.floor(r() * W), y: Math.floor(r() * horizon * 0.85), p: r() * 6.28, b: r() }));
  const clouds = Array.from({ length: 9 }, (_, i) => ({ x: r() * W, y: 3 + r() * horizon * 0.45, w: 12 + Math.floor(r() * 18), seed: i * 97 + 13, sp: 0.6 + r() * 0.8 }));
  const drops = Array.from({ length: 160 }, () => ({ x: r() * W, y: r() * H, s: 0.7 + r() * 0.6 }));
  return { horizon, hills, buildings, spire, crane, stars, clouds, drops, groundY: H - 3 };
}

// ---------------------------------------------------------------- drawing
function px(ctx, x, y, w = 1, h = 1) { ctx.fillRect(Math.round(x), Math.round(y), w, h); }
function disc(ctx, cx, cy, rad) {
  for (let y = -rad; y <= rad; y++) {
    const half = Math.floor(Math.sqrt(rad * rad - y * y) + 0.35);
    px(ctx, cx - half, cy + y, half * 2 + 1, 1);
  }
}
function cloudShape(ctx, c, W, col, shade) {
  const r = rng(c.seed);
  const puffs = [];
  for (let i = 0; i < 4; i++) puffs.push({ dx: (i / 3) * c.w - c.w / 2 + (r() - 0.5) * 3, dy: (r() - 0.5) * 2, rad: 2 + Math.floor(r() * (c.w / 5)) });
  for (const pass of [shade, col]) {
    ctx.fillStyle = pass;
    const off = pass === shade ? 1 : 0;
    for (const p of puffs) {
      let x = c.x + p.dx;
      x = ((x % (W + 40)) + W + 40) % (W + 40) - 20;
      disc(ctx, x, c.y + p.dy + off, p.rad);
    }
  }
}

function draw(ctx, W, H, sc, s, t) {
  const L = s.light;
  const G = s.golden * (1 - s.overcast * 0.7);
  // Sky gradient in pixel bands.
  const topDay = mix(P.dayTop, P.greyDayTop, s.overcast), botDay = mix(P.dayBot, P.greyDayBot, s.overcast);
  const topN = mix(P.nightTop, P.greyNightTop, s.overcast), botN = mix(P.nightBot, P.greyNightBot, s.overcast);
  for (let y = 0; y < sc.horizon + 2; y += 2) {
    const f = y / sc.horizon;
    let c = mix(mix(topN, botN, f), mix(topDay, botDay, f), L);
    if (G > 0) c = mix(c, f < 0.5 ? mix(P.duskTop, P.duskMid, f * 2) : mix(P.duskMid, P.duskBot, (f - 0.5) * 2), G * 0.75);
    if (s.storm) c = mix(c, [40, 44, 58], 0.45);
    ctx.fillStyle = css(c);
    px(ctx, 0, y, W, 2);
  }
  // Stars.
  const starA = clamp01(1 - L * 2.2) * (1 - s.overcast);
  if (starA > 0.02) {
    for (const st of sc.stars) {
      const tw = 0.5 + 0.5 * Math.sin(t / 700 + st.p);
      ctx.fillStyle = css([230, 236, 255], starA * (0.35 + 0.65 * tw * st.b));
      px(ctx, st.x, st.y);
    }
  }
  // Sun or moon on an arc over the hills.
  const ax = 10 + s.arc * (W - 20);
  const ay = sc.horizon - 4 - Math.sin(Math.PI * s.arc) * (sc.horizon - 12);
  if (s.day) {
    const low = 1 - Math.sin(Math.PI * s.arc);
    const glow = mix(hex('#fff6c2'), hex('#ffb070'), low);
    ctx.fillStyle = css(glow, 0.18 * (1 - s.overcast)); disc(ctx, ax, ay, 8);
    ctx.fillStyle = css(glow, 0.95 * (1 - s.overcast * 0.85)); disc(ctx, ax, ay, 4);
    ctx.fillStyle = css(hex('#fffbe6'), 0.9 * (1 - s.overcast * 0.85)); disc(ctx, ax - 1, ay - 1, 1);
  } else {
    const ph = moonPhase(s.now);
    const a = 1 - s.overcast * 0.8;
    ctx.fillStyle = css([220, 228, 255], 0.12 * a); disc(ctx, ax, ay, 7);
    ctx.fillStyle = css([232, 236, 250], a); disc(ctx, ax, ay, 4);
    // Shadow side for the phase: shift a sky-coloured disc across the moon.
    const shift = Math.round((ph < 0.5 ? 1 - ph * 2 : (ph - 0.5) * 2) * 9) * (ph < 0.5 ? 1 : -1);
    if (Math.abs(shift) < 9) {
      ctx.fillStyle = css(mix(P.nightTop, P.nightBot, ay / sc.horizon), a);
      disc(ctx, ax - shift, ay, 4);
    }
    ctx.fillStyle = css([190, 198, 225], a * 0.8); px(ctx, ax + 1, ay + 1); px(ctx, ax - 2, ay - 1);
  }
  // Clouds.
  const nClouds = s.storm || s.rain || s.snow ? 9 : Math.round(clamp01(s.cloud / 100) * 8);
  const dark = s.storm ? 0.7 : s.rain || s.snow ? 0.4 : s.overcast * 0.25;
  const cDay = mix(hex('#f6f9ff'), hex('#7d8796'), dark), cNight = mix(hex('#3a4566'), hex('#222838'), dark);
  let cc = mix(cNight, cDay, L);
  if (G > 0) cc = mix(cc, hex('#f4a4a0'), G * 0.45);
  const shade = mix(cc, [20, 24, 40], 0.25);
  const drift = (s.wind / 20) * 0.004;
  for (let i = 0; i < nClouds; i++) {
    const c = sc.clouds[i];
    cloudShape(ctx, { ...c, x: c.x + t * drift * c.sp }, W, css(cc, 0.95), css(shade, 0.95));
  }
  // Hills.
  const hillDay = mix(hex('#4f7a55'), hex('#5d6a64'), s.overcast);
  let hc = mix(hex('#141f3d'), hillDay, L);
  if (G > 0) hc = mix(hc, hex('#6b4a63'), G * 0.4);
  ctx.fillStyle = css(hc);
  sc.hills.forEach((y, x) => px(ctx, x, y, 1, H - y));
  // Fog sits over the hills.
  if (s.fog) {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = css(mix([150, 160, 180], [220, 226, 235], L), 0.22);
      const fy = sc.horizon - 14 + i * 5;
      const off = (t / (90 + i * 30)) % W;
      px(ctx, -off, fy, W * 0.7, 3); px(ctx, W * 0.7 + 10 - off, fy, W * 0.7, 3); px(ctx, W * 1.4 + 20 - off, fy, W * 0.7, 3);
    }
  }
  // City skyline.
  const bc = mix(hex('#0c1430'), mix(hex('#3a4a66'), hex('#55606f'), s.overcast), L * 0.85);
  ctx.fillStyle = css(bc);
  for (const b of sc.buildings) px(ctx, b.x, H - b.h, b.w, b.h);
  // Spire and crane silhouettes.
  const sx = sc.spire;
  const base = H - 10;
  px(ctx, sx - 2, base - 6, 5, 16); px(ctx, sx - 1, base - 10, 3, 4); px(ctx, sx, base - 16, 1, 6);
  const cx = sc.crane;
  px(ctx, cx, H - 26, 1, 26); px(ctx, cx - 6, H - 26, 20, 1); px(ctx, cx + 11, H - 26, 1, 6);
  // Windows: warm at night, pale blue by day; a few flicker.
  const night = 1 - L;
  for (const b of sc.buildings) {
    for (const w of b.windows) {
      const lit = w.on < 0.25 + night * 0.5 && !(w.flick > 0.97 && Math.sin(t / 300 + w.x) > 0.6);
      if (night > 0.35 && lit) ctx.fillStyle = css(hex('#ffd98a'), 0.6 + night * 0.4);
      else if (L > 0.6) ctx.fillStyle = css(hex('#a9c6e8'), 0.35);
      else continue;
      px(ctx, w.x, H - b.h + w.y);
    }
  }
  // Crane light blinks red at night.
  if (night > 0.4 && Math.floor(t / 600) % 2) { ctx.fillStyle = '#ff4d5e'; px(ctx, cx + 13, H - 27); }
  // Rain / snow.
  if (s.rain || s.storm || s.snow) {
    const n = Math.floor((s.snow ? 70 : 150) * s.intensity);
    const slant = Math.min(2, s.wind / 15);
    for (let i = 0; i < n; i++) {
      const d = sc.drops[i];
      if (s.snow) {
        const y = (d.y + t * 0.008 * d.s) % H;
        const x = (d.x + Math.sin(t / 900 + i) * 3 + t * 0.002 * slant) % W;
        ctx.fillStyle = css([245, 248, 255], 0.9);
        px(ctx, x, y, d.s > 1 ? 2 : 1, d.s > 1 ? 2 : 1);
      } else {
        const y = (d.y + t * 0.09 * d.s) % (H + 6) - 3;
        const x = ((d.x + y * slant * 0.3) % W + W) % W;
        ctx.fillStyle = css(mix([150, 185, 235], [205, 225, 255], L), 0.55);
        px(ctx, x, y, 1, 3);
      }
    }
  }
  // Lightning: a flash and a bolt every few seconds.
  if (s.storm) {
    const cycle = t % 5200;
    if (cycle < 160) {
      ctx.fillStyle = css([235, 240, 255], cycle < 60 ? 0.45 : 0.18); px(ctx, 0, 0, W, H);
      ctx.fillStyle = '#fffbe0';
      let bx = Math.floor(W * (0.3 + ((t / 5200) % 1) * 0.4)), by = 6;
      while (by < sc.horizon) { px(ctx, bx, by, 1, 3); by += 3; bx += (Math.floor(by * 7.3) % 3) - 1; }
    }
  }
  // Fade the bottom into the card so text below sits cleanly.
  ctx.fillStyle = 'rgba(15,27,46,0.55)'; px(ctx, 0, H - 2, W, 2);
}

// ---------------------------------------------------------------- loop
let state = { getWeather: () => null };
let scenery = null, size = '';
let lastFrame = 0;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function frame(ts) {
  requestAnimationFrame(frame);
  const cv = document.getElementById('sky');
  if (!cv || document.hidden) return;
  if (ts - lastFrame < 80 && cv.dataset.drawn) return; // ~12fps is plenty for pixel art
  if (reduced && cv.dataset.drawn) return;
  lastFrame = ts;
  const W = Math.max(40, Math.floor(cv.clientWidth / PX));
  const H = Math.max(20, Math.floor(cv.clientHeight / PX));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  if (size !== `${W}x${H}`) { scenery = buildScenery(W, H); size = `${W}x${H}`; }
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  draw(ctx, W, H, scenery, sceneFrom(state.getWeather(), Date.now()), ts);
  cv.dataset.drawn = '1';
}

export function startSky(getWeather) {
  state.getWeather = getWeather;
  requestAnimationFrame(frame);
}
