// News Ramen — pixel-art sky for the Briefing header, in the style of the
// NEONWORD backgrounds: banded skies with dithered seams, a striped sunset sun,
// a three-layer parallax city with stepped roofs, antennas, beacons and neon
// signs, the Port Hills behind it and a park with trees and lamps in front.
//
// Everything follows the real conditions in Christchurch:
//  time of day  — sunrise/sunset, golden hour, sun and moon (with phase) arcs
//  season       — summer / autumn / winter / spring trees, grass and hills
//  weather      — clear, partly cloudy, overcast, fog, drizzle, rain, heavy
//                 rain, showers + rainbow, thunderstorm, hail, snow, windy,
//                 hot (30°C+ heat haze), frosty cold, aurora on clear winter nights
// Test any scene with URL params: ?sky=<WMO code>&hour=21.5&temp=32&wind=50&season=autumn

const PX = 3; // one art pixel = 3 CSS pixels, same as NEONWORD
const MIN = 60e3;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- colour + random helpers
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixc = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t))));
const mix3 = (A, B, t) => A.map((c, i) => mixc(c, B[i], t));
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const H3 = (a, b, c) => [hex(a), hex(b), hex(c)];
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// Sky palettes: [top, middle, horizon]
const SKY = {
  day: H3('#2a7fd4', '#79c6f0', '#d8f3ff'),
  winterDay: H3('#3f86cf', '#9fcdef', '#eef8ff'),
  hot: H3('#2f86e0', '#ffcf7a', '#fff0c4'),
  grey: H3('#5d6b7a', '#8794a3', '#b5bfca'),
  storm: H3('#1a262e', '#3a4b55', '#6a7d88'),
  dusk: H3('#2b1a4a', '#c85a7a', '#ffb36b'),
  dawn: H3('#1d2a5a', '#b06aa0', '#ffc89a'),
  night: H3('#020617', '#0b1f45', '#1f3a6e'),
  nightGrey: H3('#0c0f18', '#1a2130', '#2a3345'),
};
const NEON = ['#4fd8c4', '#ffd166', '#ff6b8a', '#8db4ff'].map(hex);
const SEASON = {
  summer: { grass: hex('#4f7a3a'), hills: hex('#8a8448'), trees: ['#3f7a34', '#5a9a3c', '#2f6a2c'].map(hex) },
  autumn: { grass: hex('#5a6a34'), hills: hex('#7a6a3a'), trees: ['#ff7a1f', '#d9411e', '#ffb000', '#b8452a'].map(hex) },
  winter: { grass: hex('#3e5a46'), hills: hex('#5a6a70'), trees: null },
  spring: { grass: hex('#4f8a44'), hills: hex('#5f8a4a'), trees: ['#ff9ec8', '#ffc4e0', '#ff7ab0', '#ffffff'].map(hex) },
};

// ---------------------------------------------------------------- conditions → scene
function sceneFrom(w, realNow) {
  const q = new URLSearchParams(location.search);
  let now = realNow;
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  if (q.get('hour')) now = dayStart.getTime() + (+q.get('hour')) * 60 * MIN;
  let code = w?.code ?? 2;
  let cloud = w?.cloud ?? 40;
  if (q.get('sky')) { code = +q.get('sky'); cloud = code === 0 ? 5 : code === 1 ? 25 : code === 2 ? 55 : 95; }
  const wind = q.get('wind') ? +q.get('wind') : w?.wind ?? 10;
  const temp = q.get('temp') ? +q.get('temp') : w?.t ?? 16;
  const month = new Date(now).getMonth();
  const season = q.get('season') || (month === 11 || month <= 1 ? 'summer' : month <= 4 ? 'autumn' : month <= 7 ? 'winter' : 'spring');
  const sr = w?.sunrise?.[0] ?? dayStart.getTime() + 6.2 * 60 * MIN;
  const ss = w?.sunset?.[0] ?? dayStart.getTime() + 20.4 * 60 * MIN;
  const nightLen = (w?.sunrise?.[1] ?? sr + 24 * 60 * MIN) - ss;
  const drizzle = [51, 53, 55, 56, 57].includes(code);
  const rain = drizzle || [61, 63, 65, 66, 67, 80, 81, 82].includes(code);
  const showers = [80, 81, 82].includes(code);
  const snow = [71, 73, 75, 77, 85, 86].includes(code);
  const storm = code >= 95;
  const hail = code === 96 || code === 99;
  const fog = code === 45 || code === 48;
  const intensity = { 51: 0.25, 53: 0.35, 55: 0.45, 56: 0.35, 57: 0.5, 61: 0.5, 63: 0.75, 65: 1, 66: 0.6, 67: 0.9, 80: 0.5, 81: 0.75, 82: 1,
    71: 0.4, 73: 0.7, 75: 1, 77: 0.4, 85: 0.6, 86: 1, 95: 0.9, 96: 1, 99: 1 }[code] || 0.5;
  const tw = 45 * MIN;
  const light = clamp01(Math.min((now - (sr - tw)) / (2 * tw), ((ss + tw) - now) / (2 * tw)));
  const golden = clamp01(1 - Math.min(Math.abs(now - sr), Math.abs(now - ss)) / (75 * MIN));
  const day = now >= sr && now <= ss;
  let arc;
  if (day) arc = (now - sr) / (ss - sr);
  else if (now > ss) arc = (now - ss) / nightLen;
  else arc = 1 - (sr - now) / nightLen;
  const overcast = storm ? 1 : clamp01((cloud - 35) / 55) * (rain || snow || fog || code === 3 ? 1 : 0.75);
  const hot = temp >= 30;
  const cold = temp <= 3;
  return {
    code, cloud, wind, temp, season, rain, drizzle, showers, snow, storm, hail, fog, intensity, light, golden, day,
    morning: now < (sr + ss) / 2 && now > sr - 3 * 60 * MIN, arc: clamp01(arc), overcast, hot, cold, now,
    windy: wind >= 35, snowy: snow || (season === 'winter' && cold && code >= 71),
    frost: cold && !rain && !snow && overcast < 0.5 && (light < 0.7),
    aurora: !day && overcast < 0.3 && (season === 'winter' || cold) && !fog,
    rainbow: day && (showers || (rain && cloud < 90)) && light > 0.6,
  };
}

