/*
 * Soundtrack for the walkthrough: the narration (clips cued by id), a
 * 120 BPM bed in the reel's procedural FM sound (../shared/dsp.js: glass and
 * metal tones, ticks, rims, a round kick, pulse bass) that thins out and
 * ducks under the voice, and UI sound design driven by the picture's own
 * events (walkEvents() in walk.js), mixed and mastered in JS.
 */
"use strict";

const BEAT = 0.5;
const STEP16 = BEAT / 4;
const WA = {
	// the reel's motif (semitones above the bar's root, null = rest)
	motif: [0, 7, 12, null, 10, 7, 3, null, 0, 7, 15, 12, null, 10, 7, null],
	// a light 3-3-2 groove under the voice
	kickSteps: [0, 6, 11],
	rimSteps: [12],
	bassSteps: [0, 6, 10],
	// one root per 2 s bar: A minor, F, C, G
	roots: [0, -4, 3, -2],
	logo: 7.5,
	groove: [10, 66],
	drops: [10, 22, 34, 48, 60],
	final: 66.5,
};

async function decodeClip(dataUrl) {
	const bytes = await (await fetch(dataUrl)).arrayBuffer();
	const ab = await new OfflineAudioContext(1, 1, SR).decodeAudioData(bytes);
	return ab.getChannelData(0);
}

