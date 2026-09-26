/*
 * Soundtrack for the NextQuest promo: an original score, foley and the mix,
 * all synthesized in JavaScript and rendered with an OfflineAudioContext.
 *
 * Score: F major, 100 BPM (0.6 s/beat). Beat numbers below are absolute
 * (beat b starts at b * 0.6 s), so musical hits line up with scenes.js cues.
 */
"use strict";

const SR = 48000;
const BEAT = 0.6;
const bt = (b) => b * BEAT;

// ------------------------------------------------------------------ pitch
const NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(name) {
	const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
	let n = NOTE_IDX[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
	return n + (parseInt(m[3], 10) + 1) * 12;
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const hz = (name) => mtof(midi(name));

// deterministic noise so every render is identical
let _seed = 1;
function nrand() {
	_seed = (_seed * 1664525 + 1013904223) >>> 0;
	return _seed / 4294967296 * 2 - 1;
}

// ------------------------------------------------------------------ DSP helpers
function biquadCoefs(type, f, Q, gainDb = 0) {
	const w0 = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR;
	const cw = Math.cos(w0);
	const sw = Math.sin(w0);
	const alpha = sw / (2 * Q);
	const A = Math.pow(10, gainDb / 40);
	let b0, b1, b2, a0, a1, a2;
	switch (type) {
		case "lp":
			b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
			break;
		case "hp":
			b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
			break;
		case "bp":
			b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
			break;
		case "peak":
			b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
			break;
	}
	return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

/** Filter in place. `f` may be a number or a function of time (seconds) for sweeps. */
function filt(x, type, f, Q = 0.707, gainDb = 0) {
	let c = biquadCoefs(type, typeof f === "function" ? f(0) : f, Q, gainDb);
	let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
	for (let n = 0; n < x.length; n++) {
		if (typeof f === "function" && (n & 63) === 0) c = biquadCoefs(type, f(n / SR), Q, gainDb);
		const xn = x[n];
		const y = c[0] * xn + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
		x2 = x1; x1 = xn; y2 = y1; y1 = y;
		x[n] = y;
	}
	return x;
}

function buf(sec) {
	return new Float32Array(Math.max(1, Math.ceil(sec * SR)));
}

/** Attack/decay envelope multiply in place. */
function adsr(x, a, d, s, r, holdSec) {
	const A = a * SR, D = d * SR, H = holdSec * SR, R = r * SR;
	for (let n = 0; n < x.length; n++) {
		let e;
		if (n < A) e = n / A;
		else if (n < A + D) e = 1 - (1 - s) * ((n - A) / D);
		else if (n < H) e = s;
		else e = s * Math.max(0, 1 - (n - H) / R);
		x[n] *= e;
	}
	return x;
}

function fadeOut(x, sec = 0.01) {
	const N = Math.min(x.length, Math.floor(sec * SR));
	for (let k = 0; k < N; k++) x[x.length - 1 - k] *= k / N;
	return x;
}

// wavetables (band-limited) -------------------------------------------------
const TABLE_N = 4096;
const tableCache = new Map();
function table(kind, nh) {
	const key = kind + nh;
	if (tableCache.has(key)) return tableCache.get(key);
	const t = new Float32Array(TABLE_N + 1);
	for (let h = 1; h <= nh; h++) {
		let a = 0;
		if (kind === "saw") a = 1 / h;
		else if (kind === "square") a = h % 2 ? 1 / h : 0;
		else if (kind === "reed") a = h % 2 ? 1 / h : 0.35 / h;
		else if (kind === "brass") a = 1 / Math.pow(h, 0.9);
		if (!a) continue;
		for (let n = 0; n < TABLE_N; n++) t[n] += a * Math.sin((2 * Math.PI * h * n) / TABLE_N);
	}
	let mx = 0;
	for (let n = 0; n < TABLE_N; n++) mx = Math.max(mx, Math.abs(t[n]));
	for (let n = 0; n < TABLE_N; n++) t[n] /= mx;
	t[TABLE_N] = t[0];
	tableCache.set(key, t);
	return t;
}
function osc(x, kind, freqFn, gain = 1, phase0 = 0) {
	const f0 = typeof freqFn === "function" ? freqFn(0) : freqFn;
	const nh = Math.max(1, Math.min(60, Math.floor(15000 / Math.max(20, f0))));
	const t = table(kind, nh);
	let ph = phase0;
	for (let n = 0; n < x.length; n++) {
		const f = typeof freqFn === "function" ? freqFn(n / SR) : freqFn;
		ph += (f / SR) * TABLE_N;
		if (ph >= TABLE_N) ph -= TABLE_N * Math.floor(ph / TABLE_N);
		const i = ph | 0;
		const fr = ph - i;
		x[n] += gain * (t[i] + (t[i + 1] - t[i]) * fr);
	}
	return x;
}

// ------------------------------------------------------------------ instruments
/** Karplus-Strong plucked string with allpass tuning. */
function pluck(freq, dur, o = {}) {
	const x = buf(dur + (o.ring ?? 0.4));
	const P = SR / freq;
	const L = Math.max(2, Math.floor(P - 0.5 - 0.1));
	const d = P - 0.5 - L;
	const C = (1 - d) / (1 + d);
	const line = new Float32Array(L);
	// excitation: filtered noise burst (brightness) with pluck-position comb
	let lp = 0;
	const br = o.bright ?? 0.5;
	for (let k = 0; k < L; k++) {
		lp += (nrand() - lp) * (0.15 + br * 0.8);
		line[k] = lp;
	}
	let mean = 0;
	for (let k = 0; k < L; k++) mean += line[k];
	mean /= L;
	for (let k = 0; k < L; k++) line[k] -= mean;
	const pos = Math.max(1, Math.floor(L * (o.pos ?? 0.18)));
	const tmp = Float32Array.from(line);
	for (let k = 0; k < L; k++) line[k] = tmp[k] - tmp[(k + pos) % L] * 0.7;
	const decay = o.decay ?? 0.996;
	let idx = 0;
	let prev = 0;
	let apx = 0;
	let apy = 0;
	const damp = o.damp ?? 0.5;
	const holdN = Math.floor(dur * SR);
	for (let n = 0; n < x.length; n++) {
		const out = line[idx];
		const avg = damp * out + (1 - damp) * prev;
		prev = out;
		const ap = C * avg + apx - C * apy;
		apx = avg;
		apy = ap;
		// faster decay after release (palm mute)
		const dk = n < holdN ? decay : decay * 0.985;
		line[idx] = ap * dk;
		x[n] = out;
		idx = idx + 1 === L ? 0 : idx + 1;
	}
	fadeOut(x, 0.02);
	return x;
}

/** Struck-bar mallet percussion via additive partials. */
function mallet(freq, dur, partials, o = {}) {
	const len = dur + Math.max(...partials.map((p) => p[2])) * 3;
	const x = buf(Math.min(len, o.maxLen ?? 4));
	for (const [ratio, amp, dec] of partials) {
		const f = freq * ratio;
		if (f > 18000) continue;
		const w = (2 * Math.PI * f) / SR;
		const k = Math.exp(-1 / (dec * SR));
		let e = amp;
		// recursive sine oscillator (cheap)
		let s1 = Math.sin(w * -1);
		let s0 = 0;
		const c = 2 * Math.cos(w);
		for (let n = 0; n < x.length; n++) {
			const s = c * s0 - s1;
			s1 = s0;
			s0 = s;
			x[n] += s1 * e;
			e *= k;
		}
	}
	// soft attack + mallet click
	const A = Math.floor((o.attack ?? 0.002) * SR);
	for (let n = 0; n < A; n++) x[n] *= n / A;
	const clickN = Math.floor(0.004 * SR);
	for (let n = 0; n < clickN; n++) x[n] += nrand() * 0.25 * (1 - n / clickN) * (o.click ?? 1);
	fadeOut(x, 0.03);
	return x;
}
const GLOCK = [
	[1, 1, 1.4],
	[2.756, 0.38, 0.35],
	[5.404, 0.18, 0.12],
	[8.933, 0.07, 0.05],
];
const CELESTA = [
	[1, 1, 1.0],
	[2, 0.22, 0.45],
	[3, 0.1, 0.2],
	[4.2, 0.05, 0.1],
];
const MARIMBA = [
	[1, 1, 0.55],
	[3.93, 0.3, 0.12],
	[9.2, 0.08, 0.04],
];
const TRIANGLE = [
	[1, 1, 1.4],
	[2.41, 0.5, 1.0],
	[3.87, 0.35, 0.7],
	[5.3, 0.2, 0.4],
];

function tuba(freq, dur, o = {}) {
	const x = buf(dur + 0.25);
	const bend = o.bend ?? 0;
	osc(x, "brass", (t) => freq * Math.pow(2, (bend * Math.min(1, t / (o.bendT ?? 0.4))) / 12) * (1 + 0.004 * Math.sin(2 * Math.PI * 5 * t)));
	filt(x, "lp", (t) => 250 + 1200 * Math.exp(-t * 6) + (o.bright ?? 0), 0.8);
	adsr(x, 0.035, 0.15, 0.7, 0.15, dur);
	return x;
}

function reed(freq, dur, o = {}) {
	const x = buf(dur + 0.12);
	osc(x, "reed", (t) => freq * (1 + 0.003 * Math.sin(2 * Math.PI * 5.5 * t)));
	filt(x, "lp", 900 + (o.bright ?? 0), 0.9);
	adsr(x, 0.018, 0.08, 0.6, 0.08, dur);
	return x;
}

function strings(freq, dur, o = {}) {
	const x = buf(dur + 0.6);
	const det = [-0.08, -0.03, 0.03, 0.08];
	det.forEach((d, i) => osc(x, "saw", (t) => freq * Math.pow(2, d / 12) * (1 + 0.003 * Math.sin(2 * Math.PI * (4.6 + i * 0.3) * t + i)), 0.25, i * 900));
	filt(x, "lp", o.cut ?? 2600, 0.7);
	filt(x, "hp", 180, 0.7);
	adsr(x, o.attack ?? 0.35, 0.2, 0.85, 0.5, dur);
	return x;
}

function brassHit(freq, dur) {
	const x = buf(dur + 0.4);
	osc(x, "brass", (t) => freq * (1 + 0.003 * Math.sin(2 * Math.PI * 5 * t)), 0.6);
	osc(x, "brass", freq * 1.004, 0.4, 1000);
	filt(x, "lp", (t) => 900 + 3500 * Math.exp(-t * 5), 0.9);
	adsr(x, 0.02, 0.25, 0.55, 0.35, dur);
	return x;
}

// drums ---------------------------------------------------------------------
function kick(o = {}) {
	const x = buf(o.len ?? 0.5);
	let ph = 0;
	const f1 = o.f1 ?? 150;
	const f2 = o.f2 ?? 46;
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		const f = f2 + (f1 - f2) * Math.exp(-t * 28);
		ph += (2 * Math.PI * f) / SR;
		x[n] = Math.sin(ph) * Math.exp(-t * (o.decay ?? 7));
	}
	for (let n = 0; n < 200; n++) x[n] += nrand() * 0.3 * (1 - n / 200);
	return x;
}
function snare(o = {}) {
	const x = buf(0.3);
	for (let n = 0; n < x.length; n++) x[n] = nrand() * Math.exp((-n / SR) * (o.decay ?? 18));
	filt(x, "bp", 2200, 0.6);
	const tone = buf(0.3);
	osc(tone, "saw", 190, 0);
	for (let n = 0; n < tone.length; n++) x[n] += Math.sin((2 * Math.PI * 185 * n) / SR) * 0.5 * Math.exp((-n / SR) * 30);
	return x;
}
function hat(decay = 60, f = 8000) {
	const x = buf(0.2);
	for (let n = 0; n < x.length; n++) x[n] = nrand() * Math.exp((-n / SR) * decay);
	filt(x, "hp", f, 0.7);
	return x;
}
function shaker() {
	const x = buf(0.14);
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		x[n] = nrand() * Math.min(1, t / 0.012) * Math.exp(-t * 32);
	}
	filt(x, "hp", 5200, 0.7);
	return x;
}
function snap() {
	const x = buf(0.18);
	for (const off of [0, 0.009, 0.019]) {
		const s = Math.floor(off * SR);
		for (let n = s; n < x.length; n++) x[n] += nrand() * Math.exp(((-(n - s)) / SR) * (off === 0.019 ? 26 : 120));
	}
	filt(x, "bp", 1500, 0.9);
	return x;
}
function woodblock(f = 900) {
	const x = mallet(f, 0.05, [
		[1, 1, 0.05],
		[1.72, 0.4, 0.03],
	]);
	return x;
}
function crash(len = 2.4) {
	const x = buf(len);
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		x[n] = nrand() * (Math.exp(-t * 1.6) * 0.8 + Math.exp(-t * 12) * 0.5);
	}
	filt(x, "hp", 4200, 0.6);
	filt(x, "peak", 7000, 1, 4);
	return x;
}
function revCymbal(len = 0.9) {
	const c = crash(len);
	c.reverse();
	for (let n = 0; n < c.length; n++) c[n] *= n / c.length;
	return c;
}
function timpani(f = 87) {
	const x = buf(1.4);
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		const fr = f * (1 + 0.05 * Math.exp(-t * 20));
		x[n] = Math.sin(2 * Math.PI * fr * t) * Math.exp(-t * 3.2) + 0.4 * Math.sin(2 * Math.PI * fr * 1.5 * t) * Math.exp(-t * 5);
	}
	for (let n = 0; n < 500; n++) x[n] += nrand() * 0.5 * (1 - n / 500);
	return x;
}

