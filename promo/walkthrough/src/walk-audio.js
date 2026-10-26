/*
 * Soundtrack for the walkthrough: the narration (Kokoro clips cued by id),
 * a 120 BPM half-time cue built from the reel's trap kit (../shared/dsp.js)
 * that ducks under the voice, and UI sound design driven by the picture's
 * own events (walkEvents() in walk.js), mixed and mastered in JS.
 */
"use strict";

const BEAT = 0.5;
const STEP16 = BEAT / 4;
const WA = {
	// the reel's hook (semitones from A5, null = rest)
	riff: [0, null, 0, 3, null, 0, -2, null, -5, null, -5, -2, 0, null, -2, -5],
	riff2: [0, null, 0, 3, null, 5, 3, null, 0, null, 0, -2, 0, 3, 7, 5],
	// half-time groove under the voice: kick on 1 and the "and" of 3, clap on 3
	kickSteps: [0, 10, 11],
	clapSteps: [8],
	// one chord per 2 s bar, cycling i–VI–VII–i in A minor
	roots: ["A", "F", "G", "A"],
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
	const K = (t, g = 0.85) => {
		kicks.push(t);
		play(() => hardKick(), t, "drums", g, 0, 0.02, "k");
	};
	const A5 = hz("A5");
	const bell = (semi, t, g = 0.24, pan = 0, muffle = false) =>
		play(() => (muffle ? filt(cowbell(A5 * Math.pow(2, semi / 12)), "lp", 1100, 0.7) : cowbell(A5 * Math.pow(2, semi / 12))), t, "music", g, pan, 0.2, (muffle ? "m" : "cb") + semi);
	const root = { A: hz("A1"), F: hz("F1"), G: hz("G1") };
	const chord = { A: ["A3", "C4", "E4"], F: ["F3", "A3", "C4"], G: ["G3", "B3", "D4"] };
	const pad = (r, t, dur, g) => chord[r].forEach((nm, i) => play(() => strings(hz(nm), dur, { cut: 1500, attack: 0.5 }), t, "music", g, (i - 1) * 0.5, 0.35, `pad${r}${dur}${i}`));

	// intro: the hook through a wall, the chat buzzing, a riser into the logo
	for (let s = 0; s < 56; s++) {
		const semi = WA.riff[s % 16];
		if (semi !== null) bell(semi, s * STEP16 + 0.0, 0.1 + 0.08 * (s / 56), s % 2 ? 0.3 : -0.3, true);
	}
	pad("A", 0, 7.3, 0.05);
	for (let b = 0; b < 26; b++) play(() => hat(70, 9000), 1 + b * 0.25, "drums", 0.03 + b * 0.002, 0.4, 0.02, "hat");
	play(() => riser(1.8, 300, 9000), WA.logo - 1.8, "sfx", 0.45, 0, 0.2);
	play(() => revCymbal(0.9), WA.logo - 0.9, "sfx", 0.3, 0, 0.2);
	for (let k = 0; k < 8; k++) play(() => snare({ decay: 26 }), WA.logo - 1 + k * 0.125, "drums", 0.06 + k * 0.035, 0, 0.1, "sroll");

	// the logo drop
	play(() => impact(), WA.logo, "sfx", 1.0, 0, 0.25);
	play(() => crash(2.4), WA.logo, "drums", 0.26, 0.1, 0.3, "crash");
	K(WA.logo, 1);
	play(() => bass808(root.A * 2, 1.6, { decay: 1.1 }), WA.logo, "bass", 0.85, 0, 0);
	play(() => stab([hz("A2"), hz("E3"), hz("A3"), hz("C4")], 0.7, { cut: 6000 }), WA.logo, "music", 0.22, 0, 0.35);
	for (let s = 4; s < 16; s++) {
		const semi = WA.riff2[s];
		if (semi !== null) bell(semi, WA.logo + 0.5 + (s - 4) * STEP16, 0.22, s % 2 ? 0.25 : -0.25);
	}
	play(() => whoosh(0.6, 300, 4500), 9.45, "sfx", 0.4, 0, 0.2);

	// the groove, one 2 s bar at a time
	for (let t0 = WA.groove[0], bi = 0; t0 < WA.groove[1] - 0.01; t0 += 2, bi++) {
		const r = WA.roots[bi % 4];
		const nextR = WA.roots[(bi + 1) % 4];
		const drop = WA.drops.includes(t0);
		for (let s = 0; s < 16; s++) {
			const t = t0 + s * STEP16;
			if (WA.kickSteps.includes(s)) K(t, s === 0 ? 0.9 : 0.7);
			if (WA.clapSteps.includes(s)) play(() => hardClap(), t, "drums", 0.36, 0, 0.18, "clap");
			if (s % 2 === 0) play(() => hat(85, 9000), t, "drums", s % 4 === 2 ? 0.09 : 0.055, -0.3, 0.02, "chat");
			if (s === 14) play(() => hat(18, 7000), t, "drums", 0.07, 0.35, 0.05, "ohat");
			// the hook only on each chapter's first bar, while the title lands
			const semi = (bi % 2 ? WA.riff2 : WA.riff)[s];
			if (drop && semi !== null) bell(semi + (r === "F" ? -4 : r === "G" ? -2 : 0), t, 0.2, s % 2 ? 0.25 : -0.25);
		}
		pad(r, t0, 1.9, 0.045);
		play(() => bass808(root[r] * 2, 0.9, { decay: 1.4, drive: 2.4 }), t0, "bass", 0.6, 0, 0, "b" + r);
		play(() => bass808(root[r] * 2, 0.62, { decay: 1.6, drive: 2.4, glideTo: root[nextR] * 2, glideAt: 0.5 }), t0 + 10 * STEP16, "bass", 0.5, 0, 0, "g" + r + nextR);
		if (drop && t0 > WA.groove[0]) {
			play(() => crash(1.6), t0, "drums", 0.14, -0.2, 0.25, "crash1");
			play(() => riser(0.9, 400, 7000), t0 - 0.9, "sfx", 0.22, 0, 0.15);
		}
	}

	// the end card
	play(() => riser(1.4, 300, 10000), WA.final - 1.4, "sfx", 0.4, 0, 0.2);
	for (let k = 0; k < 8; k++) play(() => snare({ decay: 28 }), WA.final - 0.5 + k * 0.0625, "drums", 0.05 + k * 0.03, 0.1, 0.1, "sroll");
	play(() => impact(), WA.final, "sfx", 1.1, 0, 0.3);
	play(() => crash(2.4), WA.final, "drums", 0.3, -0.1, 0.35, "crash");
	K(WA.final, 1);
	play(() => bass808(root.A * 2, 2.2, { decay: 0.9 }), WA.final, "bass", 0.85, 0, 0);
	play(() => stab([hz("A2"), hz("E3"), hz("A3"), hz("C4")], 1.2, { cut: 7000, snap: 5 }), WA.final, "music", 0.24, 0, 0.4);
	pad("A", WA.final, 3, 0.06);
	for (let s = 0; s < 16; s++) {
		const t = WA.final + 0.5 + s * STEP16;
		if (WA.kickSteps.includes(s)) K(t, 0.7);
		if (WA.clapSteps.includes(s)) play(() => hardClap(), t, "drums", 0.32, 0, 0.2, "clap");
		if (s % 2 === 0) play(() => hat(80, 9000), t, "drums", 0.07, -0.3, 0.02, "chat");
		const semi = WA.riff2[s];
		if (semi !== null) bell(semi, t, 0.2, s % 2 ? 0.25 : -0.25);
	}

	// ---------- sound design from the picture
	let bubble = 0;
	for (const e of walkEvents()) {
		switch (e.kind) {
			case "tap":
				play(() => uiClick(1700), e.t, "sfx", 0.42, 0.25, 0.05, "tap");
				break;
			case "shot":
				play(() => swish(0.22, 1600), e.t - 0.05, "sfx", 0.1, 0.2, 0.05, "swish");
				break;
			case "whoosh":
				play(() => whoosh(0.7, 300, 3800), e.t - 0.25, "sfx", 0.32, 0, 0.2, "wh");
				break;
			case "tick":
				play(() => uiSelect(784), e.t, "sfx", 0.15, -0.35, 0.05, "tick");
				break;
			case "ping":
				play(() => uiConfirm(659), e.t, "sfx", 0.17, 0.35, 0.1, "ping");
				play(() => glitch(1100), e.t + 0.12, "sfx", 0.05, 0.35, 0.02, "gl");
				break;
			case "pop":
				play(() => uiSelect(988), e.t, "sfx", 0.13, -0.3, 0.05, "pop");
				break;
			case "bubble":
				if (bubble++ % 4 === 0) play(() => buzz(), e.t, "sfx", 0.18, bubble % 2 ? 0.5 : -0.5, 0.05, "buzz");
				else play(() => pop(700 + (bubble % 5) * 90, 0.08), e.t, "sfx", 0.1, bubble % 2 ? 0.4 : -0.4, 0.05);
				break;
			case "thump":
				K(e.t, 0.8);
				play(() => stab([hz("A2"), hz("E3"), hz("A3")], 0.25), e.t, "music", 0.16, 0, 0.3);
				break;
		}
	}

	// ---------- sidechain: the kick pumps the music; the voice ducks the score
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
		const pump = 0.55 + 0.45 * (1 - Math.exp(-since / 0.07));
		for (const ch of [0, 1]) {
			bus.music[ch][n] *= duck * pump;
			bus.bass[ch][n] *= 0.35 + 0.65 * duck;
			bus.drums[ch][n] *= 0.45 + 0.55 * duck;
			bus.sfx[ch][n] *= 0.75 + 0.25 * duck;
		}
	}

	// ---------- stop-time before the two drops
	for (const hit of [WA.logo, WA.final]) {
		const a = Math.floor((hit - 0.1) * SR);
		const b = Math.floor((hit - 0.004) * SR);
		for (const k of ["music", "bass", "drums"])
			for (const ch of bus[k]) for (let n = a - 240; n < b; n++) ch[n] *= n < a ? 1 - (n - (a - 240)) / 240 : 0.02;
	}

	// ---------- tape stop on the music for the last 0.6 s
	const tsStart = Math.floor((WALK_DUR - 0.6) * SR);
	for (const k of ["music", "bass", "drums"])
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
	reverb.buffer = makeIR(ctx, 1.6);
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
	src(bus.music, master, 0.36);
	src(bus.bass, master, 0.3);
	src(bus.drums, master, 0.36);
	src(bus.sfx, master, 0.45);
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
	}
	return out;
}
