// Deterministic timeline: window.render(t) draws the frame at time t (seconds).
const P = 1200;
const $ = id => document.getElementById(id);
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => cl((t - a) / (b - a));
const lerp = (a, b, u) => a + (b - a) * u;
const eio = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
const eio2 = u => u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
const eoc = u => 1 - Math.pow(1 - u, 3);
const eoq = u => 1 - Math.pow(1 - u, 5);
const eic = u => u * u * u;
const back = (u, s = 1.6) => { if (u <= 0) return 0; if (u >= 1) return 1; u -= 1; return u * u * ((s + 1) * u + s) + 1; };
// damped wobble that starts at 1 and decays to 0
const wob = (dt, f = 2.6, d = 5) => dt <= 0 ? 0 : Math.exp(-d * dt) * Math.cos(2 * Math.PI * f * dt);
function rnd(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

let CAMZ = 0; // current camera dolly of the active world (for culling)
function place(el, o) {
  const { x = 0, y = 0, z = 0, s = 1, rx = 0, ry = 0, rz = 0, op = 1, blur = 0 } = o;
  const sx = o.sx ?? s, sy = o.sy ?? s;
  const hidden = op <= 0.002 || (z + CAMZ > P - 80);
  el.style.visibility = hidden ? 'hidden' : '';
  if (hidden) return;
  el.style.transform = `translate(-50%,-50%) translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,${z.toFixed(2)}px) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) rotateZ(${rz.toFixed(3)}deg) scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
  el.style.opacity = cl(op).toFixed(3);
  el.style.filter = blur > 0.35 ? `blur(${blur.toFixed(2)}px)` : 'none';
}
function camT(el, c) {
  el.style.transform = `rotateZ(${(c.roll || 0).toFixed(3)}deg) rotateY(${(c.yaw || 0).toFixed(3)}deg) translate3d(${(-c.x).toFixed(2)}px,${(-c.y).toFixed(2)}px,${c.z.toFixed(2)}px)`;
}

// ---------- letter splitting ----------
function split(el, text, redFrom = -1, redTo = -1) {
  el.innerHTML = '';
  const arr = [];
  [...text].forEach((ch, i) => {
    const s = document.createElement('span');
    s.className = 'ch'; s.textContent = ch;
    if (i >= redFrom && i < redTo) s.style.color = '#e3262f';
    el.appendChild(s); arr.push(s);
  });
  el._ch = arr;
  return arr;
}
// letters rise + unblur, staggered; out: 0..1 exit progress
function letters(el, t, t0, dur = .55, stag = .03, out = 0, mode = 'rise') {
  const ch = el._ch;
  ch.forEach((s, i) => {
    const u = seg(t, t0 + i * stag, t0 + i * stag + dur);
    const e = eoq(u);
    let y = (1 - e) * 46, b = (1 - e) * 10, o = cl(u * 2.2), sc = 1;
    if (mode === 'drop') { y = -(1 - back(u, 1.4)) * 60; }
    if (mode === 'scale') { sc = lerp(1.8, 1, back(u, 1.3)); y = 0; }
    const ou = seg(out, i / ch.length * .5, i / ch.length * .5 + .5);
    y -= eic(ou) * 40; b += ou * 12; o *= 1 - ou;
    s.style.transform = `translateY(${y.toFixed(2)}px) scale(${sc.toFixed(3)})`;
    s.style.opacity = o.toFixed(3);
    s.style.filter = b > .35 ? `blur(${b.toFixed(2)}px)` : 'none';
  });
}

// ---------- cubic Hermite camera spline (Catmull-Rom with non-uniform times) ----------
function spline(keys, t, prop) {
  if (t <= keys[0].t) return keys[0][prop];
  const n = keys.length;
  if (t >= keys[n - 1].t) return keys[n - 1][prop];
  let i = 0; while (t > keys[i + 1].t) i++;
  const k0 = keys[i], k1 = keys[i + 1];
  const tan = j => {
    if (j === 0 || j === n - 1) return 0;
    return (keys[j + 1][prop] - keys[j - 1][prop]) / (keys[j + 1].t - keys[j - 1].t);
  };
  const h = k1.t - k0.t, u = (t - k0.t) / h;
  const m0 = tan(i) * h, m1 = tan(i + 1) * h;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * k0[prop] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * k1[prop] + (u3 - u2) * m1;
}
const camAt = (keys, t) => ({ x: spline(keys, t, 'x'), y: spline(keys, t, 'y'), z: spline(keys, t, 'z'), roll: spline(keys, t, 'roll'), yaw: spline(keys, t, 'yaw') });

// ---------- layout constants ----------
const AGC0 = { x: -330, y: 40 }, AGCC = { x: -600, y: -40, s: .78 };
const PH0 = { x: 760, y: 20 }, PHC = { x: 600, y: -40, s: .82 };
const CX = 0, CY = 3200; // lunar-card region of the studio world
const DISP = { dx: -25, dy: -88 }; // display centre offset inside AGC svg (unscaled)

const spaceKeys = [
  { t: 0, x: -60, y: 30, z: -180, roll: -2.2, yaw: 2 },
  { t: 1.6, x: -10, y: 5, z: -40, roll: -.6, yaw: .6 },
  { t: 3.35, x: 30, y: -10, z: 70, roll: 1.2, yaw: -1 },
];
const studioKeys = [
  { t: 3.75, x: -150, y: 40, z: -90, roll: 2, yaw: 1.5 },
  { t: 5.2, x: -110, y: 20, z: -20, roll: .8, yaw: .8 },
  { t: 7.6, x: -20, y: 0, z: 70, roll: -.4, yaw: -.4 },
  { t: 9.7, x: 60, y: -10, z: 110, roll: -1, yaw: -1 },
  { t: 10.45, x: 640, y: 0, z: 90, roll: -2.2, yaw: -2 },
  { t: 11.7, x: 760, y: 10, z: 130, roll: -.6, yaw: -.8 },
  { t: 12.8, x: 20, y: 40, z: -250, roll: .3, yaw: 0 },
  { t: 14.75, x: -40, y: 30, z: -190, roll: .8, yaw: .6 },
];
const cardKeys = [
  { t: 18.0, x: CX - 20, y: CY + 10, z: -30, roll: -.8, yaw: 0 },
  { t: 20.0, x: CX + 10, y: CY, z: 10, roll: .4, yaw: 0 },
  { t: 22.4, x: CX + 30, y: CY + 20, z: -80, roll: .6, yaw: 0 },
  { t: 24.6, x: CX + 10, y: CY + 10, z: -40, roll: -.4, yaw: 0 },
  { t: 26.3, x: CX - 10, y: CY, z: -60, roll: -.8, yaw: 0 },
];

function studioCam(t) {
  if (t < 14.75) {
    const c = camAt(studioKeys, t);
    // whip-in from the space world: continues the upward move
    c.y += -1300 * (1 - eoq(seg(t, 3.75, 4.35)));
    return c;
  }
  if (t < 16.0) { // push into AGC display
    const a = camAt(studioKeys, 14.75);
    const u = eic(seg(t, 14.75, 16.0));
    const tx = AGCC.x + DISP.dx * AGCC.s, ty = AGCC.y + DISP.dy * AGCC.s;
    const ux = eio2(seg(t, 14.75, 15.7));
    return { x: lerp(a.x, tx, ux), y: lerp(a.y, ty, ux), z: lerp(a.z, 1060, u), roll: lerp(a.roll, 0, ux), yaw: lerp(a.yaw, 0, ux) };
  }
  if (t < 18.0) { // card full-frame then pull out
    const u = seg(t, 16.0, 18.0);
    const e = 1 - Math.pow(1 - u, 2.4);
    const b = cardKeys[0];
    return { x: lerp(CX, b.x, e), y: lerp(CY, b.y, e), z: lerp(400, b.z, e), roll: lerp(0, b.roll, e), yaw: 0 };
  }
  const c = camAt(cardKeys, Math.min(t, 26.3));
  if (t > 26.3) { // final pull-back
    const u = eio(seg(t, 26.3, 27.6));
    c.z = lerp(c.z, -1150, u); c.roll += u * 2.5; c.y += u * 60;
  }
  return c;
}

// ---------- canvases ----------
let lunarCtx, grainCtx, grainImg;
const craters = [];
const lunarStars = [];
function initCanvases() {
  // star field
  const sc = $('stars').getContext('2d');
  const r = rnd(7);
  sc.fillStyle = 'rgba(0,0,0,0)'; sc.clearRect(0, 0, 2600, 1600);
  for (let i = 0; i < 900; i++) {
    const x = r() * 2600, y = r() * 1600, s = Math.pow(r(), 3) * 2.6 + .4, a = .25 + r() * .75;
    sc.fillStyle = `rgba(${200 + r() * 55 | 0},${210 + r() * 45 | 0},255,${a})`;
    sc.beginPath(); sc.arc(x, y, s, 0, 7); sc.fill();
    if (s > 2.4) { sc.fillStyle = `rgba(190,205,255,${a * .15})`; sc.beginPath(); sc.arc(x, y, s * 4, 0, 7); sc.fill(); }
  }
  lunarCtx = $('lunar').getContext('2d');
  const r2 = rnd(42);
  for (let i = 0; i < 90; i++) craters.push({ gx: (r2() * 2 - 1) * 2600, gz: r2() * 3000, r: 30 + Math.pow(r2(), 2) * 240 });
  for (let i = 0; i < 160; i++) lunarStars.push({ x: r2() * 1400 - 60, y: r2() * 330, s: r2() * 1.6 + .3, a: r2() * .7 + .2 });
  grainCtx = $('grain').getContext('2d');
  grainImg = grainCtx.createImageData(960, 540);
}
function drawGrain(f) {
  const r = rnd(1000 + f * 13), d = grainImg.data;
  for (let i = 0; i < d.length; i += 4) { const v = 128 + (r() - .5) * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  grainCtx.putImageData(grainImg, 0, 0);
}
function drawLunar(t) {
  const c = lunarCtx, W = 1280, H = 720;
  const k = t - 15.6;
  const alarm = t >= 19.0 && t < 21.9;
  const shake = t >= 19.0 ? wob(t - 19.0, 9, 4) * 10 : 0;
  c.save();
  c.fillStyle = '#020307'; c.fillRect(0, 0, W, H);
  c.translate(W / 2 + shake, H / 2);
  c.rotate(0.05 * Math.sin(k * .7) - .03);
  c.translate(-W / 2, -H / 2);
  const hy = 238 + 14 * Math.sin(k * .5);
  for (const s of lunarStars) { c.fillStyle = `rgba(220,228,255,${s.a})`; c.fillRect(s.x, s.y + (hy - 238) * .3, s.s, s.s); }
  // Earth
  c.fillStyle = '#2b6be0'; c.beginPath(); c.arc(1010, 110, 26, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.arc(1002, 104, 11, 0, 7); c.fill();
  c.fillStyle = '#020307'; c.beginPath(); c.arc(1024, 102, 25, 0, 7); c.fill();
  // ground
  const g = c.createLinearGradient(0, hy, 0, H + 100);
  g.addColorStop(0, '#3e3d3b'); g.addColorStop(.25, '#6c6964'); g.addColorStop(1, '#b3aea4');
  c.fillStyle = g;
  c.beginPath(); c.moveTo(-200, hy + 30); c.quadraticCurveTo(W / 2, hy - 18, W + 200, hy + 30); c.lineTo(W + 200, H + 200); c.lineTo(-200, H + 200); c.fill();
  // craters in perspective, flying toward camera
  const f = 380, camH = 260, speed = 420, L = 3000;
  const vis = craters.map(cr => {
    let z = ((cr.gz - speed * k) % L + L) % L + 120;
    return { z, cr };
  }).sort((a, b) => b.z - a.z);
  for (const { z, cr } of vis) {
    const sx = W / 2 + cr.gx * f / z, sy = hy + camH * f / z, R = cr.r * f / z;
    if (sy > H + R || sx < -R * 2 || sx > W + R * 2) continue;
    const fade = cl((3000 - z) / 900);
    c.globalAlpha = fade;
    c.fillStyle = 'rgba(40,38,36,.55)'; c.beginPath(); c.ellipse(sx, sy, R, R * .3, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(205,200,190,.5)'; c.beginPath(); c.ellipse(sx, sy + R * .07, R * .92, R * .2, 0, 0, Math.PI); c.fill();
    c.fillStyle = 'rgba(70,67,63,.7)'; c.beginPath(); c.ellipse(sx, sy - R * .03, R * .82, R * .2, 0, 0, 7); c.fill();
  }
  c.globalAlpha = 1;
  c.restore();
  // HUD
  const hud = alarm ? '#ff4b52' : '#5dff82';
  c.strokeStyle = hud; c.fillStyle = hud; c.lineWidth = 3;
  c.font = '700 26px M'; c.textBaseline = 'top';
  const alt = Math.max(0, 1900 - 150 * k), vs = 22 + 3 * Math.sin(k * 2);
  c.fillText('ВЫСОТА', 56, 50); c.font = '800 54px M'; c.fillText(`${Math.round(alt)} м`, 56, 82);
  c.font = '700 26px M'; c.fillText('СКОРОСТЬ СНИЖЕНИЯ', 56, 158); c.font = '800 42px M'; c.fillText(`${vs.toFixed(1)} м/с`, 56, 190);
  c.globalAlpha = .9;
  c.beginPath(); c.arc(W / 2, H / 2 + 20, 46, 0, 7); c.moveTo(W / 2 - 90, H / 2 + 20); c.lineTo(W / 2 - 56, H / 2 + 20); c.moveTo(W / 2 + 56, H / 2 + 20); c.lineTo(W / 2 + 90, H / 2 + 20); c.moveTo(W / 2, H / 2 - 50); c.lineTo(W / 2, H / 2 - 36); c.stroke();
  c.globalAlpha = 1;
  c.font = '700 24px M'; c.textAlign = 'right'; c.fillText('APOLLO 11 · PROG 63', W - 56, 52); c.textAlign = 'left';
  if (alarm) {
    const on = Math.floor((t - 19.0) * 2.5) % 2 === 0;
    c.fillStyle = on ? 'rgba(255,60,70,.9)' : 'rgba(255,60,70,.35)';
    c.fillRect(W - 300, 96, 244, 70);
    c.fillStyle = '#fff'; c.font = '900 40px M'; c.textAlign = 'center'; c.fillText('ALARM', W - 178, 112); c.textAlign = 'left';
  }
  // descent progress bar
  c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(56, H - 70, W - 112, 8);
  c.fillStyle = hud; c.fillRect(56, H - 70, (W - 112) * cl(k / 12), 8);
}

// ---------- AGC keys ----------
function buildKeys() {
  const labels = [['VERB', '+', '7', '8', '9', 'CLR', 'ENTR'], ['NOUN', '−', '4', '5', '6', 'PRO', 'RSET'], ['', '0', '1', '2', '3', 'KEY', 'REL']];
  let solid = '', wire = '';
  labels.forEach((row, r) => row.forEach((lab, c) => {
    const x = 61 + c * 56, y = 304 + r * 74;
    if (!lab) return;
    const fs = lab.length > 2 ? 11 : 22;
    solid += `<rect x="${x}" y="${y + 4}" width="52" height="62" rx="7" fill="#1b1c1f"/><rect x="${x}" y="${y}" width="52" height="60" rx="7" fill="url(#keyG)"/><text x="${x + 26}" y="${y + 30 + fs * .36}" font-size="${fs}">${lab}</text>`;
    wire += `<rect x="${x}" y="${y}" width="52" height="60" rx="7"/>`;
  }));
  $('keys').innerHTML = solid; $('wkeys').innerHTML = wire;
}

let readyResolve;
window.ready = new Promise(r => readyResolve = r);
let prioUL = { x: 0, w: 600 };
document.fonts.ready.then(async () => {
  await Promise.all(['500', '700', '800', '900'].map(w => document.fonts.load(`${w} 40px M`)));
  buildKeys(); initCanvases();
  split($('y1969'), '1969');
  split($('hook'), 'Этого не должно было сработать');
  split($('agcLabel'), 'БОРТОВОЙ КОМПЬЮТЕР «АПОЛЛОНА»');
  split($('phoneLabel'), 'ТВОЙ ТЕЛЕФОН');
  split($('mult'), '×2 000 000');
  split($('multCap'), 'в 2 миллиона раз больше памяти');
  split($('alarm'), '1202');
  split($('alarmCap'), 'ПЕРЕГРУЗКА');
  split($('tHead'), 'Он отбросил лишнее');
  split($('ringCap'), 'ПОСАДКА');
  split($('ringDate'), '20 июля 1969');
  split($('f1'), 'Дело не в мощности.');
  const f2 = split($('f2'), 'А в приоритетах.', 4, 15);
  // underline geometry for the red word
  place($('f2'), { op: 1 });
  const a = f2[4].getBoundingClientRect(), b = f2[14].getBoundingClientRect(), whole = $('f2').getBoundingClientRect();
  prioUL = { x: (a.left + b.right) / 2 - (whole.left + whole.right) / 2, w: b.right - a.left };
  $('f2ul').style.width = prioUL.w + 'px';
  for (const id of ['x1', 'x2']) { const p = $(id); const L = p.getTotalLength(); p.style.strokeDasharray = L; p._L = L; }
  readyResolve(true);
});

// ---------- main render ----------
window.render = function (t, frame = 0) {
  // ===== global overlays =====
  $('black').style.opacity = (1 - eoc(seg(t, 0, .45))).toFixed(3);
  const inSpace = t < 3.75;
  $('space').style.visibility = inSpace ? 'visible' : 'hidden';
  $('studio').style.opacity = inSpace ? 0 : 1;
  $('studio').style.visibility = inSpace ? 'hidden' : 'visible';

  // ===== SPACE =====
  if (inSpace) {
    CAMZ = 0;
    const c = camAt(spaceKeys, t);
    c.y += 1600 * eic(seg(t, 3.3, 3.75));
    c.roll += 3 * eic(seg(t, 3.3, 3.75));
    CAMZ = c.z;
    camT($('spw'), c);
    place($('stars'), { x: 0, y: 0, z: -900, s: 1.05, rz: t * .6 });
    place($('moon'), { x: 520, y: -60, z: -420, rz: -8 + t * 1.2 });
    const y1 = $('y1969');
    place(y1, { x: -40, y: -60, z: 40 });
    y1._ch.forEach((s, i) => {
      const t0 = .3 + i * .13, u = seg(t, t0, t0 + .5);
      const yy = -(1 - back(u, 1.5)) * 420, bl = (1 - eoq(u)) * 14;
      const sq = 1 + .12 * wob(t - t0 - .38, 3, 7);
      s.style.transform = `translateY(${yy.toFixed(1)}px) scale(${(1 / sq).toFixed(3)},${sq.toFixed(3)})`;
      s.style.opacity = cl(u * 3).toFixed(3);
      s.style.filter = bl > .35 ? `blur(${bl.toFixed(1)}px)` : 'none';
    });
    place($('hook'), { x: -40, y: 140, z: 60 });
    letters($('hook'), t, 1.25, .5, .022);
  }

  // ===== STUDIO =====
  if (!inSpace) {
    const cam = studioCam(t);
    CAMZ = cam.z;
    camT($('sw'), cam);
    place($('bgplane'), { x: cam.x * .55, y: cam.y * .55, z: -700 });
    place($('sil'), { x: -100 + (t < 16 ? 0 : 99999), y: 330, z: -450, op: t < 16 ? .9 : 0 });

    // ---------- AGC ----------
    const agcIn = seg(t, 3.75, 4.75);
    const land = back(agcIn, 1.25);
    const toComp = eio(seg(t, 12.0, 12.9));
    const backOff = eio(seg(t, 10.0, 10.6)) * (1 - toComp); // pushed back when phone enters
    let ax = lerp(-1150, AGC0.x, land), ay = lerp(620, AGC0.y, land);
    ax = lerp(ax, AGCC.x, toComp); ay = lerp(ay, AGCC.y, toComp);
    const as = lerp(1, AGCC.s, toComp);
    const az = -170 * backOff;
    const float = Math.sin(t * 1.3) * 6 * cl(agcIn * 2);
    const arz = lerp(-28, 0, eoc(agcIn)) + 4 * wob(t - 4.6, 2.2, 4.5);
    const ary = lerp(35, -10, eoc(agcIn)) + 6 * Math.sin(t * .5) * cl(agcIn);
    const agcHide = t > 16.05;
    place($('agc'), { x: ax, y: ay + float, z: az, s: as, rz: arz, ry: ary, op: agcHide ? 0 : 1, blur: backOff * 11 + (1 - eoc(agcIn)) * 6 });
    place($('agcShadow'), { x: ax + 20, y: ay + 300 * as, z: az - 1, s: as * (1 - float / 200), op: agcHide ? 0 : cl((agcIn - .7) * 3.3) * .9, blur: 4 + backOff * 8 });
    const mat = eio(seg(t, 4.75, 5.7));
    $('agcSolid').style.clipPath = `inset(0 ${(100 - mat * 100).toFixed(2)}% 0 0)`;
    $('agcWire').style.opacity = (1 - mat * .97).toFixed(3);
    // live display numbers
    const n = Math.floor(t * 12);
    $('dR1').textContent = '+' + String(4512 - Math.floor(t * 37) % 4000).padStart(5, '0');
    $('dR2').textContent = '-' + String(97 + (n * 7) % 13).padStart(5, '0');
    $('dR3').textContent = '+' + String(18430 - Math.floor(t * 61)).padStart(5, '0');

    const labOut = seg(t, 9.9, 10.3);
    place($('agcLabel'), { x: AGC0.x, y: AGC0.y - 330, z: 30, op: t < 10.5 ? 1 : 0 });
    letters($('agcLabel'), t, 4.95, .5, .018, labOut);

    // stat 4 KB
    const kbIn = seg(t, 5.95, 6.5);
    let kx = lerp(420, 300, eoq(kbIn)), ky = -80, kz = 60, ks = 1;
    const kbBack = eio(seg(t, 9.95, 10.5)) * (1 - toComp);
    kx = lerp(kx, AGCC.x, toComp); ky = lerp(ky, AGCC.y + 300, toComp); kz = lerp(kz - 220 * kbBack, 20, toComp); ks = lerp(1, .9, toComp);
    $('stKBul').style.transform = `scaleX(${eoq(seg(t, 6.25, 6.7)).toFixed(3)})`;
    // weight chip
    const kgIn = seg(t, 7.45, 7.95);
    const kgOut = eio(seg(t, 9.9, 10.35));
    place($('stKG'), { x: 300 + kgOut * 160, y: 130 + 3 * Math.sin(t * 1.7), z: 90 - kgOut * 120, s: back(kgIn, 2.2) * (1 - kgOut * .2), rz: -6 * (1 - eoc(kgIn)) + 2 * wob(t - 7.8, 2, 4), op: cl(kgIn * 3) * (1 - kgOut), blur: kgOut * 14 });

    // ---------- PHONE ----------
    const phIn = seg(t, 10.0, 10.75);
    const pl = back(phIn, 1.15);
    let px = lerp(1900, PH0.x, pl), py = PH0.y;
    px = lerp(px, PHC.x, toComp); py = lerp(py, PHC.y, toComp);
    const ps = lerp(1, PHC.s, toComp);
    const pfloat = Math.sin(t * 1.1 + 1) * 7 * cl(phIn * 2);
    const pry = lerp(-50, -14, eoc(phIn)) + 5 * wob(t - 10.6, 2, 4) + toComp * 6;
    const prz = lerp(18, 4, eoc(phIn)) - 3 * wob(t - 10.6, 2.4, 4.5);
    const phHide = t > 16.05 || t < 9.9;
    place($('phone'), { x: px, y: py + pfloat, z: 40, s: ps, ry: pry, rz: prz, op: phHide ? 0 : 1, blur: (1 - eoq(phIn)) * 14 + eio(seg(t, 14.9, 15.5)) * 10 });
    place($('phoneShadow'), { x: px + 10, y: py + 315 * ps, z: 39, s: ps, op: phHide ? 0 : cl((phIn - .6) * 2.5) * .8, blur: 4 });
    place($('phoneLabel'), { x: PH0.x, y: PH0.y - 360, z: 30, op: (t > 10.3 && t < 12.5) ? 1 : 0 });
    letters($('phoneLabel'), t, 10.45, .45, .022, seg(t, 12.0, 12.4));
    const gbIn = seg(t, 10.75, 11.2);
    let gx = lerp(1260, 1180, eoq(gbIn)), gy = -60;
    gx = lerp(gx, PHC.x, toComp); gy = lerp(gy, PHC.y + 300, toComp);
    place($('stGB'), { x: gx, y: gy, z: lerp(60, 20, toComp), s: lerp(1, .9, toComp), op: (t > 16.05 ? 0 : cl(gbIn * 2.5)), blur: (1 - eoq(gbIn)) * 14 + eio(seg(t, 14.9, 15.5)) * 10 });
    const cnt = eoc(seg(t, 10.85, 11.9));
    $('gbNum').textContent = Math.max(1, Math.round(cnt * 8));
    $('stGBul').style.transform = `scaleX(${eoq(seg(t, 11.9, 12.35)).toFixed(3)})`;
    // mult
    const mIn = seg(t, 12.95, 13.45);
    const mOut = seg(t, 14.85, 15.35);
    place($('mult'), { x: 0, y: -60, z: 120, s: lerp(2.4, 1, back(mIn, 1.5)), op: cl(mIn * 4) * (1 - mOut), blur: (1 - eoq(mIn)) * 22 + mOut * 20 });
    place($('multCap'), { x: 0, y: 70, z: 110, op: (t > 13.2 && t < 15.6) ? 1 - mOut : 0 });
    letters($('multCap'), t, 13.3, .45, .016, mOut);
    place($('stKB'), { x: kx, y: ky, z: kz, s: ks, op: (t > 16.05 ? 0 : cl(kbIn * 2.5) * (1 - .75 * kbBack) * (1 - eio(seg(t, 14.9, 15.4)))), blur: (1 - eoq(kbIn)) * 16 + kbBack * 12 + eio(seg(t, 14.9, 15.4)) * 10 });

    // ---------- LUNAR CARD ----------
    const cardOn = t >= 15.95;
    if (cardOn) drawLunar(t);
    const cu = eio(seg(t, 16.0, 18.2));
    const toTask = eio(seg(t, 21.7, 22.6));
    const shake = t >= 19.0 ? wob(t - 19.0, 7, 4.5) : 0;
    const outF = eio(seg(t, 26.3, 27.4));
    place($('card'), {
      x: CX + lerp(0, -430, toTask) + shake * 14, y: CY + lerp(0, 30, toTask) + Math.sin(t * .9) * 6 * cu - shake * 6, z: lerp(0, -40, toTask),
      s: lerp(1, .64, toTask), ry: lerp(0, -13, cu) + lerp(0, 5, toTask) + Math.sin(t * .45) * 2 * cu, rx: lerp(0, 5, cu) + Math.sin(t * .6) * 1.2 * cu, rz: lerp(0, -1.5, cu) + shake * 1.5,
      op: cardOn ? 1 : 0, blur: outF * 22
    });
    const fl = t >= 19.0 ? Math.max(0, wob(t - 19.0, 0, 3.5)) * .32 * (Math.cos((t - 19.0) * Math.PI * 4) * .5 + .5) : 0;
    $('cardFlash').style.opacity = fl.toFixed(3);
    const alIn = seg(t, 19.0, 19.35), alOut = seg(t, 21.55, 21.95);
    place($('alarm'), { x: CX + 360, y: CY - 70, z: 220 + alOut * 300, s: lerp(2.2, 1, back(alIn, 1.6)) * (1 + .03 * Math.sin(t * 8) * (1 - alOut)), rz: -4 + 3 * wob(t - 19.3, 3, 5), op: cl(alIn * 4) * (1 - alOut), blur: (1 - eoq(alIn)) * 20 + alOut * 24 });
    place($('alarmCap'), { x: CX + 360, y: CY + 100, z: 220 + alOut * 200, op: (t > 19.3 && t < 22) ? 1 : 0 });
    letters($('alarmCap'), t, 19.4, .4, .03, alOut);

    // ---------- TASKS ----------
    const RX = CX + 450;
    place($('tHead'), { x: RX - 10, y: CY - 330, z: 60, op: (t > 21.9 && t < 27.6) ? 1 : 0, blur: outF * 10 });
    letters($('tHead'), t, 22.0, .5, .025);
    const chipY = [-190, -50, 90];
    ['t1', 't2', 't3'].forEach((id, i) => {
      const t0 = 22.3 + i * .14;
      const u = seg(t, t0, t0 + .55);
      let x = RX + lerp(260, 0, back(u, 1.3)), y = CY + chipY[i], rz = lerp(8, 0, eoc(u)), op = cl(u * 3), bl = (1 - eoq(u)) * 14;
      if (i === 2) {
        const fu = seg(t, 23.6, 24.35);
        y += 1000 * eic(fu); rz += 35 * eic(fu); x += 80 * fu; bl += 10 * fu; op *= 1 - seg(t, 24.0, 24.35);
        const s1 = eoq(seg(t, 23.05, 23.3)), s2 = eoq(seg(t, 23.22, 23.47));
        $('x1').style.strokeDashoffset = ($('x1')._L * (1 - s1)).toFixed(1);
        $('x2').style.strokeDashoffset = ($('x2')._L * (1 - s2)).toFixed(1);
        rz += 3 * wob(t - 23.3, 4, 6);
      } else {
        const ok = $(id).querySelector('.ok');
        const ou = seg(t, 23.85 + i * .15, 24.25 + i * .15);
        ok.style.transform = `scale(${back(ou, 2.4).toFixed(3)})`;
        ok.style.opacity = cl(ou * 3).toFixed(3);
        y += lerp(0, 20, eio(seg(t, 24.1, 24.6)));
      }
      place($(id), { x, y: y + Math.sin(t * 1.4 + i) * 3, z: 40, rz, s: 1.22, op: (t > 27.6 ? 0 : op), blur: bl + outF * 10 });
    });
    const rIn = seg(t, 24.3, 24.75);
    place($('ring'), { x: RX - 10, y: CY + 190, z: 50, s: back(rIn, 1.8) * .78, rz: lerp(-30, 0, eoc(rIn)), op: (t > 27.6 ? 0 : cl(rIn * 3)), blur: outF * 10 });
    const pr = eio2(seg(t, 24.5, 25.7));
    $('ringArc').style.strokeDashoffset = (804.25 * (1 - pr)).toFixed(2);
    $('ringTxt').textContent = Math.round(pr * 100) + '%';
    place($('ringCap'), { x: RX - 10, y: CY + 345, z: 50, op: (t > 25.4 && t < 27.6) ? 1 : 0, blur: outF * 10 });
    letters($('ringCap'), t, 25.55, .4, .03);
    place($('ringDate'), { x: RX - 10, y: CY + 392, z: 50, op: (t > 25.7 && t < 27.6) ? 1 : 0, blur: outF * 10 });
    letters($('ringDate'), t, 25.8, .4, .02);
  }

  // ===== FINAL =====
  const fon = t > 26.5;
  $('final').style.visibility = fon ? 'visible' : 'hidden';
  if (fon) {
    CAMZ = 0;
    const u = seg(t, 26.6, 30);
    $('fw').style.transform = `rotateZ(${lerp(-.6, .5, u).toFixed(3)}deg) translateZ(${lerp(-40, 30, eio2(u)).toFixed(2)}px)`;
    place($('f1'), { x: 0, y: -80, z: 0 });
    letters($('f1'), t, 26.75, .55, .028);
    place($('f2'), { x: 0, y: 70, z: 0 });
    letters($('f2'), t, 27.65, .55, .03);
    const ul = eoq(seg(t, 28.3, 28.75));
    place($('f2ul'), { x: prioUL.x - prioUL.w / 2 * (1 - ul), y: 146, z: 0, sx: ul, sy: 1, op: ul > 0 ? 1 : 0 });
  }

  // studio dims behind the final text
  if (!inSpace) {
    const d = eio(seg(t, 26.4, 27.3));
    $('sw').style.opacity = (1 - d * .72).toFixed(3);
  }
  // display fill for the push-through + white flash on the whip
  const df = t < 16 ? eic(seg(t, 15.55, 16.0)) : 1 - eoc(seg(t, 16.0, 16.4));
  $('dispFill').style.opacity = df.toFixed(3);
  const wf = Math.max(0, 1 - Math.abs(t - 3.75) / .12) * .55;
  $('flash').style.opacity = wf.toFixed(3);
  drawGrain(frame);
};