// ------------------------------------------------------------------ foley
function noise(sec) {
	const x = buf(sec);
	for (let n = 0; n < x.length; n++) x[n] = nrand();
	return x;
}
function pencil(sec) {
	const x = noise(sec);
	filt(x, "bp", 3800, 0.9);
	let ph = 0;
	let rate = 11;
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		if ((n & 2047) === 0) rate = 9 + 7 * Math.abs(nrand());
		ph += (2 * Math.PI * rate) / SR;
		const stroke = Math.pow(Math.abs(Math.sin(ph)), 0.6);
		const env = Math.min(1, t / 0.04) * Math.min(1, (sec - t) / 0.08);
		x[n] *= stroke * env * (0.6 + 0.4 * Math.abs(Math.sin(t * 3.1)));
	}
	return x;
}
function whoosh(sec = 0.6, f0 = 300, f1 = 2600) {
	const x = noise(sec);
	filt(x, "bp", (t) => {
		const u = t / sec;
		return u < 0.6 ? f0 + (f1 - f0) * (u / 0.6) : f1 - (f1 - f0) * 0.6 * ((u - 0.6) / 0.4);
	}, 1.4);
	for (let n = 0; n < x.length; n++) {
		const u = n / x.length;
		x[n] *= Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 2);
	}
	return x;
}
function pop(f = 600, sec = 0.12) {
	const x = buf(sec);
	let ph = 0;
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		const fr = f * (1 + 0.9 * Math.min(1, t / 0.03));
		ph += (2 * Math.PI * fr) / SR;
		x[n] = Math.sin(ph) * Math.exp(-t * 32) * Math.min(1, t / 0.002);
	}
	return x;
}
function boing(f = 160, sec = 0.6) {
	const x = buf(sec);
	let ph = 0;
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		const fr = f * (1 + 0.5 * Math.exp(-t * 5) * Math.sin(2 * Math.PI * 14 * t)) * (1 + 0.6 * Math.exp(-t * 12));
		ph += (2 * Math.PI * fr) / SR;
		x[n] = (Math.sin(ph) + 0.3 * Math.sin(2 * ph)) * Math.exp(-t * 5);
	}
	return x;
}
function slideWhistle(sec = 1.0, f0 = 1900, f1 = 380) {
	const x = buf(sec);
	let ph = 0;
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		const u = t / sec;
		const fr = f0 * Math.pow(f1 / f0, u) * (1 + 0.012 * Math.sin(2 * Math.PI * 6 * t));
		ph += (2 * Math.PI * fr) / SR;
		const env = Math.min(1, t / 0.05) * Math.min(1, (sec - t) / 0.08);
		x[n] = (Math.sin(ph) + 0.12 * Math.sin(2 * ph) + 0.03 * nrand()) * env;
	}
	return x;
}
function thud() {
	const k = kick({ f1: 90, f2: 32, decay: 3.2, len: 1.4 });
	const r = noise(1.4);
	filt(r, "lp", 180, 0.7);
	for (let n = 0; n < r.length; n++) k[n] += r[n] * 0.8 * Math.exp((-n / SR) * 3.5);
	// clatter of pieces settling
	for (let i = 0; i < 14; i++) {
		const s = Math.floor((0.05 + Math.pow(i / 14, 1.5) * 0.9) * SR);
		const c = woodblock(500 + Math.abs(nrand()) * 1400);
		const g = 0.25 * (1 - i / 16);
		for (let n = 0; n < c.length && s + n < k.length; n++) k[s + n] += c[n] * g;
	}
	return k;
}
function clink(f = 2600) {
	return mallet(f, 0.1, [
		[1, 1, 0.22],
		[2.4, 0.6, 0.12],
		[4.13, 0.35, 0.07],
		[5.9, 0.2, 0.04],
	], { click: 0.6 });
}
function stampSfx() {
	const x = kick({ f1: 120, f2: 60, decay: 14, len: 0.4 });
	const s = noise(0.08);
	filt(s, "bp", 1200, 0.8);
	for (let n = 0; n < s.length; n++) x[n] += s[n] * 0.9 * Math.exp((-n / SR) * 60);
	return x;
}
function clickSfx(f = 3000) {
	const x = buf(0.04);
	for (let n = 0; n < x.length; n++) x[n] = nrand() * Math.exp((-n / SR) * 400);
	filt(x, "bp", f, 1.5);
	return x;
}
function swish(sec = 0.45, f = 900) {
	const x = noise(sec);
	filt(x, "bp", (t) => f * (0.8 + 0.6 * (t / sec)), 0.8);
	for (let n = 0; n < x.length; n++) {
		const u = n / x.length;
		x[n] *= Math.sin(Math.PI * u) * (0.7 + 0.3 * Math.sin(n / 300));
	}
	return x;
}
function poof() {
	const x = noise(0.3);
	filt(x, "lp", (t) => 2500 * Math.exp(-t * 9) + 200, 0.8);
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		x[n] *= Math.min(1, t / 0.01) * Math.exp(-t * 11);
	}
	return x;
}
function popper() {
	const x = noise(0.9);
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		x[n] *= Math.exp(-t * 40) * 1.2;
	}
	filt(x, "bp", 1800, 0.6);
	// crackle
	for (let i = 0; i < 40; i++) {
		const s = Math.floor((0.05 + Math.abs(nrand()) * 0.75) * SR);
		const c = clickSfx(3000 + Math.abs(nrand()) * 4000);
		for (let n = 0; n < c.length && s + n < x.length; n++) x[s + n] += c[n] * 0.35;
	}
	const k = kick({ f1: 200, f2: 80, decay: 20, len: 0.2 });
	for (let n = 0; n < k.length; n++) x[n] += k[n] * 0.6;
	return x;
}
function flutter(sec = 0.7) {
	const x = noise(sec);
	filt(x, "lp", 1400, 0.7);
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		x[n] *= (0.5 + 0.5 * Math.sin(2 * Math.PI * 13 * t)) * Math.exp(-t * 3) * Math.min(1, t / 0.05);
	}
	return x;
}
function sparkle(count = 8, base = 72, span = 1.0) {
	const x = buf(span + 1.2);
	const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
	for (let i = 0; i < count; i++) {
		const s = Math.floor(((i / count) * span + Math.abs(nrand()) * 0.03) * SR);
		const m = mallet(mtof(base + scale[(i * 3 + 1) % scale.length]), 0.1, GLOCK, { click: 0.3 });
		const g = 0.35 * (1 - (i / count) * 0.5);
		for (let n = 0; n < m.length && s + n < x.length; n++) x[s + n] += m[n] * g;
	}
	return x;
}

