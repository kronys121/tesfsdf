"""Procedural score + sound design for the 30 s test. Writes out/audio.wav (48 kHz stereo)."""
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
import wave, os

SR = 48000
DUR = 30.0
N = int(SR * DUR)
rng = np.random.default_rng(3)
BEAT = 0.5
GRID0 = 3.75  # downbeat of the groove = the whip cut


def t_arr(d):
    return np.arange(int(d * SR)) / SR


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype='band', fs=SR, output='sos'), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype='low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype='high', fs=SR, output='sos'), x)


def tv_lp(x, fc):
    """one-pole lowpass with per-sample cutoff array"""
    a = np.exp(-2 * np.pi * np.asarray(fc) / SR)
    y = np.zeros_like(x); s = 0.0
    for i in range(len(x)):
        s = (1 - a[i]) * x[i] + a[i] * s
        y[i] = s
    return y


def add(buf, sig, t0, gain=1.0, pan=0.0):
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    if sig.ndim == 1:
        l = np.sqrt(0.5 * (1 - pan)); r = np.sqrt(0.5 * (1 + pan))
        sig = np.stack([sig * l, sig * r], 1) * np.sqrt(2)
    j0 = max(0, -i0); i0c = max(0, i0)
    n = min(len(sig) - j0, N - i0c)
    if n > 0:
        buf[i0c:i0c + n] += sig[j0:j0 + n] * gain


def mixs(*sigs):
    L = max(len(x) for x in sigs); o = np.zeros(L)
    for x in sigs:
        o[:len(x)] += x
    return o


def note(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def saw(f, t, ph=0.0):
    return 2 * ((f * t + ph) % 1.0) - 1


# ---------------- instruments ----------------
def kick():
    t = t_arr(.45)
    f = 45 + 95 * np.exp(-t * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * 7.5)
    s += 0.25 * hp(rng.standard_normal(len(t)), 2000) * np.exp(-t * 180)
    return s


def clap():
    t = t_arr(.35)
    n = bp(rng.standard_normal(len(t)), 900, 5000)
    env = np.exp(-t * 18) * (1 + 0.6 * ((t < .012) | ((t > .02) & (t < .03))))
    return n * env * .7 + 0.2 * np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30)


def hat(open_=False):
    t = t_arr(.25 if open_ else .07)
    return hp(rng.standard_normal(len(t)), 7000) * np.exp(-t * (14 if open_ else 70))


def pad_chord(ms, d, bright=1.0):
    t = t_arr(d)
    s = np.zeros(len(t))
    for m in ms:
        for det in (-0.09, 0.0, 0.11):
            s += saw(note(m) * 2 ** (det / 12), t, rng.random())
    s = lp(s / (len(ms) * 3), 900 * bright + 300)
    env = np.minimum(1, t / .35) * np.minimum(1, (d - t) / .4)
    return s * env


def bass_note(m, d):
    t = t_arr(d)
    s = saw(note(m), t) * .6 + np.sin(2 * np.pi * note(m) * t)
    s = lp(s, 420)
    env = np.minimum(1, t / .006) * np.exp(-t * 3.0) * np.minimum(1, (d - t) / .02)
    return s * env


def pluck(m, d=.35):
    t = t_arr(d)
    s = (saw(note(m), t) * .5 + np.sin(2 * np.pi * note(m) * t))
    s = tv_lp(s, 600 + 5000 * np.exp(-t * 18))
    return s * np.exp(-t * 9) * np.minimum(1, t / .003)


def bell(f, d=1.6):
    t = t_arr(d)
    s = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * k) for r, a, k in [(1, 1, 3), (2.76, .5, 5), (5.4, .25, 8), (8.9, .1, 12)])
    return s * np.minimum(1, t / .002)


# ---------------- SFX ----------------
def whoosh(d, f0, f1, q=1.0):
    t = t_arr(d)
    n = rng.standard_normal(len(t))
    fc = f0 * (f1 / f0) ** (t / d)
    s = tv_lp(n, fc) - tv_lp(n, fc * .25)
    env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.6
    return s * env * 3.0 * q