function moonPhase(t) {
  const syn = 29.530588853 * 24 * 60 * MIN;
  return (((t - Date.UTC(2000, 0, 6, 18, 14)) % syn) + syn) % syn / syn;
}

// ---------------------------------------------------------------- geometry (built once per size)
let G = null;
function build(W, H) {
  const r = rng(W * 9173 + H * 31);
  const hz = Math.floor(H * 0.6);           // hills meet the city here
  const ground = H - 6;                      // park strip along the bottom
  // Port Hills ridge
  const ridge = [];
  const p1 = r() * 9, p2 = r() * 9;
  for (let x = 0; x < W; x++) {
    // Port Hills: rolling peaks and saddles rather than one slope.
    ridge.push(Math.round(hz - 10 - Math.sin(x / 13 + p1) * 4 - Math.sin(x / 6 + p2) * 1.5 - Math.abs(Math.sin(x / 29 + p2)) * 7 - Math.sin(x / 47) * 3));
  }
  // Three parallax city layers. Mid layer reaches high up the sky.
  const layers = [0, 1, 2].map((d) => {
    const LW = Math.max(W * 2, 240);
    const blds = [];
    let x = 0;
    const lr = rng(1000 + d * 77 + W);
    let spireDone = d !== 1;
    while (x < LW) {
      const bw = Math.floor([6, 8, 12][d] + lr() * [10, 14, 16][d]);
      const bot = d === 0 ? hz + 2 : ground;
      // Mostly mid-rise with the odd tall tower poking well up into the sky.
      const hmin = [0.06, 0.16, 0.1][d], hmax = [0.2, 0.62, 0.3][d];
      const roll = d === 1 ? Math.pow(lr(), 2.2) : lr();
      let bh = Math.floor(H * (hmin + roll * (hmax - hmin)));
      const b = { x, w: bw, bot, h: bh, step: lr() > 0.5, ant: lr() > 0.62 ? 3 + Math.floor(lr() * 9) : 0, win: [], sign: null, spire: false };
      if (!spireDone && x > LW * 0.15 && lr() > 0.7) { b.spire = true; b.h = Math.floor(H * 0.3); b.w = 7; spireDone = true; }
      const step = d === 0 ? 2 : 3;
      for (let wy = 3; wy < b.h - 2; wy += step) {
        for (let wx = 2; wx < b.w - 2; wx += step) {
          if (lr() < [0.3, 0.4, 0.35][d]) b.win.push({ x: wx, y: wy, on: lr(), warm: lr(), fl: lr() });
        }
      }
      if (d >= 1 && lr() > 0.62 && b.h > 14 && !b.spire) {
        const vert = lr() > 0.5;
        const sw = vert ? 3 : Math.min(b.w - 4, 7 + Math.floor(lr() * 8));
        const sh = vert ? 8 + Math.floor(lr() * 10) : 4;
        b.sign = { x: vert ? (lr() > 0.5 ? -1 : b.w - 2) : 2, y: 4 + Math.floor(lr() * Math.max(1, b.h * 0.35)), w: sw, h: sh,
          col: pick(lr, NEON), ph: lr() * 10, pat: Math.floor(lr() * 1e6) };
      }
      blds.push(b);
      x += bw + Math.floor(lr() * [2, 3, 6][d]);
    }
    return { d, LW, blds, speed: [0.6, 1.4, 2.6][d] };
  });
  // Park: trees and lamps along the bottom.
  const trees = [], lamps = [];
  for (let x = 3; x < W; x += 9 + Math.floor(r() * 9)) {
    if (r() < 0.22) { lamps.push({ x }); continue; }
    trees.push({ x, h: 6 + Math.floor(r() * 5), rad: 3 + Math.floor(r() * 2), tone: r(), ph: r() * 6 });
  }
  const stars = Array.from({ length: Math.floor(W * hz / 40) }, () => ({ x: Math.floor(r() * W), y: Math.floor(r() * hz * 0.75), p: r() * 6.28, b: r(), c: r() > 0.88 }));
  const clouds = Array.from({ length: 10 }, (_, i) => makeCloud(rng(i * 131 + 7), W, hz));
  G = { W, H, hz, ground, ridge, layers, trees, lamps, stars, clouds, parts: [], flash: 0, bolt: null, nextBolt: 0, shooter: null, nextShoot: 0,
    birds: null, nextBirds: 0, plane: null, nextPlane: 0, last: 0 };
}
function makeCloud(r, W, hz) {
  // Flat-bottomed pixel cumulus: stacked rows, widest at the base.
  const w = 12 + Math.floor(r() * 20);
  const rows = [];
  const h = 3 + Math.floor(r() * 4);
  for (let i = 0; i < h; i++) {
    const f = (i + 1) / h;
    const rw = Math.round(w * (0.35 + 0.65 * Math.sqrt(f)) + (r() - 0.5) * 3);
    rows.push({ w: rw, off: Math.floor((w - rw) / 2 + (r() - 0.5) * 3) });
  }
  return { x: r() * W * 1.5, y: 2 + Math.floor(r() * hz * 0.42), w, rows, sp: 0.5 + r() * 0.8 };
}