// ------------------------------------------------------------------ score
// chords by bar start beat
const CHORDS = [
	[0, "F"], [4, "F"],
	[8, "Dm"], [12, "Gm"], [14, "A7"],
	[16, "F"], [20, "Am"], [24, "Bb"], [28, "C"],
	[32, "F"], [36, "Dm"], [40, "Bb"], [44, "C"],
	[49, "F"], [53, "Dm"], [57, "Bb"], [61, "C"],
	[65, "F"], [69, "Bb"], [71, "C7"], [73, "F"],
];
const CHORD_NOTES = {
	F: ["F", "A", "C"],
	Dm: ["D", "F", "A"],
	Gm: ["G", "Bb", "D"],
	A7: ["A", "C#", "E", "G"],
	Am: ["A", "C", "E"],
	Bb: ["Bb", "D", "F"],
	C: ["C", "E", "G"],
	C7: ["C", "E", "G", "Bb"],
};
function chordAt(b) {
	let c = "F";
	for (const [s, name] of CHORDS) if (b >= s) c = name;
	return c;
}

// melody: [beat, note, lengthBeats]
const MEL_GLOCK = [
	// main theme A (bars 4-7)
	[16, "A5", 0.5], [16.5, "C6", 0.5], [17, "F6", 0.9], [18, "E6", 0.5], [18.5, "D6", 0.5], [19, "C6", 0.9],
	[20, "E5", 0.5], [20.5, "A5", 0.5], [21, "C6", 0.9], [22, "B5", 0.5], [22.5, "A5", 0.5], [23, "E5", 0.9],
	[24, "D5", 0.5], [24.5, "F5", 0.5], [25, "Bb5", 0.9], [26, "A5", 0.5], [26.5, "G5", 0.5], [27, "F5", 0.9],
	[28, "E5", 0.5], [28.5, "G5", 0.5], [29, "C6", 0.45],
	// pickup after the stamp
	[31, "C5", 0.25], [31.25, "D5", 0.25], [31.5, "E5", 0.25], [31.75, "G5", 0.25],
	// theme B (bars 8-11)
	[32, "A5", 0.5], [32.5, "C6", 0.5], [33, "F6", 0.9], [34, "G6", 0.5], [34.5, "F6", 0.5], [35, "C6", 0.9],
	[36, "D6", 0.75], [36.75, "A5", 0.25], [37, "F5", 0.9], [38, "E5", 0.5], [38.5, "F5", 0.5], [39, "A5", 0.9],
	[40, "Bb5", 0.5], [40.5, "D6", 0.5], [41, "F6", 0.9], [42, "E6", 0.5], [42.5, "D6", 0.5], [43, "C6", 0.9],
	[44, "C6", 0.9], [45, "D6", 0.9], [46, "E6", 0.9], [47, "F6", 0.9], [48, "G6", 0.9],
	[49, "A6", 1.5],
	// finale reprise (bars 16-18)
	[65, "A5", 0.5], [65.5, "C6", 0.5], [66, "F6", 0.9], [67, "E6", 0.5], [67.5, "D6", 0.5], [68, "C6", 0.9],
	[69, "D6", 0.5], [69.5, "F6", 0.5], [70, "Bb6", 0.9], [71, "C6", 0.5], [71.5, "E6", 0.5], [72, "G6", 0.5], [72.5, "Bb6", 0.5],
	[73, "A6", 2], [73, "F6", 2],
];
const MEL_CELESTA = [
	[0, "F5", 0.5], [0.5, "A5", 0.5], [1, "C6", 0.5], [1.5, "A5", 0.5], [2, "G5", 0.5], [2.5, "Bb5", 0.5], [3, "A5", 1],
	[4, "F5", 0.5], [4.5, "A5", 0.5], [5, "C6", 0.25], [5.25, "D6", 0.25],
];
const MEL_REED = [
	[8, "D4", 0.3], [8.5, "F4", 0.3], [9, "A4", 0.45], [9.5, "G#4", 0.22], [9.75, "A4", 0.22], [10, "F4", 0.3], [10.5, "D4", 0.3], [11, "E4", 0.45], [11.5, "C#4", 0.45],
	[12, "D4", 0.3], [12.5, "G4", 0.3], [13, "Bb4", 0.45], [13.5, "A4", 0.22], [13.75, "G4", 0.22], [14, "A4", 0.3], [14.5, "C#5", 0.3], [15, "E5", 0.3], [15.5, "G5", 0.4],
];
const MEL_MARIMBA = (() => {
	const out = [];
	const pat = {
		F: ["F4", "A4", "C5", "A4", "F5", "C5", "A4", "C5"],
		Dm: ["D4", "F4", "A4", "F4", "D5", "A4", "F4", "A4"],
		Bb: ["Bb3", "D4", "F4", "D4", "Bb4", "F4", "D4", "F4"],
		C: ["C4", "E4", "G4", "E4", "C5", "G4", "E4", "G4"],
	};
	for (const [start, ch] of [[49, "F"], [53, "Dm"], [57, "Bb"], [61, "C"]]) {
		pat[ch].forEach((n, i) => out.push([start + i * 0.5, n, 0.45]));
	}
	return out;
})();