def riser(d, f0=200, f1=6000):
    t = t_arr(d)
    n = rng.standard_normal(len(t))
    fc = f0 * (f1 / f0) ** ((t / d) ** 1.5)
    s = tv_lp(n, fc) * 1.5
    tone = np.sin(2 * np.pi * np.cumsum(110 * 2 ** (2.5 * t / d)) / SR) * .25
    env = (t / d) ** 2.2
    return (s + tone) * env


def impact(d=1.6, f0=70):
    t = t_arr(d)
    f = 34 + f0 * np.exp(-t * 9)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.2)
    crack = lp(rng.standard_normal(len(t)), 3500) * np.exp(-t * 14) * .6
    return boom + crack


def pop(f0=420, f1=980, d=.09):
    t = t_arr(d)
    f = f0 + (f1 - f0) * (t / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 40) * np.minimum(1, t / .002)


def tick(f=2600):
    t = t_arr(.03)
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 220)


def scribble(d=.22):
    t = t_arr(d)
    n = bp(rng.standard_normal(len(t)), 1800, 6000)
    jitter = 0.6 + 0.4 * np.sin(2 * np.pi * 38 * t + rng.random() * 6) ** 2
    return n * jitter * np.sin(np.pi * t / d) ** .5


def alarm_beep(d=.18):
    t = t_arr(d)
    s = np.sin(2 * np.pi * 950 * t) + .3 * np.sin(2 * np.pi * 1900 * t) + .15 * np.sin(2 * np.pi * 2850 * t)
    return s * np.minimum(1, t / .004) * np.minimum(1, (d - t) / .01)


def reverb(x, secs=1.8, wet=.25):
    t = t_arr(secs)
    out = np.zeros((len(x) + len(t) - 1, 2))
    for c in range(2):
        ir = rng.standard_normal(len(t)) * np.exp(-t * 6.5 / secs)
        ir = lp(ir, 5000); ir /= np.sqrt(np.sum(ir ** 2))
        out[:, c] = fftconvolve(x[:, c], ir)
    return out[:len(x)] * wet


# ================= MUSIC =================
music = np.zeros((N, 2)); drums = np.zeros((N, 2)); bass = np.zeros((N, 2)); pads = np.zeros((N, 2)); keys = np.zeros((N, 2))
# progression per 2 s bar starting at GRID0: Dm Bb F C
prog = [[50, 53, 57, 62], [46, 50, 53, 58], [45, 48, 53, 57], [48, 52, 55, 60]]
roots = [38, 34, 41, 36]
arp_pat = [0, 2, 3, 2, 1, 3, 2, 3]

# intro pads (0 - 3.75)
add(pads, pad_chord([50, 57, 62, 65], 2.2, .6), 0.0, .55)
add(pads, pad_chord([46, 53, 58, 62], 2.0, .7), 1.9, .55)
add(bass, np.sin(2 * np.pi * note(26) * t_arr(3.8)) * np.minimum(1, t_arr(3.8) / 1.0) * .5, 0.0, 1.0)

# groove sections: list of (start, end, mode)
sections = [(3.75, 15.75, 'full'), (16.25, 19.0, 'full'), (19.0, 21.75, 'tense'), (21.75, 26.75, 'full')]


def bar_index(t):
    return int(np.floor((t - GRID0) / 2.0 + 1e-6)) % 4