// ---------------------------------------------------------------- draw helpers
let ctx;
const fill = (c, a = 1) => { ctx.fillStyle = typeof c === 'string' ? c : css(c, a); };
const rect = (x, y, w = 1, h = 1) => ctx.fillRect(Math.round(x), Math.round(y), w, h);
function disc(cx, cy, r) {
  for (let y = -r; y <= r; y++) { const hw = Math.floor(Math.sqrt(r * r - y * y) + 0.35); rect(cx - hw, cy + y, hw * 2 + 1, 1); }
}

function skyColours(s) {
  let day = s.hot && s.overcast < 0.4 ? SKY.hot : s.season === 'winter' ? SKY.winterDay : SKY.day;
  day = mix3(day, s.storm ? SKY.storm : SKY.grey, s.storm ? 1 : s.overcast);
  const night = mix3(SKY.night, SKY.nightGrey, s.overcast);
  let c = mix3(night, day, s.light);
  const glow = s.golden * (1 - s.overcast * 0.75);
  if (glow > 0) c = mix3(c, s.morning ? SKY.dawn : SKY.dusk, glow * 0.85);
  return c;
}

function drawSky(s, W, hz) {
  const [a, b, c] = skyColours(s);
  const col = (t) => (t < 0.6 ? mixc(a, b, t / 0.6) : mixc(b, c, (t - 0.6) / 0.4));
  const bands = 14;
  for (let i = 0; i < bands; i++) { fill(col(i / (bands - 1))); rect(0, Math.floor((hz * i) / bands), W, Math.ceil(hz / bands) + 1); }
  for (let i = 1; i < bands; i++) {            // dither the seams, NEONWORD style
    const y = Math.floor((hz * i) / bands);
    fill(col((i - 1) / (bands - 1)));
    for (let x = i % 2; x < W; x += 2) rect(x, y);
  }
  fill(c); rect(0, hz, W, G.H - hz);
  return [a, b, c];
}

function drawStars(s, t) {
  const A = clamp01(1 - s.light * 2.4) * (1 - s.overcast);
  if (A < 0.03) return;
  for (const st of G.stars) {
    const tw = 0.5 + 0.5 * Math.sin(t / 650 + st.p * 3);
    fill(st.c ? hex('#ffd166') : [235, 240, 255], A * (0.3 + 0.7 * tw * st.b));
    rect(st.x, st.y);
  }
  // Shooting star now and then on clear nights.
  if (s.overcast < 0.3 && !reduced) {
    if (!G.shooter && t > G.nextShoot) { G.shooter = { x: Math.random() * G.W * 0.7, y: Math.random() * G.hz * 0.3, life: 0 }; G.nextShoot = t + 5000 + Math.random() * 9000; }
    if (G.shooter) {
      const sh = G.shooter; sh.life++;
      for (let i = 0; i < 6; i++) { fill([255, 255, 255], A * (1 - i / 6)); rect(sh.x + sh.life * 2 - i * 2, sh.y + sh.life - i); }
      if (sh.life > 18) G.shooter = null;
    }
  }
}

function drawAurora(s, t) {
  if (!s.aurora) return;
  const A = clamp01(1 - s.light * 2) * 0.55;
  for (let x = 0; x < G.W; x++) {
    const base = G.hz * 0.45 + Math.sin(x / 13 + t / 2200) * 4 + Math.sin(x / 5 + t / 1300) * 1.5;
    const len = 6 + Math.round((Math.sin(x / 7 + t / 1700) + 1) * 5);
    for (let i = 0; i < len; i++) {
      const f = i / len;
      fill(mixc(hex('#4fffa8'), hex('#c77dff'), f), A * (1 - f) * (0.55 + 0.45 * Math.sin(x / 3 + t / 500)));
      rect(x, base - i);
    }
  }
}