// ------------------------------------------------------------------ render
async function buildSoundtrack(narrationArrayBuffer) {
	_seed = 12345;
	const len = Math.ceil(DURATION * SR);
	const ctx = new OfflineAudioContext(2, len, SR);

	// buses
	const master = ctx.createGain();
	const comp = ctx.createDynamicsCompressor();
	comp.threshold.value = -16;
	comp.knee.value = 8;
	comp.ratio.value = 3;
	comp.attack.value = 0.006;
	comp.release.value = 0.18;
	master.connect(comp);
	comp.connect(ctx.destination);

	const reverb = ctx.createConvolver();
	reverb.buffer = makeIR(ctx, 2.2);
	const revGain = ctx.createGain();
	revGain.gain.value = 0.32;
	reverb.connect(revGain);
	revGain.connect(master);

	// Events are mixed straight into stereo bus arrays in JS (thousands of
	// Web Audio nodes would make the offline render crawl); the audio graph
	// only handles narration, ducking, reverb and bus compression.
	const bus = {
		music: [new Float32Array(len), new Float32Array(len)],
		sfx: [new Float32Array(len), new Float32Array(len)],
		rev: [new Float32Array(len), new Float32Array(len)],
	};
	const dataCache = new Map();
	function play(data, when, which, gain = 1, pan = 0, rev = 0.2, key = null) {
		if (when < 0 || when > DURATION) return;
		let d;
		if (key && dataCache.has(key)) d = dataCache.get(key);
		else {
			d = data instanceof Function ? data() : data;
			if (key) dataCache.set(key, d);
		}
		const a = ((pan + 1) * Math.PI) / 4;
		const gl = Math.cos(a) * gain;
		const gr = Math.sin(a) * gain;
		const [L, R] = bus[which];
		const [RL, RR] = bus.rev;
		const s0 = Math.round(when * SR);
		const n = Math.min(d.length, len - s0);
		for (let k = 0; k < n; k++) {
			const v = d[k];
			L[s0 + k] += v * gl;
			R[s0 + k] += v * gr;
		}
		if (rev > 0) {
			const rl = gl * rev;
			const rr = gr * rev;
			for (let k = 0; k < n; k++) {
				const v = d[k];
				RL[s0 + k] += v * rl;
				RR[s0 + k] += v * rr;
			}
		}
	}
	const music = "music";
	const sfx = "sfx";
	const M = (b, fn, gain, pan, rev, key) => play(fn, bt(b), music, gain, pan, rev, key);

	// ---------------- music
	// celesta intro
	for (const [b, n, l] of MEL_CELESTA) M(b, () => mallet(hz(n), l * BEAT, CELESTA), 0.32, 0.2, 0.35, "cel" + n);
	// pizzicato bass + uke strums (intro, main sections)
	const pizzBass = (b, n, l = 0.45, g = 0.55) => M(b, () => pluck(hz(n), l * BEAT, { bright: 0.35, decay: 0.993, ring: 0.25 }), g, 0, 0.12, "pb" + n + l);
	const uke = (b, ch, g = 0.2, oct = 4) => {
		const notes = CHORD_NOTES[ch].slice(0, 3);
		notes.forEach((nm, i) => {
			const n = nm + (nm === "C" || nm === "D" || nm === "E" || nm === "C#" ? oct + 1 : oct);
			M(b + i * 0.018 / BEAT, () => pluck(hz(n), 0.25 * BEAT, { bright: 0.75, decay: 0.994, ring: 0.3, pos: 0.25 }), g, -0.35, 0.2, "uk" + n);
		});
	};
	const root = (ch, oct) => CHORD_NOTES[ch][0] + oct;
	const fifth = (ch, oct) => CHORD_NOTES[ch][2] + (["C", "D", "E", "C#"].includes(CHORD_NOTES[ch][2]) ? oct + 1 : oct);
	// intro bars 0-1 (beats 0..5)
	for (const b of [0, 1, 2, 3, 4, 5]) pizzBass(b, b % 2 ? "C3" : "F2", 0.4, 0.45);
	// grumble bars 2-3: tuba oom-pah + reed + woodblock
	const tubaLine = [[8, "D2"], [9, "A1"], [10, "D2"], [11, "A1"], [12, "G1"], [13, "D2"], [14, "A1"], [15, "E2"]];
	for (const [b, n] of tubaLine) M(b, () => tuba(hz(n), 0.42 * BEAT), 0.62, 0, 0.1, "tb" + n);
	for (let b = 8; b < 16; b++) {
		const ch = chordAt(b);
		M(b + 0.5, () => {
			const x = buf(0.3);
			for (const nm of CHORD_NOTES[ch].slice(0, 3)) {
				const p = pluck(hz(nm + "3"), 0.18, { bright: 0.4, decay: 0.99, ring: 0.1 });
				for (let n = 0; n < Math.min(x.length, p.length); n++) x[n] += p[n] * 0.5;
			}
			return x;
		}, 0.5, -0.2, 0.15, "gch" + ch);
		M(b, () => woodblock(1100), 0.22, 0.4, 0.1, "wb1");
		M(b + 0.5, () => woodblock(800), 0.16, 0.4, 0.1, "wb2");
	}
	for (const [b, n, l] of MEL_REED) M(b, () => reed(hz(n), l * BEAT), 0.3, 0.15, 0.25, "rd" + n + l);
	// build into the logo
	for (let k = 0; k < 8; k++) M(15 + k * 0.125, () => snare({ decay: 30 }), 0.08 + k * 0.03, 0.1, 0.1, "sn30");

	// main groove: bars 4-11 and 12-18
	const grooveBars = [16, 20, 24, 28, 32, 36, 40, 44, 49, 53, 57, 61, 65, 69];
	for (const start of grooveBars) {
		const beats = start === 44 ? 5 : 4;
		for (let k = 0; k < beats; k++) {
			const b = start + k;
			if (b >= 29.5 && b < 31) continue; // stamp break
			const ch = chordAt(b);
			// bass: root / fifth
			if (b < 44 || b >= 49) pizzBass(b, k % 2 === 0 ? root(ch, 2) : fifth(ch, 2), 0.45, 0.55);
			if (b >= 44 && b < 49) pizzBass(b, "C2", 0.3, 0.45);
			// walking 8th pickup on beat 4
			if (k === 3 && b < 44) pizzBass(b + 0.5, CHORD_NOTES[ch][1] + "2", 0.3, 0.35);
			// uke on the offbeats
			if (b < 44 || b >= 49) uke(b + 0.5, ch, b >= 32 && b < 44 ? 0.16 : 0.2);
			// drums
			if (k % 2 === 0) M(b, () => kick(), b >= 49 ? 0.5 : 0.42, 0, 0.02, "kick");
			else M(b, () => snap(), 0.22, -0.15, 0.25, "snap");
			M(b, () => shaker(), 0.09, 0.45, 0.05, "shk");
			M(b + 0.5, () => shaker(), 0.16, 0.45, 0.05, "shk");
		}
	}
	for (const [b, n, l] of MEL_GLOCK) M(b, () => mallet(hz(n), l * BEAT, GLOCK), 0.3, 0.25, 0.3, "gl" + n);
	for (const [b, n, l] of MEL_MARIMBA) M(b, () => mallet(hz(n), l * BEAT, MARIMBA), 0.42, -0.2, 0.2, "mr" + n);
	// strings pads: picker build and finale
	const pad = (b, len, ch, g = 0.1, oct = 3) => {
		for (const nm of CHORD_NOTES[ch].slice(0, 3)) {
			const n = nm + (nm === "C" || nm === "D" || nm === "E" ? oct + 1 : oct);
			M(b, () => strings(hz(n), len * BEAT), g, 0, 0.35, "st" + n + len);
		}
	};
	pad(40, 4, "Bb", 0.07);
	pad(44, 5, "C", 0.09);
	pad(57, 4, "Bb", 0.07);
	pad(61, 4, "C", 0.09);
	pad(65, 4, "F", 0.09);
	pad(69, 2, "Bb", 0.09);
	pad(71, 2, "C7", 0.09);
	pad(73, 5, "F", 0.1);
	// snare roll into the picker hit
	for (let k = 0; k < 24; k++) M(46 + k * 0.125, () => snare({ decay: 28 }), 0.05 + (k / 24) * 0.22, 0.1, 0.12, "sn28");
	// snare build into the flag + finale
	for (let k = 0; k < 16; k++) M(62 + k * 0.125, () => snare({ decay: 28 }), 0.05 + (k / 16) * 0.18, 0.1, 0.12, "sn28");
	// hits
	const tutti = (b, g = 0.2) => {
		for (const n of ["F3", "A3", "C4", "F4", "A4"]) M(b, () => brassHit(hz(n), 1.2 * BEAT), g * 0.55, 0, 0.3, "bh" + n);
		M(b, () => crash(), 0.28, 0.1, 0.3, "crash");
		M(b, () => timpani(87), 0.6, 0, 0.2, "timp");
		M(b, () => kick({ decay: 5 }), 0.6, 0, 0.1, "kick5");
	};
	M(16, () => crash(), 0.22, 0.1, 0.3, "crash");
	M(16, () => timpani(87), 0.35, 0, 0.2, "timp");
	tutti(49, 0.22);
	M(64, () => timpani(110), 0.45, 0, 0.2, "timp2");
	M(64, () => crash(1.2), 0.16, -0.2, 0.2, "crash12");
	tutti(65, 0.25);
	tutti(73, 0.28);
	// button ending under the iris
	M(77.8, () => pluck(hz("C4"), 0.2, { bright: 0.5 }), 0.4, 0, 0.2);
	M(78.3, () => pluck(hz("F3"), 0.4, { bright: 0.5 }), 0.5, 0, 0.3);
	M(78.3, () => mallet(hz("F6"), 0.5, GLOCK), 0.3, 0.2, 0.4);

	// ---------------- foley
	const S = (t, fn, gain, pan = 0, rev = 0.15, key = null) => play(fn, t, sfx, gain, pan, rev, key);
	// pencil drawing the party
	[0.15, 0.4, 0.65, 0.9].forEach((t, i) => S(t, () => pencil(0.55), 0.22, -0.3 + i * 0.2, 0.05));
	S(0.05, () => pencil(0.9), 0.12, 0, 0.05);
	// incoming!
	S(CUE.shadow + 0.05, () => slideWhistle(1.0), 0.28, 0.2, 0.2);
	S(CUE.thud - 0.02, () => thud(), 1.0, 0, 0.12);
	S(CUE.thud, () => tuba(hz("D2"), 0.9, { bend: -3, bendT: 0.8 }), 0.55, 0, 0.1);
	S(CUE.sign, () => boing(170), 0.25, -0.1, 0.1);
	// items landing on the pile
	for (const it of PILE_ITEMS) {
		if (it.drop === undefined) continue;
		const t = it.drop + 0.33;
		const f = it.kind === "d20" || it.kind === "d6" ? 0 : 1;
		if (f) S(t, () => pop(300 + (it.seed % 7) * 60), 0.32, 0.3, 0.1, "pop" + (it.seed % 7));
		else S(t, () => {
			const x = buf(0.4);
			for (let i = 0; i < 5; i++) {
				const w = woodblock(1500 + i * 230);
				const s = Math.floor(i * 0.06 * SR);
				for (let n = 0; n < w.length && s + n < x.length; n++) x[s + n] += w[n] * (0.6 - i * 0.1);
			}
			return x;
		}, 0.35, 0.3, 0.1, "dice");
	}
	S(CUE.someday, () => {
		const x = kick({ f1: 400, f2: 200, decay: 40, len: 0.1 });
		return x;
	}, 0.3, 0.3, 0.1);
	// whip to the logo
	S(CUE.whip1 - 0.05, () => whoosh(0.55, 250, 2800), 0.5, -0.4, 0.2);
	S(CUE.logo + 0.1, () => sparkle(9, 79, 0.8), 0.5, 0.2, 0.4);
	S(CUE.logo, () => pencil(0.7), 0.16, 0, 0.05);
	S(CUE.subtitle, () => pencil(1.3), 0.14, 0.1, 0.05);
	// monitor draws on + logo flies into the sidebar
	S(CUE.toApp, () => whoosh(0.5, 400, 2000), 0.3, 0.3, 0.2);
	S(CUE.toApp + 0.05, () => pencil(0.8), 0.18, -0.2, 0.05);
	// mouse + typing
	S(13.35, () => clickSfx(2600), 0.5, 0.2, 0.05, "click");
	for (let i = 0; i < 13; i++) S(CUE.typeStart + i * (0.7 / 13), () => clickSfx(1800 + Math.abs(nrand()) * 1500), 0.28, 0.1, 0.03);
	S(14.52, () => clickSfx(2600), 0.5, 0.2, 0.05, "click");
	S(CUE.card, () => pop(420, 0.15), 0.35, 0, 0.15);
	// stat chips
	[CUE.hours, CUE.difficulty, CUE.acclaim].forEach((t, i) => S(t - 0.03, () => pop(520 + i * 160), 0.35, 0.1 * i, 0.15));
	for (let k = 0; k < 5; k++) S(CUE.difficulty + 0.05 + k * 0.07, () => clickSfx(1200 + k * 200), 0.25, 0.2, 0.05);
	S(CUE.formula, () => pencil(0.6), 0.14, 0.1, 0.05);
	S(CUE.stamp - 0.01, () => stampSfx(), 0.9, 0, 0.12);
	// voting
	S(CUE.vote - 0.05, () => swish(0.35, 1400), 0.3, 0, 0.1);
	[0, 1, 2, 3].forEach((i) => S(CUE.vote + 0.3 + i * 0.07, () => boing(220 + i * 40, 0.45), 0.14, -0.5 + i * 0.33, 0.1));
	S(CUE.ten, () => sparkle(4, 84, 0.25), 0.35, 0, 0.3);
	for (const f of FLIGHTS) {
		S(f.t, () => swish(0.12, 3000), 0.06, 0, 0.05, "fl");
		S(f.t + f.dur, () => clink(2400 + (f.jar * 400) + (f.from * 120)), 0.3, -0.35 + f.jar * 0.35, 0.2);
	}
	S(CUE.curtain - 0.05, () => swish(0.5, 700), 0.45, 0, 0.15);
	S(CUE.lock, () => {
		const x = buf(0.2);
		const a = clickSfx(3500);
		const b2 = clickSfx(2200);
		for (let n = 0; n < a.length; n++) x[n] += a[n];
		const s = Math.floor(0.07 * SR);
		for (let n = 0; n < b2.length; n++) x[s + n] += b2[n];
		return x;
	}, 0.6, 0, 0.1);
	[0, 1, 2].forEach((i) => S(CUE.lock + 0.3 + i * 0.12, () => clink(3200 + i * 300), 0.25, -0.35 + i * 0.35, 0.2));
	S(CUE.hurt, () => sparkle(6, 81, 0.6), 0.35, 0, 0.35);
	// picker
	S(CUE.pick - 0.05, () => swish(0.35, 1400), 0.3, 0, 0.1);
	[CUE.interest, CUE.time, CUE.around].forEach((t, i) => {
		S(t - 0.05, () => pop(600 + i * 200, 0.14), 0.35, 0, 0.15);
		S(t + 0.05, () => whoosh(0.4, 600 + i * 300, 2400 + i * 300), 0.12, 0.3, 0.1);
	});
	S(CUE.hit - 0.02, () => popper(), 0.6, -0.4, 0.15);
	S(CUE.hit + 0.02, () => popper(), 0.6, 0.4, 0.15);
	S(CUE.hit + 0.1, () => sparkle(10, 84, 0.9), 0.35, 0, 0.3);
	// events
	S(CUE.events - 0.05, () => swish(0.35, 1400), 0.3, 0, 0.1);
	S(CUE.events + 0.05, () => whoosh(0.4, 1500, 500), 0.15, 0.4, 0.1);
	for (const pnt of PAINT) S(pnt.t, () => swish(0.55, 1100), 0.3, -0.3 + PAINT.indexOf(pnt) * 0.2, 0.15);
	S(CUE.paint + 1.25, () => sparkle(5, 86, 0.3), 0.35, 0, 0.3);
	S(CUE.rsvp - 0.1, () => swish(0.3, 1600), 0.25, 0.4, 0.1);
	[0, 1, 2, 3].forEach((i) => S(CUE.rsvp + 0.08 + i * 0.22, () => mallet(hz(["C6", "E6", "G6", "A5"][i]), 0.2, GLOCK), 0.35, 0.3, 0.3));
	S(CUE.calendar, () => pencil(0.5), 0.25, 0.3, 0.05);
	S(CUE.calendar + 0.35, () => boing(260, 0.4), 0.2, 0.3, 0.1);
	// dashboard
	S(CUE.dash - 0.05, () => swish(0.35, 1400), 0.3, 0, 0.1);
	[0, 1, 2, 3].forEach((i) => S(CUE.dash + 0.1 + i * 0.08, () => pop(700 + i * 90), 0.22, -0.3 + i * 0.2, 0.1));
	S(CUE.chart, () => pencil(0.8), 0.2, 0, 0.05);
	S(CUE.chart + 1.05, () => mallet(hz("C7"), 0.3, GLOCK), 0.3, 0.3, 0.3);
	// back to the mountain
	S(CUE.whip2 - 0.05, () => whoosh(0.55, 2600, 250), 0.5, 0.4, 0.2);
	for (const it of PILE_ITEMS) {
		if (it.poof === undefined) continue;
		if (it.seed % 2 === 0) S(it.poof, () => poof(), 0.2, (it.x / 600) * 0.6, 0.15, "poof");
		else S(it.poof, () => pop(700 + (it.seed % 9) * 70, 0.1), 0.14, (it.x / 600) * 0.6, 0.1, "pp" + (it.seed % 9));
	}
	[0, 1, 2, 3].forEach((i) => S(CUE.hop + i * 0.08, () => boing(200 + i * 30, 0.5), 0.18, -0.3 + i * 0.2, 0.1));
	S(CUE.flag - 0.3, () => whoosh(0.3, 1800, 600), 0.2, 0, 0.1);
	S(CUE.flag - 0.01, () => thud(), 0.35, 0, 0.1);
	S(CUE.flag + 0.02, () => flutter(0.9), 0.25, 0.2, 0.1);
	// finale
	S(CUE.finale - 0.9, () => revCymbal(0.9), 0.3, 0, 0.2);
	S(CUE.finale - 0.02, () => kick({ f1: 110, f2: 38, decay: 3, len: 1.2 }), 0.7, 0, 0.1);
	S(CUE.finale + 0.05, () => sparkle(12, 79, 1.2), 0.3, 0, 0.35);
	S(CUE.stop, () => pencil(1.35), 0.14, -0.1, 0.05);
	S(CUE.start, () => pencil(0.8), 0.14, 0.1, 0.05);
	S(CUE.start + 0.85, () => swish(0.4, 2000), 0.2, 0, 0.1);
	S(CUE.sting, () => sparkle(14, 84, 1.3), 0.4, 0, 0.4);
	S(CUE.iris, () => whoosh(1.2, 1800, 200), 0.12, 0, 0.2);

	// ---------------- graph: buses -> (duck) -> master, reverb, narration
	const busSource = (arrs, dest, gain = 1) => {
		const b = ctx.createBuffer(2, len, SR);
		b.copyToChannel(arrs[0], 0);
		b.copyToChannel(arrs[1], 1);
		const src = ctx.createBufferSource();
		src.buffer = b;
		const g = ctx.createGain();
		g.gain.value = gain;
		src.connect(g);
		g.connect(dest);
		src.start(0);
		return g;
	};
	const musicDuck = ctx.createGain();
	musicDuck.connect(master);
	busSource(bus.music, musicDuck, 0.62);
	busSource(bus.sfx, master, 0.55);
	busSource(bus.rev, reverb, 1);
	// duck music under narration
	const dg = musicDuck.gain;
	dg.setValueAtTime(1, 0);
	LINES.forEach((t0, i) => {
		const t1 = t0 + LINE_DURS[i];
		dg.setTargetAtTime(0.42, Math.max(0, t0 - 0.12), 0.05);
		dg.setTargetAtTime(1, t1 + 0.08, 0.18);
	});
	if (narrationArrayBuffer) {
		const nb = await ctx.decodeAudioData(narrationArrayBuffer.slice(0));
		const src = ctx.createBufferSource();
		src.buffer = nb;
		const voice = ctx.createGain();
		voice.gain.value = 1.0;
		src.connect(voice);
		voice.connect(master);
		const vs = ctx.createGain();
		vs.gain.value = 0.08;
		src.connect(vs);
		vs.connect(reverb);
		src.start(0);
	}

	const out = await ctx.startRendering();
	// master fade + peak normalise to -1 dBFS
	const L = out.getChannelData(0);
	const R = out.getChannelData(1);
	let pk = 0;
	for (let n = 0; n < L.length; n++) pk = Math.max(pk, Math.abs(L[n]), Math.abs(R[n]));
	const g = pk > 0 ? 0.89 / pk : 1;
	const fadeStart = Math.floor((DURATION - 0.35) * SR);
	for (let n = 0; n < L.length; n++) {
		const f = n > fadeStart ? Math.max(0, 1 - (n - fadeStart) / (L.length - fadeStart)) : 1;
		L[n] *= g * f;
		R[n] *= g * f;
	}
	return out;
}

