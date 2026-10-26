/*
 * Soundtrack for the NextQuest reel: procedural electronic sound design at
 * 120 BPM. FM glass and metal tones, micro-percussion (ticks, rims, a round
 * kick) in a syncopated 3-3-2 groove, a restrained pulse bass, short motifs
 * instead of a melody, and accents locked to the picture (reel.js timings).
 * Instruments come from ../shared/dsp.js; finished with a ping-pong echo, a
 * short room, gentle bus compression and a peak limiter.
 */
"use strict";

const STEP = RB / 4; // a 16th note
const RA = {
	// one 2 s bar per feature panel: A minor, F, C, G
	bars: [
		[4.5, 0],
		[6.5, -4],
		[8.5, 3],
		[10.5, -2],
	],
	// 3-3-2 syncopation instead of four-on-the-floor
	kickSteps: [0, 6, 11],
	rimSteps: [4, 12],
	bassSteps: [0, 3, 6, 10, 13],
	// the motif: semitones above the bar's root, null = rest
	motif: [0, 7, 12, null, 10, 7, 3, null, 0, 7, 15, 12, null, 10, 7, null],
	motif2: [0, 7, 12, 15, 19, 15, 12, 7, 0, null, 12, 10, 15, null, 19, 22],
};

async function buildReelSoundtrack() {
	_seed = 777;
	const len = Math.ceil(REEL_DUR * SR);
	const stereo = () => [new Float32Array(len), new Float32Array(len)];
	const bus = { tone: stereo(), bass: stereo(), perc: stereo(), sfx: stereo(), echo: stereo(), rev: stereo() };
	const cache = new Map();
	function play(fn, when, which, gain = 1, pan = 0, rev = 0.06, key = null, echo = 0) {
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
		const [L, Rt] = bus[which];
		const s0 = Math.round(when * SR);
		const n = Math.min(d.length, len - s0);
		for (let k = 0; k < n; k++) {
			const v = d[k];
			L[s0 + k] += v * gl;
			Rt[s0 + k] += v * gr;
			if (rev) {
				bus.rev[0][s0 + k] += v * gl * rev;
				bus.rev[1][s0 + k] += v * gr * rev;
			}
			if (echo) {
				bus.echo[0][s0 + k] += v * gl * echo;
				bus.echo[1][s0 + k] += v * gr * echo;
			}
		}
	}
	const A3 = hz("A3");
	const semi = (s, base = A3) => base * Math.pow(2, s / 12);
	const T = (t, f = 6000, g = 0.18, pan = 0) => play(() => tick(f), t, "perc", g * 1.35, pan, 0.02, "t" + f);
	const K = (t, g = 0.65) => play(() => roundKick(), t, "perc", g * 0.85, 0, 0.01, "k");
	const Rim = (t, g = 0.32, pan = 0.15) => play(() => rim(1700), t, "perc", g, pan, 0.05, "rim");
	const Bass = (s, t, dur = 0.2, g = 0.55) => play(() => pulseBass(semi(s, hz("A1")), dur), t, "bass", g, 0, 0, `b${s}${dur}`);
	const Glass = (s, t, g = 0.2, pan = 0, dur = 0.45, echo = 0.35) => play(() => glass(semi(s, hz("A4")), dur), t, "tone", g, pan, 0.08, `g${s}${dur}`, echo);
	const Metal = (s, t, g = 0.22, pan = 0, dur = 0.7) => play(() => metal(semi(s, hz("A3")), dur), t, "tone", g, pan, 0.12, `m${s}${dur}`, 0.15);
	const Blip = (f, t, g = 0.16, pan = 0.3, up = 0.6) => play(() => fm(f, 0.07, { ratio: 2, index: 1.2, indexDecay: 30, decay: 40, sweep: up, sweepT: 0.04 }), t, "sfx", g, pan, 0.04, `bl${f}${up}`);

	// ---------- act 1: a line of light, then data pouring in
	play(() => fm(1760, 0.5, { ratio: 1.5, index: 2.2, indexDecay: 6, decay: 5, sweep: 2.5, sweepT: 0.3 }), TL.laser, "sfx", 0.12, 0, 0.05);
	play(() => roundKick(), TL.laser, "perc", 0.4);
	play(() => grains(1.3, 34, 1100), TL.wall, "sfx", 0.22, -0.3, 0.05);
	play(() => grains(1.2, 30, 1650), TL.wall + 0.15, "sfx", 0.18, 0.35, 0.05);
	// counter ticks follow the digits, accelerating
	for (let k = 0; k < 26; k++) {
		const u = k / 26;
		const t = TL.count + 0.85 * (1 - Math.pow(1 - u, 1 / 5)) * 0.999;
		T(t, 5200 + (k % 4) * 600, 0.1 + u * 0.08, k % 2 ? 0.45 : -0.45);
	}
	// a filtered pulse quietly sets the tempo under the wall
	for (let s = 0; s < 12; s++) Bass(0, 0 + s * STEP, 0.08, 0.12 + s * 0.012);

	// ANYONE / UP FOR / A GAME / TONIGHT?  one metallic hit per word, climbing
	const wordSemis = [0, 3, 5, 7];
	TL.words.forEach((t, i) => {
		K(t, 0.8);
		Metal(wordSemis[i], t, 0.26, i % 2 ? 0.2 : -0.2);
		Bass(wordSemis[i], t, 0.3, 0.6);
		play(() => airSweep(0.12, 3000, 9000), t - 0.02, "sfx", 0.06, i % 2 ? 0.6 : -0.6, 0.02);
		// the 16ths between words fill in as the question builds
		for (let s = 1; s < 4; s++) if (s !== 2 || i > 0) T(t + s * STEP, 7000, 0.07 + i * 0.03, s % 2 ? 0.5 : -0.5);
		if (i >= 2) Rim(t + 2 * STEP, 0.22);
	});
	// a 32nd ratchet and an upward FM sweep into the logo
	for (let k = 0; k < 7; k++) T(3.0 + 0.25 + k * (STEP / 2), 6000 + k * 500, 0.06 + k * 0.025, k % 2 ? 0.4 : -0.4);
	play(() => fm(330, 0.42, { ratio: 2.01, index: 3, floor: 1.5, indexDecay: 1, decay: 0.5, attack: 0.35, sweep: 0.5, sweepT: 0.42 }), 3.06, "sfx", 0.1, 0, 0.05);

	// ---------- act 2: the logo, a focal point with space around it
	K(TL.hit, 0.9);
	Bass(0, TL.hit, 0.9, 0.7);
	[0, 3, 7, 14].forEach((s, i) => Glass(s, TL.hit + i * 0.012, 0.16, (i - 1.5) * 0.3, 1.6, 0.25));
	Metal(12, TL.hit, 0.12, 0, 1.2);
	T(TL.hit + 0.5, 8000, 0.12, 0.5);
	T(TL.hit + 0.625, 8000, 0.08, -0.5);
	play(() => airSweep(0.3, 1200, 10000), TL.zoom - 0.2, "sfx", 0.12, 0, 0.05);
	play(() => fm(900, 0.25, { ratio: 1.5, index: 3, indexDecay: 10, decay: 10, sweep: 0.4, sweepT: 0.2 }), TL.zoom - 0.05, "sfx", 0.1, 0.2, 0.05);

	// ---------- act 3: the groove, denser bar by bar
	RA.bars.forEach(([t0, root], bi) => {
		const motif = bi >= 2 ? RA.motif2 : RA.motif;
		// a short accent on each panel cut
		Metal(root + 12, t0, 0.14, bi % 2 ? 0.3 : -0.3, 0.5);
		play(() => airSweep(0.18, 2000, 9000), t0 - 0.12, "sfx", 0.08, bi % 2 ? -0.5 : 0.5, 0.02);
		for (let s = 0; s < 16; s++) {
			const t = t0 + s * STEP;
			if (RA.kickSteps.includes(s)) K(t, s === 0 ? 0.8 : 0.62);
			if (RA.rimSteps.includes(s)) Rim(t, 0.3, s === 4 ? -0.2 : 0.2);
			if (RA.bassSteps.includes(s)) Bass(root + (s === 10 ? 12 : 0), t, s === 0 ? 0.24 : 0.14, s === 0 ? 0.6 : 0.45);
			// ticks: 8ths, then 16ths with accents, then ratchets
			const accent = s % 4 === 2 ? 1 : s % 2 === 0 ? 0.6 : 0.4;
			if (s % 2 === 0 || bi >= 1) T(t, s % 4 === 2 ? 8500 : 7000, 0.06 + accent * 0.07, s % 2 ? 0.55 : -0.55);
			if (bi >= 2 && (s === 7 || s === 15)) for (let r = 1; r < 3; r++) T(t + r * (STEP / 3), 9000, 0.06, 0.3);
			// the motif, thinner in the first bar
			const m = motif[s];
			if (m !== null && (bi > 0 || s % 2 === 0)) Glass(root + m, t, 0.13 + (s === 0 ? 0.05 : 0), s % 2 ? 0.4 : -0.4, 0.32);
		}
		if (bi === 3) for (let k = 0; k < 4; k++) Metal(root + 19 + k * 2, t0 + (12 + k) * STEP, 0.05 + k * 0.015, 0.2, 0.25);
	});

	// UI sound design (times mirror reel.js): taps are ticks, choices are blips
	const f = TL.feats;
	// 01 post
	for (let i = 0; i < P1_QUERY.length; i++) T(f[0] + P1_TYPE(i), 4200 + ((i * 397) % 1600), 0.07, 0.35);
	Blip(1320, f[0] + P1_WHEN_T, 0.16, 0.35);
	Blip(1760, f[0] + P1_VIS_T, 0.16, 0.35);
	play(() => roundKick(), f[0] + P1_POST_T, "sfx", 0.3, 0.3);
	Glass(19, f[0] + P1_POST_T, 0.14, 0.35, 0.4, 0.3);
	Glass(24, f[0] + P1_POST_T + 0.06, 0.14, 0.35, 0.5, 0.3);
	// 02 discord: the card lands, edits as people join, then the reminder
	Glass(12, f[1] + 0.14, 0.15, 0.3, 0.4);
	Glass(19, f[1] + 0.2, 0.12, 0.3, 0.4);
	P2_JOIN.forEach((j, k) => Blip(1100 * Math.pow(2, (k * 3) / 12), f[1] + j.u, 0.15, 0.35, 0.5));
	play(() => grains(0.15, 6, 2600), f[1] + P2_REMIND_T, "sfx", 0.14, 0.3, 0.03);
	// 03 join: a guest arrives from an invite link, then I'm in
	play(() => fm(700, 0.2, { ratio: 1.5, index: 2, indexDecay: 8, decay: 12, sweep: 0.5, sweepT: 0.15 }), f[2] + P3_GUEST_T, "sfx", 0.14, 0.4, 0.04);
	play(() => roundKick(), f[2] + P3_IN_T, "sfx", 0.3, 0.3);
	Glass(15, f[2] + P3_IN_T, 0.13, 0.35, 0.4, 0.3);
	Glass(22, f[2] + P3_IN_T + 0.06, 0.13, 0.35, 0.5, 0.3);
	// 04 wrap up: ticks, rising stars, a line of text, same time next week, stats
	for (let k = 0; k < 5; k++) T(f[3] + 0.2 + k * 0.06, 5000 + k * 400, 0.1, -0.2 + k * 0.1);
	P4_STARS.forEach((u, k) => Glass([12, 15, 19, 24][k], f[3] + u, 0.11, 0.35, 0.3, 0.2));
	for (let i = 0; i < P4_RECAP.length; i += 2) T(f[3] + P4_RECAP_T(i), 4500 + ((i * 263) % 1500), 0.05, 0.3);
	Blip(990, f[3] + P4_REPEAT_T, 0.16, 0.35, 0.5);
	play(() => grains(0.25, 10, 1600), f[3] + P4_STATS_T, "sfx", 0.16, 0.35, 0.03);

	// ---------- act 4: the fan-out builds, a breath, then the resolve
	play(() => airSweep(0.4, 800, 9000), TL.fanIn - 0.1, "sfx", 0.1, 0, 0.04);
	const kindSemis = [0, 3, 7, 10];
	TL.kinds.forEach((t, i) => {
		K(t, 0.8);
		Metal(kindSemis[i] + 12, t, 0.2, (i - 1.5) * 0.35, 0.35);
		Bass(kindSemis[i], t, 0.16, 0.55);
		for (let r = 1; r < 4; r++) T(t + r * (STEP / 1.5), 7000 + i * 600, 0.06 + i * 0.02, r % 2 ? 0.5 : -0.5);
	});
	K(TL.final, 0.9);
	Bass(0, TL.final, 1.1, 0.7);
	[0, 7, 12, 14, 19].forEach((s, i) => Glass(s, TL.final + i * 0.01, 0.14, (i - 2) * 0.28, 1.4, 0.2));
	Metal(24, TL.final, 0.1, 0, 1.3);
	// a last turn of the motif, descending, and one tick to close the system
	[19, 15, 12, 7].forEach((s, k) => Glass(s, TL.final + 0.5 + k * STEP, 0.1, k % 2 ? 0.4 : -0.4, 0.4, 0.4));
	[0.5, 0.75, 1.0].forEach((d) => T(TL.final + d, 8000, 0.07, d === 0.75 ? 0.5 : -0.5));
	T(14.75, 3000, 0.22, 0);
	play(() => pulseBass(hz("A1"), 0.12), 14.75, "bass", 0.4);

	// ---------- stop-time breaths before the two focal points
	for (const hit of [TL.hit, TL.final]) {
		const a = Math.floor((hit - 0.12) * SR);
		const b = Math.floor((hit - 0.004) * SR);
		for (const k of ["tone", "bass", "perc", "echo"])
			for (const ch of bus[k]) for (let n = a - 240; n < b; n++) ch[n] *= n < a ? 1 - (n - (a - 240)) / 240 : 0.03;
	}

	// ---------- ping-pong echo: dotted-8th, filtered, alternating sides
	const dly = Math.round(3 * STEP * SR);
	const [EL, ER] = bus.echo;
	const outL = new Float32Array(len);
	const outR = new Float32Array(len);
	let lpL = 0;
	let lpR = 0;
	for (let n = 0; n < len; n++) {
		const inL = EL[n] + (n >= dly ? outR[n - dly] * 0.42 : 0);
		const inR = ER[n] * 0.3 + (n >= dly ? outL[n - dly] * 0.42 : 0);
		lpL += (inL - lpL) * 0.35;
		lpR += (inR - lpR) * 0.35;
		outL[n] = lpL;
		outR[n] = lpR;
	}
	for (let n = dly; n < len; n++) {
		bus.tone[0][n] += outL[n - dly] * 0.6;
		bus.tone[1][n] += outR[n - dly] * 0.6;
	}

	// ---------- graph: a short room, glue compression, master
	const ctx = new OfflineAudioContext(2, len, SR);
	const master = ctx.createGain();
	const comp = ctx.createDynamicsCompressor();
	comp.threshold.value = -16;
	comp.knee.value = 6;
	comp.ratio.value = 2.5;
	comp.attack.value = 0.002;
	comp.release.value = 0.08;
	const hpf = ctx.createBiquadFilter();
	hpf.type = "highpass";
	hpf.frequency.value = 32;
	master.connect(hpf);
	hpf.connect(comp);
	comp.connect(ctx.destination);
	const reverb = ctx.createConvolver();
	reverb.buffer = makeIR(ctx, 0.7);
	const rg = ctx.createGain();
	rg.gain.value = 0.25;
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
	src(bus.tone, master, 1.05);
	src(bus.bass, master, 0.4);
	src(bus.perc, master, 1.0);
	src(bus.sfx, master, 0.9);
	src(bus.rev, reverb, 1.0);
	const out = await ctx.startRendering();

	// gentle limiter + peak normalise, short fades at both ends
	let peak = 0;
	for (let ch = 0; ch < 2; ch++) {
		const d = out.getChannelData(ch);
		for (let n = 0; n < d.length; n++) {
			d[n] = Math.tanh(d[n] * 1.05) / Math.tanh(1.05);
			peak = Math.max(peak, Math.abs(d[n]));
		}
	}
	const norm = 0.89 / (peak || 1);
	for (let ch = 0; ch < 2; ch++) {
		const d = out.getChannelData(ch);
		for (let n = 0; n < d.length; n++) d[n] *= norm;
		for (let n = 0; n < 240; n++) d[n] *= n / 240;
		for (let n = 0; n < 4800; n++) d[d.length - 1 - n] *= n / 4800;
	}
	return out;
}