function drawSunMoon(s, t, skyTop) {
  const W = G.W, hz = G.hz;
  const alt = Math.sin(Math.PI * s.arc);
  const x = Math.round(W * 0.1 + s.arc * W * 0.8);
  const y = Math.round(hz - 3 - alt * (hz - 12));
  const veil = 1 - s.overcast * 0.85;
  if (veil < 0.08) return;
  if (s.day) {
    if (alt < 0.32) {
      // Big striped sunset/sunrise sun, like NEONWORD.
      const r = Math.max(6, Math.floor(Math.min(W, G.H) * 0.17));
      for (let yy = -r; yy <= r; yy++) {
        const w = Math.floor(Math.sqrt(r * r - yy * yy));
        const gap = yy > -r * 0.1 && ((yy + r) % 5 < Math.min(3, 1 + Math.floor((yy + r * 0.1) / (r * 0.3))));
        if (gap) continue;
        fill(mixc(hex('#ffe14a'), hex('#ff6a8a'), (yy + r) / (2 * r)), veil);
        rect(x - w, y + yy, w * 2, 1);
      }
    } else {
      const r = s.hot ? 7 : 5;
      fill(hex('#fff6c2'), 0.12 * veil); disc(x, y, r + 5);
      fill(hex('#fff6c2'), 0.2 * veil); disc(x, y, r + 2);
      if (s.hot && !reduced) {                 // pulsing rays on a scorcher
        const pulse = 2 + Math.round((Math.sin(t / 400) + 1) * 1.5);
        fill(hex('#ffe08a'), 0.6 * veil);
        for (let k = 0; k < 8; k++) {
          const ang = k * Math.PI / 4 + t / 4000;
          for (let d = r + 2; d < r + 2 + pulse; d++) rect(x + Math.cos(ang) * d, y + Math.sin(ang) * d);
        }
      }
      fill(hex('#ffe98a'), veil); disc(x, y, r);
      fill(hex('#fffbe6'), veil); disc(x - 1, y - 1, Math.max(1, r - 3));
    }
  } else {
    // Only the lit part of the moon is drawn, so the sky shows through the dark side.
    // Southern Hemisphere: a waxing moon is lit on the left.
    const ph = moonPhase(s.now);
    const k = Math.cos(2 * Math.PI * ph);            // 1 = new, -1 = full
    const lit = (1 - k) / 2;
    const R = 5;
    if (lit > 0.15) { fill([215, 225, 255], 0.1 * veil * lit); disc(x, y, 8); }
    for (let dy = -R; dy <= R; dy++) {
      const hw = Math.sqrt(R * R - dy * dy);
      for (let dx = -Math.floor(hw); dx <= Math.floor(hw); dx++) {
        const xn = hw ? dx / hw : 0;
        const on = ph < 0.5 ? -xn > k : xn > k;
        if (!on) continue;
        const crater = (dx === 1 && dy === 1) || (dx === -2 && dy === -2) || (dx === -1 && dy === 3) || (dx === 2 && dy === -1);
        fill(crater ? [196, 204, 228] : [238, 242, 252], veil);
        rect(x + dx, y + dy);
      }
    }
    if (lit <= 0.15) { fill([120, 135, 175], 0.35 * veil); for (let a = 0; a < 6.28; a += 0.35) rect(x + Math.cos(a) * R, y + Math.sin(a) * R); }
  }
}