function makeIR(ctx, sec) {
	const len = Math.floor(sec * SR);
	const ir = ctx.createBuffer(2, len, SR);
	for (let ch = 0; ch < 2; ch++) {
		const d = ir.getChannelData(ch);
		let lp = 0;
		for (let n = 0; n < len; n++) {
			const t = n / SR;
			lp += (nrand() - lp) * (0.55 - 0.4 * (t / sec));
			d[n] = lp * Math.pow(1 - t / sec, 2.2) * (t < 0.012 ? t / 0.012 : 1);
		}
	}
	return ir;
}

/** Encode an AudioBuffer as a 16-bit PCM WAV (ArrayBuffer). */
function encodeWav(ab) {
	const ch = ab.numberOfChannels;
	const n = ab.length;
	const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
	const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
	str(0, "RIFF");
	out.setUint32(4, 36 + n * ch * 2, true);
	str(8, "WAVE");
	str(12, "fmt ");
	out.setUint32(16, 16, true);
	out.setUint16(20, 1, true);
	out.setUint16(22, ch, true);
	out.setUint32(24, ab.sampleRate, true);
	out.setUint32(28, ab.sampleRate * ch * 2, true);
	out.setUint16(32, ch * 2, true);
	out.setUint16(34, 16, true);
	str(36, "data");
	out.setUint32(40, n * ch * 2, true);
	const chans = [...Array(ch)].map((_, i) => ab.getChannelData(i));
	let o = 44;
	for (let i = 0; i < n; i++)
		for (let c = 0; c < ch; c++) {
			const v = Math.max(-1, Math.min(1, chans[c][i]));
			out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
			o += 2;
		}
	return out.buffer;
}