kick_times = []
for (s0, s1, mode) in sections:
    # pads per bar
    b = s0
    while b < s1 - 1e-6:
        bi = bar_index(b)
        L = min(2.0 - ((b - GRID0) % 2.0), s1 - b)
        if mode == 'tense':
            add(pads, pad_chord([50, 51, 57, 62], L + .1, .35), b, .5)
        else:
            add(pads, pad_chord(prog[bi], L + .1, 1.0), b, .42)
        b += L
    # per 8th / 16th events
    step = BEAT / 2
    k = 0
    tt = s0
    while tt < s1 - 1e-6:
        pos = round((tt - GRID0) / step)  # 16th index from grid0
        bi = bar_index(tt)
        in_beat = pos % 2 == 0
        beat_no = (pos // 2) % 4
        if mode == 'full':
            if in_beat:
                add(drums, kick(), tt, .95); kick_times.append(tt)
                if beat_no in (1, 3):
                    add(drums, clap(), tt, .38, pan=.05)
            else:
                add(drums, hat(open_=(pos % 8 == 3)), tt, .16 if pos % 8 != 3 else .12, pan=.25)
            if pos % 2 == 1:
                add(drums, hat(), tt + step / 2, .06, pan=-.3)
            # bass: 8ths, root and octave
            if in_beat or pos % 4 == 3:
                m = roots[bi] + (12 if pos % 8 == 6 else 0)
                add(bass, bass_note(m, .24), tt, .55)
            # arp plucks 16ths
            ch = prog[bi]
            m = ch[arp_pat[pos % 8]] + 12
            add(keys, pluck(m), tt, .16 if pos % 2 == 0 else .11, pan=(.35 if pos % 2 else -.35))
        else:  # tense: pulsing low bass + sparse kick
            if pos % 2 == 0:
                add(bass, bass_note(26, .22), tt, .6)
            if pos % 8 == 0:
                add(drums, kick(), tt, .8); kick_times.append(tt)
            if pos % 2 == 1:
                add(drums, hat(), tt, .07, pan=.3)
        tt += step

# ending: final chord progression at 26.75 and 27.75 (f1 / f2 reveals)
add(pads, pad_chord([46, 53, 58, 62, 65], 1.2, 1.1), 26.75, .55)
add(pads, pad_chord([50, 57, 62, 65, 69], 2.4, 1.2), 27.75, .6)
add(bass, bass_note(34, .9), 26.75, .7)
add(bass, bass_note(38, 2.2) * 1.0, 27.75, .75)
for i, m in enumerate([74, 77, 81, 86]):
    add(keys, pluck(m, .8), 27.75 + i * .125, .16, pan=(-.3 + .2 * i))
add(keys, bell(note(86), 2.2), 27.75, .10)

# sidechain ducking of bass/pads/keys by kick
env = np.ones(N)
for kt in kick_times:
    i0 = int(kt * SR); L = int(.22 * SR)
    seg_ = 1 - .55 * np.exp(-np.arange(L) / SR * 16)
    j = min(N, i0 + L)
    env[i0:j] = np.minimum(env[i0:j], seg_[:j - i0])
for b_ in (bass, pads, keys):
    b_ *= env[:, None]

# tense section: lowpass the pads/keys
def section_lp(buf, a, b, fc):
    i0, i1 = int(a * SR), int(b * SR)
    for c in range(2):
        buf[i0:i1, c] = lp(buf[i0:i1, c], fc, 4)
section_lp(pads, 19.0, 21.75, 700)

music = drums + bass * .9 + pads * .9 + keys
music += reverb(pads + keys * .8, 2.2, .28)

# ================= SFX =================
sfx = np.zeros((N, 2))
# 1969 digit landings
for i in range(4):
    add(sfx, mixs(impact(.7, 50) * .5, pop(240, 120, .12) * .4), .3 + i * .13 + .3, .45, pan=-.25 + i * .15)
add(sfx, bell(note(81), 1.4), 1.25, .05)
# whip into studio
add(sfx, riser(.9, 300, 7000), 2.9, .32)
add(sfx, whoosh(.55, 400, 6000, 1.3), 3.3, .55)
add(sfx, impact(1.4, 80), 3.75, .7)
# AGC flies in + lands
add(sfx, whoosh(.6, 300, 3000), 3.85, .35, pan=-.4)
add(sfx, mixs(impact(.6, 40) * .6, lp(rng.standard_normal(int(.08 * SR)), 2000) * .3), 4.42, .4, pan=-.3)
# materialize sweep
add(sfx, whoosh(.95, 2000, 9000, .6), 4.75, .2, pan=-.2)
# stats
add(sfx, whoosh(.35, 800, 5000), 5.95, .3, pan=.3)
add(sfx, pop(500, 1100), 6.25, .22, pan=.3)
add(sfx, pop(380, 900), 7.65, .3, pan=.35)
# phone whip
add(sfx, whoosh(.7, 300, 8000, 1.4), 9.75, .55, pan=.4)
add(sfx, impact(.5, 45) * .5, 10.3, .35, pan=.4)
# 8 GB count ticks (number increments)
u = np.linspace(0, 1, 2000)
prev = 1
for k_, uu in enumerate(u):
    v = max(1, round((1 - (1 - uu) ** 3) * 8))
    if v != prev:
        add(sfx, tick(2200 + 140 * v), 10.85 + uu * 1.05, .22, pan=.4)
        prev = v
add(sfx, pop(600, 1300), 11.95, .22, pan=.4)
# comparison layout + mult slam
add(sfx, whoosh(.8, 300, 3000), 12.0, .3)
add(sfx, whoosh(.3, 3000, 600), 12.95, .4)
add(sfx, impact(1.2, 90), 13.18, .65)
# push-in to display
add(sfx, riser(1.25, 150, 9000), 14.75, .45)
add(sfx, whoosh(.5, 600, 9000, 1.2), 15.55, .4)
add(sfx, impact(2.0, 100), 16.0, .85)
add(sfx, whoosh(1.6, 4000, 300, .7), 16.05, .25)
# lunar ambience (rumble under the card)
amb_t = t_arr(10.5)
rumble = lp(rng.standard_normal(len(amb_t)), 140, 4) * 3 * np.minimum(1, amb_t / .4) * np.minimum(1, (10.5 - amb_t) / 1.0)
add(sfx, rumble, 16.0, .35)
# 1202 alarm
add(sfx, impact(1.2, 70), 19.0, .6)
for i in range(7):
    add(sfx, alarm_beep(), 19.0 + i * .4, .22 * (1.0 if i < 2 else .6), pan=.25)
add(sfx, whoosh(.45, 4000, 400), 21.55, .3)
# tasks
add(sfx, whoosh(.8, 500, 4000), 21.7, .25, pan=-.2)
for i in range(3):
    add(sfx, pop(420 + i * 90, 950 + i * 120), 22.55 + i * .14, .22, pan=.35)
add(sfx, scribble(.22), 23.05, .32, pan=.35)
add(sfx, scribble(.22), 23.22, .32, pan=.4)
add(sfx, whoosh(.7, 3000, 250, 1.1), 23.6, .35, pan=.4)
add(sfx, bell(note(88), 1.0), 24.05, .07, pan=.35)
add(sfx, bell(note(93), 1.0), 24.2, .07, pan=.35)
add(sfx, pop(300, 700, .12), 24.5, .25, pan=.35)
# ring fill ticks accelerate, completion chime
for i in range(20):
    p = i / 19
    tt = 24.5 + 1.2 * (0.5 * (1 - np.cos(np.pi * p)))
    add(sfx, tick(1800 + 1200 * p), tt, .1 + .08 * p, pan=.35)
add(sfx, bell(note(86), 1.8), 25.7, .1, pan=.3)
add(sfx, bell(note(93), 1.8), 25.72, .07, pan=.3)
# final pull-back
add(sfx, whoosh(1.2, 6000, 300, 1.0), 26.3, .35)
add(sfx, impact(1.8, 60) * .6, 26.75, .35)
add(sfx, impact(2.6, 80), 27.75, .55)
add(sfx, whoosh(.35, 1500, 7000, .8), 28.3, .2, pan=.2)

sfx += reverb(sfx, 1.4, .18)

mix = music * .55 + sfx * .7
mix = hp(mix.T, 25).T
# end fade
fade = np.ones(N); fl = int(.8 * SR); fade[-fl:] = np.linspace(1, 0, fl) ** 2
mix *= fade[:, None]
fadein = np.minimum(1, np.arange(N) / (SR * .02)); mix *= fadein[:, None]
# soft clip + normalize
pk = np.max(np.abs(mix))
mix = np.tanh(mix / pk * 1.9) / np.tanh(1.9) * 0.89
rms = np.sqrt(np.mean(mix ** 2))
print('peak', np.max(np.abs(mix)), 'rms dBFS', 20 * np.log10(rms))
os.makedirs('out', exist_ok=True)
with wave.open('out/audio.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote out/audio.wav')
