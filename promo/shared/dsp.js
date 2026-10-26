/*
 * Shared DSP toolkit for the NextQuest promo videos: deterministic noise,
 * biquad filters, wavetable oscillators, synthesized instruments, foley,
 * a generated reverb impulse, and a WAV encoder. Plain browser JS, no deps.
 * Each video's own score lives next to it (reel/src/reel-audio.js, …).
 */
"use strict";

const SR = 48000;

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

// ------------------------------------------------------------------ trap kit
// The reel's sound (shared with the walkthrough): drive, 808, cowbell hook,
// hard drums, game-UI blips.
const drive = (x, amt) => {
	const k = Math.tanh(amt);
	for (let n = 0; n < x.length; n++) x[n] = Math.tanh(x[n] * amt) / k;
	return x;
};
function mixInto(dst, src, at, g = 1) {
	const s0 = Math.floor(at * SR);
	for (let n = 0; n < src.length && s0 + n < dst.length; n++) dst[s0 + n] += src[n] * g;
	return dst;
}

/** Pitched 808-style cowbell: two detuned squares through a band-pass. */
function cowbell(freq, dur = 0.16) {
	const x = buf(dur + 0.12);
	osc(x, "square", freq, 0.5);
	osc(x, "square", freq * 1.4836, 0.5, 700);
	filt(x, "bp", freq * 2.1, 1.1);
	filt(x, "hp", 350, 0.7);
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		x[n] *= (Math.exp(-t * 26) * 0.7 + Math.exp(-t * 7) * 0.3) * Math.min(1, t / 0.0015);
	}
	return drive(x, 1.8);
}

/** Distorted 808: a sine with a pitch drop at the start, an optional glide, then drive. */
function bass808(freq, dur, o = {}) {
	const x = buf(dur + 0.05);
	let ph = 0;
	const glideTo = o.glideTo ?? freq;
	const glideAt = o.glideAt ?? dur;
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		let f = freq * (1 + 1.6 * Math.exp(-t * 40));
		if (t > glideAt) f = freq * Math.pow(glideTo / freq, Math.min(1, (t - glideAt) / 0.09));
		ph += (2 * Math.PI * f) / SR;
		const env = Math.min(1, t / 0.003) * Math.exp(-t * (o.decay ?? 1.4)) * Math.min(1, (dur + 0.05 - t) / 0.03);
		x[n] = Math.sin(ph) * env;
	}
	drive(x, o.drive ?? 3.2);
	filt(x, "lp", 1400, 0.7);
	return x;
}

function hardKick() {
	const x = kick({ f1: 230, f2: 52, decay: 9, len: 0.42 });
	for (let n = 0; n < 220; n++) x[n] += nrand() * 0.45 * (1 - n / 220);
	return drive(x, 2.4);
}
function hardClap() {
	const x = snap();
	const s = snare({ decay: 20 });
	for (let n = 0; n < Math.min(x.length, s.length); n++) x[n] = x[n] * 0.9 + s[n] * 0.6;
	filt(x, "hp", 250, 0.7);
	return drive(x, 2.2);
}

/** Aggressive brass-ish stab: detuned saws, filter snap, drive. */
function stab(freqs, dur = 0.3, o = {}) {
	const x = buf(dur + 0.25);
	for (const f of freqs) for (const d of [-0.12, 0, 0.12]) osc(x, "saw", f * Math.pow(2, d / 12), 0.22, f * 7 + d * 900);
	filt(x, "lp", (t) => 600 + (o.cut ?? 5200) * Math.exp(-t * (o.snap ?? 9)), 1.2);
	adsr(x, 0.004, 0.12, 0.55, 0.2, dur);
	return drive(x, o.drive ?? 2.5);
}

function riser(sec, f0 = 300, f1 = 6000) {
	const x = noise(sec);
	filt(x, "bp", (t) => f0 * Math.pow(f1 / f0, t / sec), 1.2);
	let ph = 0;
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		const u = t / sec;
		ph += (2 * Math.PI * (140 * Math.pow(9, u))) / SR;
		x[n] = (x[n] * 0.9 + (Math.sin(ph) > 0 ? 0.18 : -0.18)) * Math.pow(u, 1.6);
	}
	return x;
}
function impact() {
	const x = kick({ f1: 160, f2: 34, decay: 2.2, len: 1.8 });
	drive(x, 2.5);
	const n = noise(1.0);
	filt(n, "lp", (t) => 7000 * Math.exp(-t * 7) + 150, 0.7);
	for (let k = 0; k < n.length; k++) x[k] += n[k] * 0.8 * Math.exp((-k / SR) * 5);
	return x;
}

// game-UI sound effects ---------------------------------------------------------
/** A punchy click with a little sub thump: buttons and taps. */
function uiClick(f = 1800) {
	const x = clickSfx(f);
	const y = kick({ f1: 260, f2: 110, decay: 34, len: 0.12 });
	for (let n = 0; n < x.length; n++) y[n] += x[n] * 1.2;
	return y;
}
/** 8-bit menu "select": a square blip sweeping up. */
function uiSelect(f = 660) {
	const x = buf(0.09);
	osc(x, "square", (t) => f * (1 + 2.2 * Math.min(1, t / 0.05)), 0.5);
	for (let n = 0; n < x.length; n++) x[n] *= Math.exp((-n / SR) * 22) * Math.min(1, n / 40);
	filt(x, "lp", 6000, 0.7);
	return x;
}
/** Two-step square "confirm", like a game menu accepting a choice. */
function uiConfirm(f = 523) {
	const x = buf(0.22);
	for (const [at, mul] of [
		[0, 1],
		[0.06, 1.5],
	]) {
		const y = buf(0.1);
		osc(y, "square", f * mul, 0.45);
		for (let n = 0; n < y.length; n++) y[n] *= Math.exp((-n / SR) * 26);
		mixInto(x, y, at);
	}
	filt(x, "lp", 5000, 0.7);
	return x;
}
/** Laser zap: a saw diving in pitch. */
function zap(f0 = 2400, f1 = 160, sec = 0.16) {
	const x = buf(sec);
	osc(x, "saw", (t) => f0 * Math.pow(f1 / f0, Math.min(1, t / sec)), 0.6);
	for (let n = 0; n < x.length; n++) x[n] *= Math.pow(1 - n / x.length, 1.5);
	filt(x, "lp", 7000, 0.7);
	return x;
}
/** Glitch stutter: a tiny slice repeated. */
function glitch(f = 900) {
	const slice = buf(0.025);
	osc(slice, "square", f, 0.4);
	const nz = noise(0.025);
	for (let n = 0; n < slice.length; n++) slice[n] = (slice[n] + nz[n] * 0.3) * Math.min(1, (slice.length - n) / 60);
	const x = buf(0.16);
	for (let k = 0; k < 5; k++) mixInto(x, slice, k * 0.03, 1 - k * 0.15);
	return x;
}
/** A phone buzzing on the desk: the group chat won't stop. */
function buzz() {
	const x = buf(0.32);
	for (const at of [0, 0.17]) {
		const y = buf(0.12);
		osc(y, "square", 155, 0.5);
		for (let n = 0; n < y.length; n++) {
			const t = n / SR;
			y[n] *= (0.6 + 0.4 * Math.sin(2 * Math.PI * 38 * t)) * Math.min(1, t / 0.006) * Math.min(1, (0.12 - t) / 0.01);
		}
		filt(y, "lp", 900, 0.8);
		mixInto(x, y, at);
	}
	return x;
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