function drawRainbow(s) {
  if (!s.rainbow) return;
  const cx = s.arc < 0.5 ? G.W * 0.78 : G.W * 0.22;
  const R = Math.floor(G.hz * 0.9);
  const cols = ['#ff5d5d', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#9775fa'].map(hex);
  cols.forEach((c, i) => {
    fill(c, 0.32);
    const rr = R - i;
    for (let x = -rr; x <= rr; x++) {
      const y = G.hz - Math.round(Math.sqrt(rr * rr - x * x));
      if (y < G.hz) rect(cx + x, y);
    }
  });
}

function cloudCols(s) {
  const dark = s.storm ? 0.72 : s.rain || s.snow ? 0.42 : s.overcast * 0.28;
  let body = mixc(mixc(hex('#2a3450'), hex('#202636'), dark), mixc(hex('#f6f9ff'), hex('#6f7a88'), dark), s.light);
  const glow = s.golden * (1 - s.overcast * 0.6);
  if (glow > 0) body = mixc(body, hex('#ffb0a0'), glow * 0.55);
  return { body, top: mixc(body, [255, 255, 255], 0.35 * s.light), shade: mixc(body, [12, 18, 34], 0.3) };
}
function drawClouds(s, t) {
  const n = s.storm || s.rain || s.snow || s.fog ? 10 : Math.round(clamp01(s.cloud / 100) * 9);
  if (!n) return;
  const C = cloudCols(s);
  const speed = (0.4 + s.wind / 12) * 0.003;
  const span = G.W + 50;
  // Heavy weather gets a solid cloud deck across the top.
  if (s.overcast > 0.7) {
    fill(C.shade, 0.95); rect(0, 0, G.W, 3);
    fill(C.body, 0.95); for (let x = 0; x < G.W; x++) rect(x, 3, 1, 1 + Math.round((Math.sin(x / 4 + t / 3000) + 1) * 1.5));
  }
  for (let i = 0; i < n; i++) {
    const c = G.clouds[i];
    const x0 = ((c.x + (reduced ? 0 : t * speed * c.sp)) % span + span) % span - 30;
    c.rows.forEach((row, k) => {
      const last = k === c.rows.length - 1;
      fill(k === 0 ? C.top : last ? C.shade : C.body, 0.96);
      rect(x0 + row.off, c.y + k, row.w, 1);
    });
  }
}

function drawHills(s) {
  const sea = SEASON[s.season];
  let col = mixc(hex('#101a36'), mixc(sea.hills, hex('#6b7684'), s.overcast * 0.6), s.light * 0.9);
  if (s.golden > 0) col = mixc(col, hex('#7a4a63'), s.golden * 0.45);
  const capOn = s.season === 'winter' || s.snowy;
  const cap = mixc(hex('#5a6a90'), hex('#f4f8ff'), s.light);
  const minY = Math.min(...G.ridge);
  G.ridge.forEach((y, x) => {
    fill(col); rect(x, y, 1, G.H - y);
    if (capOn && y < minY + 4) { fill(cap); rect(x, y, 1, 2 + (s.snowy ? 2 : 0)); }
  });
}

function buildingCol(s, d) {
  const night = [hex('#1b2a52'), hex('#121d3c'), hex('#0b1329')][d];
  const day = [hex('#7f9cc4'), hex('#3f5a86'), hex('#263856')][d];
  let c = mixc(night, mixc(day, hex('#5d6878'), s.overcast * 0.45), s.light);
  if (s.golden > 0) c = mixc(c, hex('#6a4a7a'), s.golden * 0.35);
  if (s.fog) c = mixc(c, hex('#a7b2c2'), [0.55, 0.35, 0.15][d] * Math.max(0.4, s.light));
  return c;
}
function drawLayer(s, L, t) {
  const W = G.W;
  const off = reduced ? 0 : (t * L.speed / 1000) % L.LW;
  const base = buildingCol(s, L.d);
  const edge = mixc(base, s.light > 0.5 ? [255, 255, 255] : hex('#4fd8c4'), s.light > 0.5 ? 0.18 : 0.12);
  const night = 1 - s.light;
  const snowCap = mixc(hex('#8a9bc0'), hex('#ffffff'), s.light);
  for (const k of [0, 1]) {
    const ox = -off + k * L.LW;
    for (const b of L.blds) {
      const bx = Math.round(b.x + ox);
      if (bx > W || bx + b.w < 0) continue;
      const top = b.bot - b.h;
      fill(base); rect(bx, top, b.w, b.h);
      if (b.step) rect(bx + 2, top - 2, b.w - 4, 2);
      if (b.spire) {                                   // a cathedral-style spire
        for (let i = 0; i < 9; i++) rect(bx + 3 - Math.floor(i / 3), top - 9 + i, 1 + Math.floor(i / 3) * 2, 1);
        rect(bx + 3, top - 13, 1, 4);
      }
      if (b.ant) { rect(bx + Math.floor(b.w / 2), top - b.ant - (b.step ? 2 : 0), 1, b.ant); }
      fill(edge); rect(s.arc < 0.5 ? bx : bx + b.w - 1, top, 1, b.h);
      if (s.snowy) { fill(snowCap); rect(bx, top, b.w, 1); if (b.step) rect(bx + 2, top - 2, b.w - 4, 1); }
      // Windows: warm and lit at night, glassy by day.
      for (const w of b.win) {
        const lit = w.on < 0.18 + night * 0.5 || (s.storm && w.on < 0.45);
        if (night > 0.35 && lit) {
          if (w.fl > 0.985 && Math.sin(t / 220 + w.x) > 0.4) continue;
          fill(w.warm > 0.75 ? hex('#bfe7ff') : w.warm > 0.6 ? hex('#4fd8c4') : hex('#ffd98a'), L.d === 0 ? 0.45 : 0.6 + night * 0.4);
        } else if (s.light > 0.55 && w.on < 0.55) fill(w.warm > 0.8 ? hex('#4fd8c4') : hex('#cfe6ff'), L.d === 0 ? 0.25 : 0.55);
        else continue;
        rect(bx + w.x, top + w.y, L.d === 2 ? 2 : 1, 1);
      }
      // Neon signs glow after dark.
      if (b.sign) {
        const sg = b.sign; const sx = bx + sg.x; const sy = top + sg.y;
        const on = night > 0.3;
        const f = Math.sin(t / 900 + sg.ph) + Math.sin(t / 130 + sg.ph * 3) * 0.3;
        if (on && f < -1.05) continue;
        if (on) { fill(sg.col, 0.22 * night); rect(sx - 1, sy - 1, sg.w + 2, sg.h + 2); }
        fill(sg.col, on ? 0.95 : 0.35); rect(sx, sy, sg.w, sg.h);
        fill(base, 0.9);
        let p = sg.pat;
        for (let yy = 1; yy < sg.h - 1; yy++) for (let xx = 1; xx < sg.w - 1; xx++) { p = (p * 1103515245 + 12345) & 0x7fffffff; if (p % 3 === 0) rect(sx + xx, sy + yy); }
      }
      if (b.ant && night > 0.3 && Math.sin(t / 420 + b.x) > 0.35) { fill(hex('#ff2040')); rect(bx + Math.floor(b.w / 2), top - b.ant - (b.step ? 2 : 0) - 1); }
    }
  }
}

function drawFog(s, t) {
  if (!s.fog) return;
  for (let i = 0; i < 5; i++) {
    const y = G.hz - 10 + i * 6;
    const off = ((t / (70 + i * 25)) % G.W);
    fill(mixc([140, 150, 172], [226, 232, 240], s.light), 0.2);
    for (const k of [-1, 0, 1]) rect(k * G.W - off + (i % 2) * 20, y, G.W * 0.75, 3);
  }
}

function drawPark(s, t) {
  const W = G.W, gy = G.ground;
  const sea = SEASON[s.season];
  let grass = s.hot ? mixc(sea.grass, hex('#a8955a'), 0.6) : sea.grass;
  if (s.snowy) grass = hex('#e6edf8');
  grass = mixc(mixc(grass, [10, 18, 34], 0.75), grass, s.light);
  fill(grass); rect(0, gy, W, G.H - gy);
  fill(mixc(grass, [255, 255, 255], 0.15)); for (let x = 0; x < W; x += 3) rect(x, gy);
  // Wet ground shimmer / frost sparkle.
  if ((s.rain || s.storm) && !reduced) {
    fill(mixc(hex('#9fc3ff'), hex('#ffd98a'), 1 - s.light), 0.45);
    for (let x = (Math.floor(t / 200)) % 5; x < W; x += 5) rect(x, gy + 2 + (x % 3));
  }
  if (s.frost) { for (let i = 0; i < W / 3; i++) { if (Math.sin(t / 300 + i * 7) > 0.6) { fill([255, 255, 255], 0.9); rect((i * 37) % W, gy + 1 + (i % 4)); } } }
  // Lamps.
  const night = 1 - s.light;
  for (const l of G.lamps) {
    fill(mixc(hex('#1a2238'), hex('#3a4458'), s.light)); rect(l.x, gy - 8, 1, 8); rect(l.x - 1, gy - 9, 3, 1);
    if (night > 0.35) { fill(hex('#ffd98a'), 0.13 * night); disc(l.x, gy - 8, 5); fill(hex('#ffd98a'), 0.2 * night); disc(l.x, gy - 8, 2); fill(hex('#fff1c4')); rect(l.x, gy - 8); }
  }
  // Trees: seasonal canopies that sway in the wind.
  const sway = s.windy ? 2 : s.wind > 20 ? 1 : 0;
  const trunk = mixc(hex('#1b1420'), hex('#5a4030'), s.light);
  for (const tr of G.trees) {
    const dx = reduced ? 0 : Math.round(Math.sin(t / 650 + tr.ph) * sway);
    const top = gy - tr.h;
    fill(trunk); rect(tr.x, top, 1, tr.h);
    if (!sea.trees) {                                    // winter: bare branches
      rect(tr.x - 2 + dx, top + 1, 2, 1); rect(tr.x + 1 + dx, top, 2, 1); rect(tr.x - 1 + dx, top - 1, 1, 2); rect(tr.x + 2 + dx, top - 2, 1, 2);
      if (s.snowy) { fill(hex('#ffffff'), 0.9); rect(tr.x - 2 + dx, top, 2, 1); rect(tr.x + 1 + dx, top - 1, 2, 1); }
      continue;
    }
    let c = sea.trees[Math.floor(tr.tone * sea.trees.length)];
    if (s.hot && s.season === 'summer') c = mixc(c, hex('#8a8a3a'), 0.25);
    const dark = mixc(c, [8, 12, 28], 0.35 + night * 0.5);
    const lite = mixc(c, [255, 255, 255], 0.18);
    const cc = mixc(c, [8, 12, 28], night * 0.55);
    fill(dark); disc(tr.x + dx, top - 1, tr.rad);
    fill(cc); disc(tr.x + dx - 1, top - 2, tr.rad - 1);
    fill(lite, s.light); rect(tr.x + dx - 2, top - tr.rad, 2, 1);
    if (s.season === 'spring') { fill([255, 255, 255], 0.85); rect(tr.x + dx + 1, top - 2); rect(tr.x + dx - 2, top); }
    if (s.snowy) { fill(hex('#ffffff')); rect(tr.x + dx - tr.rad + 1, top - tr.rad, tr.rad * 2 - 1, 1); }
  }
}

// ---------------------------------------------------------------- moving things
function spawnParts(s) {
  const P = G.parts, W = G.W, H = G.H;
  const want = (type, n) => { let have = 0; for (const p of P) if (p.type === type) have++; for (let i = have; i < n; i++) P.push(newPart(type, true)); };
  if (s.rain || s.storm) want('rain', Math.floor(W * (s.drizzle ? 0.35 : 0.9) * s.intensity));
  if (s.snow) want('snow', Math.floor(W * 0.55 * s.intensity));
  if (s.hail) want('hail', Math.floor(W * 0.25));
  if (s.season === 'autumn' && !s.snow) want('leaf', s.windy ? 16 : 6);
  if (s.season === 'spring' && !s.rain && !s.snow) want('petal', s.windy ? 14 : 7);
  if (s.windy && s.season !== 'autumn' && !s.snow) want('leaf', 8);
  if (s.hot && s.day) want('haze', 4);
  // Drop particles that no longer belong.
  G.parts = P.filter((p) => (p.type === 'rain' ? s.rain || s.storm : p.type === 'snow' ? s.snow : p.type === 'hail' ? s.hail
    : p.type === 'petal' ? s.season === 'spring' && !s.rain : p.type === 'haze' ? s.hot && s.day : p.type === 'leaf' ? (s.season === 'autumn' || s.windy) && !s.snow : true));
  function newPart(type, anywhere) {
    const r = Math.random;
    const base = { type, x: r() * (W + 20) - 10, y: anywhere ? r() * H : -3, v: 0, s: r() };
    if (type === 'rain') return { ...base, v: 2.2 + r() * 1.6, l: 2 + Math.floor(r() * 3) };
    if (type === 'snow') return { ...base, v: 0.18 + r() * 0.3 };
    if (type === 'hail') return { ...base, v: 2.4 + r(), bounce: 0 };
    if (type === 'leaf') return { ...base, v: 0.25 + r() * 0.3, c: pick(r, s.season === 'autumn' ? SEASON.autumn.trees : SEASON.summer.trees) };
    if (type === 'petal') return { ...base, v: 0.15 + r() * 0.2, c: pick(r, SEASON.spring.trees) };
    if (type === 'haze') return { ...base, y: G.hz - 6 + r() * 10, v: 0 };
    return base;
  }
  G.newPart = newPart;
}
function drawParts(s, t, dt) {
  const W = G.W, gy = G.ground;
  const slant = Math.min(1.2, s.wind / 30);
  for (const p of G.parts) {
    if (p.type === 'rain') {
      if (!reduced) { p.y += p.v * dt; p.x -= p.v * slant * 0.35 * dt; }
      if (p.y > gy) {
        if (s.intensity > 0.7) { fill(hex('#cfe3ff'), 0.6); rect(p.x - 1, gy - 1); rect(p.x + 1, gy - 1); }
        Object.assign(p, G.newPart('rain', false));
      }
      fill(mixc(hex('#9cc2f5'), hex('#e3eeff'), s.light), 0.78);
      rect(p.x, p.y, 1, p.l + (s.intensity > 0.7 ? 1 : 0));
    } else if (p.type === 'snow') {
      if (!reduced) { p.y += p.v * dt; p.x += (Math.sin(t / 800 + p.s * 20) * 0.25 - slant * 0.2) * dt; }
      if (p.y > gy + 2) Object.assign(p, G.newPart('snow', false));
      fill([250, 252, 255], 0.95); rect(p.x, p.y, p.s > 0.75 ? 2 : 1, p.s > 0.75 ? 2 : 1);
    } else if (p.type === 'hail') {
      if (!reduced) { p.y += p.v * dt; }
      if (p.y > gy && !p.bounce) { p.bounce = 1; p.v = -1.2; }
      if (p.bounce) p.v += 0.25 * dt;
      if (p.bounce && p.y > gy + 1) Object.assign(p, G.newPart('hail', false));
      fill([240, 246, 255]); rect(p.x, p.y);
    } else if (p.type === 'leaf' || p.type === 'petal') {
      if (!reduced) { p.y += p.v * dt; p.x += (Math.sin(t / 500 + p.s * 30) * 0.4 + (s.windy ? 0.9 : 0.15)) * dt; }
      if (p.y > gy + 3 || p.x > W + 4) Object.assign(p, G.newPart(p.type, false), { x: s.windy ? -4 : Math.random() * W });
      fill(mixc(p.c, [10, 16, 30], (1 - s.light) * 0.6));
      rect(p.x, p.y, Math.sin(t / 200 + p.s * 9) > 0 ? 2 : 1, 1);
    } else if (p.type === 'haze') {
      fill([255, 245, 220], 0.12);
      for (let x = 0; x < W; x += 2) rect(x, p.y + Math.sin(x / 5 + t / 260 + p.s * 9) * 1.2);
    }
  }
}

function drawFlyers(s, t) {
  // Birds by day, a plane with blinking lights at night.
  const clearish = !s.rain && !s.storm && !s.snow && !s.fog;
  if (s.day && clearish) {
    if (!G.birds && t > G.nextBirds) G.birds = { x: -10, y: 6 + Math.random() * G.hz * 0.35, n: 3 + Math.floor(Math.random() * 4) };
    if (G.birds) {
      const b = G.birds; if (!reduced) b.x += 0.35 + s.wind / 80;
      fill(mixc(hex('#1a2238'), hex('#2a3448'), s.light));
      for (let i = 0; i < b.n; i++) {
        const bx = b.x - i * 4, by = b.y + Math.abs(i - b.n / 2) * 2;
        const up = Math.sin(t / 120 + i) > 0;
        rect(bx - 1, by + (up ? -1 : 0)); rect(bx, by); rect(bx + 1, by + (up ? -1 : 0));
      }
      if (b.x > G.W + 20) { G.birds = null; G.nextBirds = t + 8000 + Math.random() * 12000; }
    }
  } else if (!s.day) {
    if (!G.plane && t > G.nextPlane) G.plane = { x: G.W + 5, y: 5 + Math.random() * G.hz * 0.3 };
    if (G.plane) {
      const p = G.plane; if (!reduced) p.x -= 0.4;
      fill([200, 210, 230], 0.8); rect(p.x, p.y, 3, 1);
      if (Math.floor(t / 400) % 2) { fill(hex('#ff3b4d')); rect(p.x - 1, p.y); }
      if (Math.floor(t / 400 + 1) % 3 === 0) { fill([255, 255, 255]); rect(p.x + 3, p.y); }
      if (p.x < -10) { G.plane = null; G.nextPlane = t + 12000 + Math.random() * 15000; }
    }
  }
}

function drawLightning(s, t) {
  if (!s.storm || reduced) return;
  if (t > G.nextBolt) {
    G.flash = 5; G.nextBolt = t + 3500 + Math.random() * 4500;
    const pts = []; let x = G.W * (0.2 + Math.random() * 0.6), y = 4;
    while (y < G.hz + 4) { pts.push([x, y]); y += 2 + Math.random() * 3; x += (Math.random() - 0.5) * 5; }
    G.bolt = pts;
  }
  if (G.flash > 0) {
    fill([235, 240, 255], G.flash > 3 ? 0.4 : 0.15); rect(0, 0, G.W, G.H);
    if (G.bolt && G.flash > 1) { fill(hex('#fffbe0')); for (const [x, y] of G.bolt) rect(x, y, 1, 3); }
    G.flash--;
  }
}

// ---------------------------------------------------------------- frame loop
let getWeather = () => null;
let size = '', lastFrame = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const cv = document.getElementById('sky');
  if (!cv || document.hidden) return;
  if (ts - lastFrame < 66 && cv.dataset.drawn) return;   // ~15fps is plenty for pixel art
  if (reduced && cv.dataset.drawn) return;
  drawNow(cv, ts);
}
// Also callable directly (window.__drawSky) to render one frame for testing.
function drawNow(cv, ts) {
  const dt = Math.min(3, (ts - (lastFrame || ts)) / 50 || 1);
  lastFrame = ts;
  const W = Math.max(60, Math.floor(cv.clientWidth / PX));
  const H = Math.max(40, Math.floor(cv.clientHeight / PX));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  if (size !== `${W}x${H}`) { build(W, H); size = `${W}x${H}`; }
  ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const s = sceneFrom(getWeather(), Date.now());
  const [top] = drawSky(s, W, G.hz);
  drawStars(s, ts);
  drawAurora(s, ts);
  drawSunMoon(s, ts, top);
  drawRainbow(s);
  drawClouds(s, ts);
  drawFlyers(s, ts);
  drawHills(s);
  drawLayer(s, G.layers[0], ts);
  drawFog(s, ts);
  drawLayer(s, G.layers[1], ts);
  drawLayer(s, G.layers[2], ts);
  drawPark(s, ts);
  spawnParts(s);
  drawParts(s, ts, dt);
  drawLightning(s, ts);
  cv.dataset.drawn = '1';
  cv.dataset.scene = [s.season, s.day ? 'day' : 'night', s.code, s.hot ? 'hot' : '', s.windy ? 'windy' : '', s.aurora ? 'aurora' : '', s.rainbow ? 'rainbow' : ''].filter(Boolean).join(' ');
}

export function startSky(get) {
  getWeather = get;
  window.__drawSky = (ts = performance.now()) => { const cv = document.getElementById('sky'); if (cv) drawNow(cv, ts); return cv?.toDataURL(); };
  requestAnimationFrame(frame);
}
