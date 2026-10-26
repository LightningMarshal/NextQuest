/*
 * Soundtrack for the NextQuest reel: a 120 BPM drift-phonk / trap cue
 * (pitched cowbell hook, distorted 808, hard drums) plus game-UI sound design,
 * synthesized in JS (DSP helpers come from ../animation/src/audio.js) and
 * finished with reverb, bus compression and a soft clipper.
 */
"use strict";

const STEP = RB / 4; // a 16th note
// bars are 2 s (16 steps) and start on the feature cuts
const RA = {
	bars: [
		[4.5, "A", 0],
		[6.5, "A", 0],
		[8.5, "F", -4],
		[10.5, "G", -2],
	],
	// the hook: 16 steps of pitched cowbell (semitones from A5, null = rest)
	riff: [0, null, 0, 3, null, 0, -2, null, -5, null, -5, -2, 0, null, -2, -5],
	// a harder variation for the second half
	riff2: [0, null, 0, 3, null, 5, 3, null, 0, null, 0, -2, 0, 3, 7, 5],
	kickSteps: [0, 3, 6, 10, 11],
	clapSteps: [4, 12],
};

// ------------------------------------------------------------------ helpers
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

// ------------------------------------------------------------------ instruments
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

// ------------------------------------------------------------------ score + sfx
async function buildReelSoundtrack() {
	_seed = 777;
	const len = Math.ceil(REEL_DUR * SR);
	const bus = {
		pump: [new Float32Array(len), new Float32Array(len)], // cowbell, stabs (side-chained)
		bass: [new Float32Array(len), new Float32Array(len)], // 808
		drums: [new Float32Array(len), new Float32Array(len)],
		sfx: [new Float32Array(len), new Float32Array(len)],
		rev: [new Float32Array(len), new Float32Array(len)],
	};
	const cache = new Map();
	function play(fn, when, which, gain = 1, pan = 0, rev = 0.15, key = null) {
		if (when < 0 || when >= REEL_DUR) return;
		let d;
		if (key && cache.has(key)) d = cache.get(key);
		else {
			d = fn();
			if (key) cache.set(key, d);
		}
		const a = ((pan + 1) * Math.PI) / 4;
		const gl = Math.cos(a) * gain;
		const gr = Math.sin(a) * gain;
		const [L, R2] = bus[which];
		const [RL, RR] = bus.rev;
		const s0 = Math.round(when * SR);
		const n = Math.min(d.length, len - s0);
		for (let k = 0; k < n; k++) {
			const v = d[k];
			L[s0 + k] += v * gl;
			R2[s0 + k] += v * gr;
			if (rev) {
				RL[s0 + k] += v * gl * rev;
				RR[s0 + k] += v * gr * rev;
			}
		}
	}
	const kicks = [];
	const K = (t, g = 0.95) => {
		kicks.push(t);
		play(() => hardKick(), t, "drums", g, 0, 0.02, "k");
	};
	const A5 = hz("A5");
	const bell = (semi, t, g = 0.3, pan = 0) => play(() => cowbell(A5 * Math.pow(2, semi / 12)), t, "pump", g, pan, 0.18, "cb" + semi);
	const root808 = { A: hz("A1"), F: hz("F1"), G: hz("G1"), C: hz("C2"), E: hz("E1") };

	// ---------- act 1: the group chat won't stop buzzing
	play(() => zap(3200, 120, 0.4), 0.0, "sfx", 0.35, 0, 0.25);
	play(() => impact(), 0.0, "sfx", 0.35, 0, 0.2);
	[0.22, 0.48, 0.71, 0.9, 1.08, 1.21, 1.33].forEach((t, k) => play(() => buzz(), t, "sfx", 0.32 + k * 0.03, k % 2 ? 0.5 : -0.5, 0.05, "buzz"));
	// the hook, muffled, as if through a wall
	for (let s = 0; s < 12; s++) {
		const semi = RA.riff[s % 16];
		if (semi === null) continue;
		play(() => {
			const x = cowbell(A5 * Math.pow(2, semi / 12));
			return filt(x, "lp", 1100, 0.7);
		}, 0.0 + s * STEP, "pump", 0.22, 0, 0.3);
	}
	for (let b = 0; b < 12; b++) play(() => hat(70, 9000), 0.25 + b * 0.125, "drums", 0.05 + b * 0.006, 0.4, 0.02, "hat");
	// counter ticks follow the digits
	for (let k = 0; k < 26; k++) {
		const u = k / 26;
		const t = TL.count + 0.85 * (1 - Math.pow(1 - u, 1 / 5)) * 0.999;
		play(() => clickSfx(3200 + k * 30), t, "sfx", 0.16, 0.2, 0.02);
	}
	// ANYONE / UP FOR / A GAME / TONIGHT? — one hard hit per word
	const hitChords = [
		[hz("A2"), hz("E3"), hz("A3"), hz("C4")],
		[hz("A2"), hz("E3"), hz("A3"), hz("C4")],
		[hz("F2"), hz("C3"), hz("F3"), hz("A3")],
		[hz("G2"), hz("D3"), hz("G3"), hz("B3")],
	];
	const hitRoots = ["A", "A", "F", "G"];
	TL.words.forEach((t, i) => {
		K(t, 1);
		play(() => hardClap(), t, "drums", 0.55, 0, 0.25, "clap");
		play(() => stab(hitChords[i], 0.32), t, "pump", 0.34, 0, 0.3, "hit" + i);
		play(() => bass808(root808[hitRoots[i]] * 2, 0.45, { decay: 4 }), t, "bass", 0.85, 0, 0, "h808" + i);
		play(() => glitch(700 + i * 120), t + 0.22, "sfx", 0.1, i % 2 ? 0.6 : -0.6, 0.05);
	});
	// 32nd hat roll and snare roll into the drop
	for (let k = 0; k < 8; k++) play(() => hat(90, 8500), 2.5 + 0.25 + k * 0.03125, "drums", 0.08 + k * 0.01, 0.3, 0.02, "hroll");
	for (let k = 0; k < 6; k++) play(() => snare({ decay: 26 }), 3.0 + 0.125 + k * 0.0625, "drums", 0.12 + k * 0.05, 0, 0.1, "sroll");
	play(() => riser(0.45, 300, 9000), 3.0, "sfx", 0.55, 0, 0.2);
	play(() => revCymbal(0.5), 2.95, "sfx", 0.35, 0, 0.2);

	// ---------- act 2: the drop on the logo
	play(() => impact(), TL.hit, "sfx", 1.2, 0, 0.25);
	play(() => crash(2.4), TL.hit, "drums", 0.3, 0.1, 0.3, "crash");
	K(TL.hit, 1);
	play(() => bass808(root808.A * 2, 0.95, { decay: 1.6, glideTo: root808.A * 2 * 0.5, glideAt: 0.7 }), TL.hit, "bass", 0.9, 0, 0);
	play(() => stab(hitChords[0], 0.6, { cut: 6500 }), TL.hit, "pump", 0.3, 0, 0.35);
	play(() => zap(5000, 300, 0.25), TL.hit + 0.04, "sfx", 0.2, 0.3, 0.1);
	// hook pickup under the wordmark
	for (let s = 8; s < 16; s++) {
		const semi = RA.riff[s];
		if (semi !== null) bell(semi, TL.hit + 0.5 + (s - 8) * STEP, 0.3, s % 2 ? 0.25 : -0.25);
	}
	K(TL.hit + 0.75, 0.8);
	play(() => hardClap(), TL.hit + 0.5, "drums", 0.4, 0, 0.2, "clap");
	play(() => whoosh(0.4, 400, 5000), TL.zoom - 0.05, "sfx", 0.45, 0, 0.2);

	// ---------- act 3: the groove
	RA.bars.forEach(([t0, root, shift], bi) => {
		const riff = bi >= 2 ? RA.riff2 : RA.riff;
		for (let s = 0; s < 16; s++) {
			const t = t0 + s * STEP;
			if (RA.kickSteps.includes(s)) K(t, s === 0 ? 1 : 0.85);
			if (RA.clapSteps.includes(s)) play(() => hardClap(), t, "drums", 0.5, 0, 0.2, "clap");
			// hats: 8ths, with a 32nd roll at the end of every other bar
			if (s % 2 === 0) play(() => hat(80, 9000), t, "drums", s % 4 === 2 ? 0.13 : 0.08, -0.3, 0.02, "chat");
			if (bi % 2 === 1 && s >= 14) for (let r = 0; r < 4; r++) play(() => hat(110, 9500), t + r * (STEP / 2), "drums", 0.07 + r * 0.015, 0.3, 0.02, "hroll");
			if (s === 7 || s === 15) play(() => hat(16, 7000), t, "drums", 0.12, 0.35, 0.05, "ohat");
			// the hook
			const semi = riff[s];
			if (semi !== null) bell(semi + shift, t, 0.27, s % 2 ? 0.25 : -0.25);
		}
		// 808: follows the kick, slides into the next bar's root
		const r = root808[root] * 2;
		const nextRoot = RA.bars[bi + 1] ? root808[RA.bars[bi + 1][1]] * 2 : r;
		play(() => bass808(r, 0.7, { decay: 1.8 }), t0, "bass", 0.85, 0, 0, "b808" + root);
		play(() => bass808(r, 0.5, { decay: 2.4 }), t0 + 6 * STEP, "bass", 0.75, 0, 0, "b808s" + root);
		play(() => bass808(r, 0.76, { decay: 1.3, glideTo: nextRoot, glideAt: 0.6 }), t0 + 10 * STEP, "bass", 0.75, 0, 0, "b808g" + root + nextRoot);
		if (bi > 0) {
			play(() => whoosh(0.4, 300, 4500), t0 - 0.26, "sfx", 0.35, 0.3, 0.15);
			play(() => crash(1.0), t0, "drums", 0.12, -0.2, 0.25, "crash1");
		}
	});

	// UI sound design (times mirror reel.js) — game-menu sounds, not chimes
	const f = TL.feats;
	// 01 post
	for (let i = 0; i < P1_QUERY.length; i++) play(() => clickSfx(2300 + ((i * 397) % 1100)), f[0] + P1_TYPE(i), "sfx", 0.16, 0.3, 0.02);
	play(() => uiSelect(560), f[0] + P1_TYPE(P1_QUERY.length - 1) + 0.05, "sfx", 0.2, 0.3, 0.05);
	play(() => uiSelect(700), f[0] + P1_WHEN_T, "sfx", 0.24, 0.35, 0.05);
	play(() => uiSelect(880), f[0] + P1_VIS_T, "sfx", 0.24, 0.35, 0.05);
	play(() => uiClick(1500), f[0] + P1_POST_T, "sfx", 0.6, 0.35, 0.05);
	play(() => uiConfirm(523), f[0] + P1_POST_T + 0.07, "sfx", 0.22, 0.35, 0.1);
	// 02 discord: the card lands, then gets edited as people join, then the reminder
	play(() => buzz(), f[1] + 0.14, "sfx", 0.4, 0.3, 0.05, "buzz");
	play(() => zap(1800, 400, 0.12), f[1] + 0.16, "sfx", 0.16, 0.3, 0.05);
	P2_JOIN.forEach((j, k) => {
		play(() => uiSelect(620 + k * 140), f[1] + j.u, "sfx", 0.24, 0.3, 0.05);
		play(() => glitch(900 + k * 150), f[1] + j.u + 0.04, "sfx", 0.08, 0.3, 0.02);
	});
	play(() => buzz(), f[1] + P2_REMIND_T, "sfx", 0.35, 0.3, 0.05, "buzz");
	// 03 join: a guest arrives from an invite link, then you tap I'm in
	play(() => zap(2000, 500, 0.14), f[2] + P3_GUEST_T, "sfx", 0.18, 0.4, 0.05);
	play(() => uiSelect(784), f[2] + P3_GUEST_T + 0.15, "sfx", 0.2, 0.4, 0.05);
	play(() => uiClick(1700), f[2] + P3_IN_T, "sfx", 0.6, 0.35, 0.05);
	play(() => uiConfirm(587), f[2] + P3_IN_T + 0.06, "sfx", 0.22, 0.35, 0.1);
	// 04 wrap up: ticks, stars, a line of text, same time next week
	for (let k = 0; k < 5; k++) play(() => clickSfx(2600 + k * 150), f[3] + 0.2 + k * 0.06, "sfx", 0.14, -0.2 + k * 0.1, 0.02);
	P4_STARS.forEach((u, k) => play(() => uiSelect(523 * Math.pow(2, [0, 4, 7, 12][k] / 12)), f[3] + u, "sfx", 0.2, 0.35, 0.05));
	for (let i = 0; i < P4_RECAP.length; i += 2) play(() => clickSfx(2100 + ((i * 263) % 1300)), f[3] + P4_RECAP_T(i), "sfx", 0.1, 0.3, 0.02);
	play(() => uiClick(1300), f[3] + P4_REPEAT_T, "sfx", 0.45, 0.35, 0.05);
	play(() => zap(2600, 700, 0.12), f[3] + P4_STATS_T, "sfx", 0.14, 0.35, 0.05);

	// ---------- act 4: the build and the final drop
	play(() => whoosh(0.55, 250, 3500), TL.fanIn - 0.05, "sfx", 0.45, 0, 0.2);
	const buildChords = [
		[hz("A2"), hz("E3"), hz("A3"), hz("C4")],
		[hz("C3"), hz("G3"), hz("C4"), hz("E4")],
		[hz("D3"), hz("A3"), hz("D4"), hz("F4")],
		[hz("E3"), hz("B3"), hz("E4"), hz("G#4")],
	];
	TL.kinds.forEach((t, i) => {
		K(t, 1);
		play(() => hardClap(), t, "drums", 0.45, 0, 0.2, "clap");
		play(() => stab(buildChords[i], 0.2), t, "pump", 0.3, 0, 0.3, "bc" + i);
		play(() => bass808(hz(["A1", "C2", "D2", "E2"][i]) * 2, 0.22, { decay: 6 }), t, "bass", 0.75, 0, 0);
	});
	for (let k = 0; k < 12; k++) play(() => snare({ decay: 28 }), 12.5 + 0.25 + k * 0.0625, "drums", 0.06 + (k / 12) * 0.22, 0.1, 0.1, "sroll");
	play(() => riser(0.95, 300, 10000), 12.5, "sfx", 0.5, 0, 0.2);
	play(() => revCymbal(0.6), TL.final - 0.6, "sfx", 0.3, 0, 0.2);
	play(() => impact(), TL.final, "sfx", 1.3, 0, 0.3);
	play(() => crash(2.4), TL.final, "drums", 0.38, -0.1, 0.35, "crash");
	K(TL.final, 1);
	play(() => bass808(root808.A * 2, 1.3, { decay: 1.1 }), TL.final, "bass", 0.95, 0, 0);
	play(() => stab(hitChords[0], 0.9, { cut: 7000, snap: 5 }), TL.final, "pump", 0.32, 0, 0.4);
	play(() => zap(5000, 200, 0.3), TL.final + 0.03, "sfx", 0.2, -0.3, 0.1);
	// one last bar of the hook over the lockup
	for (let s = 0; s < 12; s++) {
		const t = TL.final + 0.5 + s * STEP;
		if (RA.kickSteps.includes(s)) K(t, 0.8);
		if (RA.clapSteps.includes(s)) play(() => hardClap(), t, "drums", 0.45, 0, 0.2, "clap");
		if (s % 2 === 0) play(() => hat(80, 9000), t, "drums", 0.1, -0.3, 0.02, "chat");
		const semi = RA.riff2[s];
		if (semi !== null) bell(semi, t, 0.27, s % 2 ? 0.25 : -0.25);
	}
	[14.15, 14.35].forEach((t) => play(() => glitch(1200), t, "sfx", 0.06, 0.2, 0.02));

	// ---------- sidechain pump on the hook and stabs
	const [PL, PR] = bus.pump;
	kicks.sort((a, b) => a - b);
	let ki = 0;
	for (let n = 0; n < len; n++) {
		const t = n / SR;
		while (ki + 1 < kicks.length && kicks[ki + 1] <= t) ki++;
		const since = kicks.length && t >= kicks[ki] ? t - kicks[ki] : 9;
		const g = 0.45 + 0.55 * (1 - Math.exp(-since / 0.06));
		PL[n] *= g;
		PR[n] *= g;
	}

	// ---------- stop-time before each drop
	for (const hit of [TL.hit, TL.final]) {
		const a = Math.floor((hit - 0.09) * SR);
		const b = Math.floor((hit - 0.004) * SR);
		for (const k of ["pump", "bass", "drums", "sfx", "rev"])
			for (const ch of bus[k])
				for (let n = a - 240; n < b; n++) ch[n] *= n < a ? 1 - (n - (a - 240)) / 240 : 0.02;
	}

	// ---------- tape stop on the music for the last half second
	const tsStart = Math.floor((REEL_DUR - 0.55) * SR);
	for (const k of ["pump", "bass", "drums"])
		for (const ch of bus[k]) {
			const src = ch.slice(tsStart);
			let pos = 0;
			for (let n = tsStart; n < len; n++) {
				const u = (n - tsStart) / (len - tsStart);
				const i = Math.floor(pos);
				const fr = pos - i;
				ch[n] = (src[i] ?? 0) * (1 - fr) + (src[i + 1] ?? 0) * fr;
				pos += Math.max(0, 1 - u * 1.15);
			}
		}

	// ---------- graph: reverb, glue compression, master
	const ctx = new OfflineAudioContext(2, len, SR);
	const master = ctx.createGain();
	const comp = ctx.createDynamicsCompressor();
	comp.threshold.value = -14;
	comp.knee.value = 6;
	comp.ratio.value = 3;
	comp.attack.value = 0.003;
	comp.release.value = 0.1;
	const hpf = ctx.createBiquadFilter();
	hpf.type = "highpass";
	hpf.frequency.value = 28;
	master.connect(hpf);
	hpf.connect(comp);
	comp.connect(ctx.destination);
	const reverb = ctx.createConvolver();
	reverb.buffer = makeIR(ctx, 1.4);
	const rg = ctx.createGain();
	rg.gain.value = 0.22;
	reverb.connect(rg);
	rg.connect(master);
	const src = (arrs, dest, gain) => {
		const b = ctx.createBuffer(2, len, SR);
		b.copyToChannel(arrs[0], 0);
		b.copyToChannel(arrs[1], 1);
		const s = ctx.createBufferSource();
		s.buffer = b;
		const g = ctx.createGain();
		g.gain.value = gain;
		s.connect(g);
		g.connect(dest);
		s.start(0);
	};
	src(bus.pump, master, 0.75);
	src(bus.bass, master, 0.58);
	src(bus.drums, master, 0.9);
	src(bus.sfx, master, 0.7);
	src(bus.rev, reverb, 1);
	const out = await ctx.startRendering();

	// ---------- master: normalise, soft-clip for loudness and punch, re-normalise
	const L = out.getChannelData(0);
	const Rr = out.getChannelData(1);
	const peakOf = () => {
		let pk = 0;
		for (let n = 0; n < L.length; n++) pk = Math.max(pk, Math.abs(L[n]), Math.abs(Rr[n]));
		return pk || 1;
	};
	let g = 1 / peakOf();
	const clipDrive = 1.25;
	const kc = Math.tanh(clipDrive);
	for (let n = 0; n < L.length; n++) {
		L[n] = Math.tanh(L[n] * g * clipDrive) / kc;
		Rr[n] = Math.tanh(Rr[n] * g * clipDrive) / kc;
	}
	g = 0.89 / peakOf();
	const fade = Math.floor((REEL_DUR - 0.12) * SR);
	for (let n = 0; n < L.length; n++) {
		const ff = n > fade ? Math.max(0, 1 - (n - fade) / (L.length - fade)) : 1;
		L[n] *= g * ff;
		Rr[n] *= g * ff;
	}
	return out;
}
