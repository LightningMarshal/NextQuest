/*
 * Shared DSP toolkit for the NextQuest promo videos: deterministic noise,
 * biquad filters, wavetable oscillators, an electro kit (distorted saw bass,
 * detuned stabs, stomp kick, claps, hats, risers), an FM kit (glass and
 * metal tones, ticks, rims, pulse bass, digital accents), a generated
 * reverb impulse, and a WAV encoder. Plain browser JS, no deps.
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

// ------------------------------------------------------------------ building blocks
function noise(sec) {
	const x = buf(sec);
	for (let n = 0; n < x.length; n++) x[n] = nrand();
	return x;
}
function mixInto(dst, src, at, g = 1) {
	const s0 = Math.floor(at * SR);
	for (let n = 0; n < src.length && s0 + n < dst.length; n++) dst[s0 + n] += src[n] * g;
	return dst;
}

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

// ------------------------------------------------------------------ fm kit
// The promos' sound: two-operator FM tones, micro-percussion (ticks, rims,
// a round kick), a restrained pulse bass and digital accents.

/**
 * Two-operator FM voice. ratio: modulator/carrier; index decays from `index`
 * to `floor` at `indexDecay`/s; `sweep` bends the pitch from freq·sweep to
 * freq over `sweepT` seconds.
 */
function fm(freq, dur, o = {}) {
	const x = buf(dur);
	const ratio = o.ratio ?? 3.5;
	const index = o.index ?? 2.5;
	const floor = o.floor ?? 0;
	const kI = o.indexDecay ?? 9;
	const kA = o.decay ?? 7;
	const atk = o.attack ?? 0.002;
	const sweep = o.sweep ?? 1;
	const sweepT = o.sweepT ?? 0.06;
	let pc = 0;
	let pm = 0;
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		const f = freq * (sweep === 1 ? 1 : Math.pow(sweep, Math.max(0, 1 - t / sweepT)));
		pc += (2 * Math.PI * f) / SR;
		pm += (2 * Math.PI * f * ratio) / SR;
		const I = floor + (index - floor) * Math.exp(-t * kI);
		const env = Math.min(1, t / atk) * Math.exp(-t * kA) * Math.min(1, (dur - t) / 0.004);
		x[n] = Math.sin(pc + I * Math.sin(pm)) * env;
	}
	return x;
}
/** Glassy bell: inharmonic ratio, quick index fall. */
const glass = (f, dur = 0.5, g = {}) => fm(f, dur, { ratio: 3.5, index: 2.2, indexDecay: 14, decay: 6, ...g });
/** Metallic hit: non-integer ratio, high index, slower fall. */
const metal = (f, dur = 0.6, g = {}) => fm(f, dur, { ratio: 1.414, index: 6, indexDecay: 7, decay: 5, ...g });
/** A precise micro-click: a few ms of sine plus a breath of noise. */
function tick(f = 6000, len = 0.012) {
	const x = buf(len);
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		x[n] = (Math.sin(2 * Math.PI * f * t) * 0.8 + nrand() * 0.25) * Math.exp(-t * 900);
	}
	return x;
}
/** Synthetic rim: band-passed noise and a short sine body. */
function rim(f = 1700) {
	const x = buf(0.06);
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		x[n] = nrand() * Math.exp(-t * 140) * 0.7 + Math.sin(2 * Math.PI * (f * 0.48) * t) * Math.exp(-t * 90) * 0.6;
	}
	return filt(x, "bp", f, 1.2);
}
/** Round, short kick with a click on top: weight without boom. */
function roundKick() {
	const x = kick({ f1: 120, f2: 44, decay: 11, len: 0.3 });
	const c = tick(3200, 0.006);
	for (let n = 0; n < c.length; n++) x[n] += c[n] * 0.5;
	return x;
}
/** Restrained pulse bass: sine with a touch of second harmonic, low-passed. */
function pulseBass(freq, dur = 0.2, o = {}) {
	const x = buf(dur + 0.03);
	let ph = 0;
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		ph += (2 * Math.PI * freq * (1 + 0.5 * Math.exp(-t * 90))) / SR;
		const env = Math.min(1, t / 0.003) * Math.exp(-t * (o.decay ?? 6)) * Math.min(1, (dur + 0.03 - t) / 0.02);
		x[n] = (Math.sin(ph) + 0.22 * Math.sin(2 * ph) + 0.08 * Math.sin(3 * ph)) * env;
	}
	return filt(x, "lp", o.cut ?? 700, 0.8);
}
/** Digital air: a short band-passed noise sweep for transitions. */
function airSweep(sec = 0.25, f0 = 1500, f1 = 9000) {
	const x = noise(sec);
	filt(x, "bp", (t) => f0 * Math.pow(f1 / f0, t / sec), 2.2);
	for (let n = 0; n < x.length; n++) {
		const u = n / x.length;
		x[n] *= Math.pow(Math.sin(Math.PI * u), 1.5);
	}
	return x;
}
/** A burst of FM grains: data streaming past. */
function grains(sec = 0.4, count = 18, base = 1800) {
	const x = buf(sec + 0.08);
	for (let i = 0; i < count; i++) {
		const at = (i / count) * sec + Math.abs(nrand()) * 0.01;
		const g = fm(base * Math.pow(2, Math.round(Math.abs(nrand()) * 12) / 12), 0.04, { ratio: 2 + Math.abs(nrand()) * 3, index: 3, indexDecay: 40, decay: 70 });
		mixInto(x, g, at, 0.5 * (0.4 + 0.6 * Math.abs(nrand())));
	}
	return x;
}