async function buildWalkSoundtrack() {
	_seed = 4242;
	const len = Math.ceil(WALK_DUR * SR);
	const stereo = () => [new Float32Array(len), new Float32Array(len)];
	const bus = { music: stereo(), bass: stereo(), drums: stereo(), sfx: stereo(), voice: stereo(), rev: stereo() };
	const cache = new Map();
	function play(fn, when, which, gain = 1, pan = 0, rev = 0.12, key = null) {
		if (when < 0 || when >= WALK_DUR) return;
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
		const [RL, RR] = bus.rev;
		const s0 = Math.round(when * SR);
		const n = Math.min(d.length, len - s0);
		for (let k = 0; k < n; k++) {
			const v = d[k];
			L[s0 + k] += v * gl;
			Rt[s0 + k] += v * gr;
			if (rev) {
				RL[s0 + k] += v * gl * rev;
				RR[s0 + k] += v * gr * rev;
			}
		}
	}

	// ---------- narration
	const voice = new Float32Array(len);
	for (const line of DATA.lines) {
		const clip = await decodeClip(DATA.narration[line.id]);
		mixInto(voice, clip, CUES[line.id], 0.9);
	}
	bus.voice[0].set(voice);
	bus.voice[1].set(voice);
	for (let n = 0; n < len; n++) {
		bus.rev[0][n] += voice[n] * 0.035;
		bus.rev[1][n] += voice[n] * 0.035;
	}

	// ---------- music
	const kicks = [];
	const A3 = hz("A3");
	const semi = (n, base = A3) => base * Math.pow(2, n / 12);
	const T = (t, f = 7000, g = 0.12, pan = 0) => play(() => tick(f), t, "drums", g, pan, 0.02, "t" + f);
	const K = (t, g = 0.6) => {
		kicks.push(t);
		play(() => roundKick(), t, "drums", g, 0, 0.01, "k");
	};
	const Rim = (t, g = 0.24, pan = 0.15) => play(() => rim(1700), t, "drums", g, pan, 0.05, "rim");
	const Bass = (n, t, dur = 0.2, g = 0.5) => play(() => pulseBass(semi(n, hz("A1")), dur), t, "bass", g, 0, 0, `b${n}${dur}`);
	const Glass = (n, t, g = 0.16, pan = 0, dur = 0.45) => play(() => glass(semi(n, hz("A4")), dur), t, "music", g, pan, 0.12, `g${n}${dur}`);
	const Metal = (n, t, g = 0.18, pan = 0, dur = 0.7) => play(() => metal(semi(n), dur), t, "music", g, pan, 0.15, `m${n}${dur}`);

	// intro: data pouring in under the chat wall, a sweep into the logo
	play(() => grains(6.5, 90, 1100), 0.3, "sfx", 0.12, -0.3, 0.05);
	play(() => grains(6.0, 80, 1650), 0.6, "sfx", 0.1, 0.35, 0.05);
	for (let s = 0; s < 56; s++) if (s % 2 === 0 || s > 32) Bass(0, s * STEP16, 0.08, 0.08 + 0.12 * (s / 56));
	for (let s = 8; s < 56; s++) if (s % 2 === 0 || s > 40) T(s * STEP16, s % 4 ? 7000 : 8500, 0.03 + 0.08 * (s / 56), s % 2 ? 0.5 : -0.5);
	play(() => fm(330, 1.4, { ratio: 2.01, index: 3, floor: 1.5, indexDecay: 1, decay: 0.3, attack: 1.2, sweep: 0.5, sweepT: 1.4 }), WA.logo - 1.4, "sfx", 0.1, 0, 0.05);
	for (let k = 0; k < 7; k++) T(WA.logo - 0.45 + k * (STEP16 / 2), 6000 + k * 500, 0.05 + k * 0.025, k % 2 ? 0.4 : -0.4);

	// the logo: a focal point with space around it
	K(WA.logo, 0.9);
	Bass(0, WA.logo, 1.2, 0.65);
	[0, 3, 7, 14].forEach((n, i) => Glass(n, WA.logo + i * 0.012, 0.14, (i - 1.5) * 0.3, 1.8));
	Metal(12, WA.logo, 0.1, 0, 1.4);
	for (let s = 4; s < 16; s++) {
		const m = WA.motif[s];
		if (m !== null && s % 2 === 0) Glass(m, WA.logo + 0.5 + (s - 4) * STEP16, 0.1, s % 4 ? 0.35 : -0.35, 0.35);
	}
	play(() => airSweep(0.4, 1200, 10000), 9.55, "sfx", 0.12, 0, 0.05);

	// the groove, one 2 s bar at a time; the motif only where nobody is talking
	const talking = (t) => DATA.lines.some((l) => t >= CUES[l.id] - 0.2 && t <= CUES[l.id] + DATA.durs[l.id] + 0.1);
	for (let t0 = WA.groove[0], bi = 0; t0 < WA.groove[1] - 0.01; t0 += 2, bi++) {
		const root = WA.roots[bi % 4];
		const drop = WA.drops.includes(t0);
		if (drop) {
			Metal(root + 12, t0, 0.14, bi % 2 ? 0.3 : -0.3, 0.6);
			if (t0 > WA.groove[0]) play(() => airSweep(0.3, 1500, 9000), t0 - 0.25, "sfx", 0.1, 0, 0.03);
		}
		for (let s = 0; s < 16; s++) {
			const t = t0 + s * STEP16;
			if (WA.kickSteps.includes(s)) K(t, s === 0 ? 0.6 : 0.45);
			if (WA.rimSteps.includes(s)) Rim(t);
			if (WA.bassSteps.includes(s)) Bass(root + (s === 10 ? 12 : 0), t, s === 0 ? 0.24 : 0.14, s === 0 ? 0.5 : 0.36);
			if (s % 2 === 0) T(t, s % 4 === 2 ? 8500 : 7000, s % 4 === 2 ? 0.1 : 0.06, s % 4 === 2 ? 0.5 : -0.5);
			const m = WA.motif[s];
			if (m !== null && !talking(t)) Glass(root + m, t, 0.11, s % 2 ? 0.4 : -0.4, 0.32);
		}
	}

	// the end card: a breath, the resolve, one tick to close
	for (let k = 0; k < 7; k++) T(WA.final - 0.45 + k * (STEP16 / 2), 6000 + k * 500, 0.05 + k * 0.025, k % 2 ? 0.4 : -0.4);
	K(WA.final, 0.9);
	Bass(0, WA.final, 1.4, 0.65);
	[0, 7, 12, 14, 19].forEach((n, i) => Glass(n, WA.final + i * 0.01, 0.13, (i - 2) * 0.28, 2.2));
	Metal(24, WA.final, 0.09, 0, 1.6);
	for (let s = 0; s < 16; s++) {
		const t = WA.final + 0.5 + s * STEP16;
		if (WA.kickSteps.includes(s)) K(t, 0.4);
		if (s % 2 === 0) T(t, 7000, 0.06, s % 4 ? 0.5 : -0.5);
	}
	T(WALK_DUR - 0.5, 3000, 0.18, 0);
	Bass(0, WALK_DUR - 0.5, 0.12, 0.35);

	// ---------- sound design from the picture
	let bubble = 0;
	for (const e of walkEvents()) {
		switch (e.kind) {
			case "tap":
				play(() => roundKick(), e.t, "sfx", 0.18, 0.25, 0.02, "tapk");
				T(e.t, 4200, 0.16, 0.25);
				break;
			case "shot":
				play(() => airSweep(0.18, 2500, 9000), e.t - 0.08, "sfx", 0.06, 0.2, 0.03, "swish");
				break;
			case "whoosh":
				play(() => airSweep(0.45, 800, 9000), e.t - 0.3, "sfx", 0.12, 0, 0.05, "wh");
				break;
			case "tick":
				play(() => fm(1320, 0.07, { ratio: 2, index: 1.2, indexDecay: 30, decay: 40, sweep: 0.6, sweepT: 0.04 }), e.t, "sfx", 0.14, -0.35, 0.04, "tick");
				break;
			case "ping":
				Glass(15, e.t, 0.12, 0.35, 0.4);
				Glass(22, e.t + 0.06, 0.12, 0.35, 0.5);
				break;
			case "pop":
				play(() => fm(1760, 0.07, { ratio: 2, index: 1.2, indexDecay: 30, decay: 40, sweep: 0.6, sweepT: 0.04 }), e.t, "sfx", 0.12, -0.3, 0.04, "pop");
				break;
			case "bubble":
				if (bubble++ % 4 === 0) play(() => buzz(), e.t, "sfx", 0.14, bubble % 2 ? 0.5 : -0.5, 0.05, "buzz");
				else T(e.t, 3500 + (bubble % 5) * 400, 0.1, bubble % 2 ? 0.4 : -0.4);
				break;
			case "thump":
				K(e.t, 0.7);
				Metal(7, e.t, 0.14, 0, 0.5);
				break;
		}
	}

	// ---------- sidechain: a light kick pump; the voice ducks the score
	kicks.sort((a, b) => a - b);
	const look = Math.round(0.06 * SR); // the duck starts just before each word
	let held = 0;
	let ki = 0;
	for (let n = 0; n < len; n++) {
		const v = Math.abs(voice[Math.min(len - 1, n + look)]);
		held = v > held ? held + (v - held) * 0.02 : held * (1 - 1 / (0.28 * SR));
		const duck = 1 - 0.62 * cl(held / 0.08);
		const t = n / SR;
		while (ki + 1 < kicks.length && kicks[ki + 1] <= t) ki++;
		const since = kicks.length && t >= kicks[ki] ? t - kicks[ki] : 9;
		const pump = 0.8 + 0.2 * (1 - Math.exp(-since / 0.07));
		for (const ch of [0, 1]) {
			bus.music[ch][n] *= duck * pump;
			bus.bass[ch][n] *= 0.35 + 0.65 * duck;
			bus.drums[ch][n] *= 0.45 + 0.55 * duck;
			bus.sfx[ch][n] *= 0.75 + 0.25 * duck;
		}
	}

	// ---------- stop-time breaths before the two focal points
	for (const hit of [WA.logo, WA.final]) {
		const a = Math.floor((hit - 0.12) * SR);
		const b = Math.floor((hit - 0.004) * SR);
		for (const k of ["music", "bass", "drums"])
			for (const ch of bus[k]) for (let n = a - 240; n < b; n++) ch[n] *= n < a ? 1 - (n - (a - 240)) / 240 : 0.02;
	}

	// ---------- graph: reverb, glue compression, master
	const ctx = new OfflineAudioContext(2, len, SR);
	const master = ctx.createGain();
	const comp = ctx.createDynamicsCompressor();
	comp.threshold.value = -16;
	comp.knee.value = 8;
	comp.ratio.value = 2.5;
	comp.attack.value = 0.004;
	comp.release.value = 0.15;
	const hpf = ctx.createBiquadFilter();
	hpf.type = "highpass";
	hpf.frequency.value = 28;
	master.connect(hpf);
	hpf.connect(comp);
	comp.connect(ctx.destination);
	const reverb = ctx.createConvolver();
	reverb.buffer = makeIR(ctx, 0.9);
	const rg = ctx.createGain();
	rg.gain.value = 0.2;
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
	src(bus.music, master, 0.7);
	src(bus.bass, master, 0.55);
	src(bus.drums, master, 0.7);
	src(bus.sfx, master, 0.6);
	src(bus.voice, master, 1.0);
	src(bus.rev, reverb, 1.0);
	const out = await ctx.startRendering();

	// soft clip + peak normalise
	let peak = 0;
	for (let ch = 0; ch < 2; ch++) {
		const d = out.getChannelData(ch);
		for (let n = 0; n < d.length; n++) {
			d[n] = Math.tanh(d[n] * 1.1) / Math.tanh(1.1);
			peak = Math.max(peak, Math.abs(d[n]));
		}
	}
	const norm = 0.89 / (peak || 1);
	for (let ch = 0; ch < 2; ch++) {
		const d = out.getChannelData(ch);
		for (let n = 0; n < d.length; n++) d[n] *= norm;
		for (let n = 0; n < 480; n++) d[n] *= n / 480;
		for (let n = 0; n < 12000; n++) d[d.length - 1 - n] *= n / 12000;
	}
	return out;
}