// ------------------------------------------------------------------ electro kit
// French-electro weight for the reel: distorted saw bass, big detuned stabs,
// a stomping kick, a roomy clap, hats, crashes and risers.

const crush = (x, amt) => {
	const k = Math.tanh(amt);
	for (let n = 0; n < x.length; n++) x[n] = Math.tanh(x[n] * amt) / k;
	return x;
};

/**
 * Gritty electro bass: detuned saws over a square, driven hard into a
 * resonant low-pass that snaps open on each note, then driven again.
 * glideTo/glideAt slide the pitch late in the note.
 */
function grit(freq, dur, o = {}) {
	const x = buf(dur + 0.03);
	const to = o.glideTo ?? freq;
	const at = o.glideAt ?? dur;
	const f = (t) => (t < at ? freq : freq * Math.pow(to / freq, Math.min(1, (t - at) / 0.06)));
	osc(x, "saw", f, 0.55);
	osc(x, "saw", (t) => f(t) * 1.007, 0.55, 1300);
	osc(x, "square", f, 0.35, 600);
	crush(x, o.drive ?? 5);
	const cut = o.cut ?? 1300;
	filt(x, "lp", (t) => cut + (o.snap ?? 4500) * Math.exp(-t * (o.snapK ?? 12)), o.q ?? 3.2);
	filt(x, "peak", 1300, 1, 5);
	filt(x, "peak", 2600, 1.2, 4);
	filt(x, "hp", 45, 0.7);
	crush(x, 2.2);
	// tame the fizz the drive folds back above the audible grit
	filt(x, "lp", 9000, 0.7);
	filt(x, "lp", 9000, 0.7);
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		x[n] *= Math.min(1, t / 0.003) * Math.min(1, (dur + 0.03 - t) / 0.02);
	}
	return x;
}

/** Big detuned saw stab (or swell, with a slow attack) through a filter envelope. */
function stabChord(freqs, dur, o = {}) {
	const x = buf(dur + (o.release ?? 0.2));
	for (const f of freqs) for (const d of [-0.14, -0.05, 0.05, 0.14]) osc(x, "saw", f * Math.pow(2, d / 12), 0.16, f * 13 + d * 4000);
	const atk = o.attack ?? 0.004;
	if (o.swell) filt(x, "lp", (t) => 400 + 5200 * Math.min(1, t / dur), 1.4);
	else filt(x, "lp", (t) => (o.floor ?? 1800) + (o.cut ?? 6500) * Math.exp(-t * (o.snapK ?? 7)), 1.3);
	crush(x, o.drive ?? 2.6);
	filt(x, "lp", 11000, 0.7);
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		const e = t < atk ? t / atk : t < dur ? 1 - (1 - (o.sustain ?? 0.7)) * Math.min(1, (t - atk) / 0.15) : (o.sustain ?? 0.7) * Math.max(0, 1 - (t - dur) / (o.release ?? 0.2));
		x[n] *= e;
	}
	return x;
}

/** The stomp: a punchy, saturated kick with a click. */
function stomp() {
	const x = kick({ f1: 200, f2: 52, decay: 8.5, len: 0.38 });
	for (let n = 0; n < 160; n++) x[n] += nrand() * 0.5 * (1 - n / 160);
	return crush(x, 3);
}
/** A big clap: three quick bursts, a snare body and a short room tail. */
function bigClap() {
	const x = buf(0.42);
	for (const at of [0, 0.011, 0.022]) {
		const s0 = Math.floor(at * SR);
		for (let n = 0; n < 0.02 * SR; n++) x[s0 + n] += nrand() * Math.exp(-n / SR * 180);
	}
	for (let n = Math.floor(0.03 * SR); n < x.length; n++) x[n] += nrand() * 0.45 * Math.exp(-(n / SR - 0.03) * 9);
	filt(x, "bp", 1400, 0.7);
	for (let n = 0; n < x.length; n++) x[n] += Math.sin(2 * Math.PI * 190 * (n / SR)) * 0.5 * Math.exp(-n / SR * 32);
	return crush(x, 2.4);
}
function hatC() {
	const x = noise(0.06);
	for (let n = 0; n < x.length; n++) x[n] *= Math.exp(-n / SR * 60);
	return filt(x, "hp", 7500, 0.8);
}
function hatO() {
	const x = noise(0.32);
	for (let n = 0; n < x.length; n++) x[n] *= Math.exp(-n / SR * 9) * Math.min(1, (x.length - n) / 400);
	filt(x, "hp", 6500, 0.8);
	return filt(x, "peak", 9500, 1, 4);
}
function crashHit(len = 1.8) {
	const x = noise(len);
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		x[n] *= Math.exp(-t * 2) * 0.8 + Math.exp(-t * 14) * 0.5;
	}
	filt(x, "hp", 4000, 0.6);
	return filt(x, "peak", 7000, 1, 4);
}
/** Noise and a saw climbing together into a drop. */
function riseUp(sec, f0 = 250, f1 = 8000) {
	const x = noise(sec);
	filt(x, "bp", (t) => f0 * Math.pow(f1 / f0, t / sec), 1.6);
	osc(x, "saw", (t) => 110 * Math.pow(8, t / sec), 0.12);
	for (let n = 0; n < x.length; n++) x[n] *= Math.pow(n / x.length, 1.8);
	return crush(x, 1.5);
}
/** A sub boom falling away: the floor dropping out. */
function boom(len = 1.4) {
	const x = kick({ f1: 120, f2: 30, decay: 2.4, len });
	return crush(x, 2);
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
