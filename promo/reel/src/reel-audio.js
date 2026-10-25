/*
 * Soundtrack for the NextQuest reel: a 120 BPM electronic cue plus UI sound
 * design, synthesized in JS (DSP helpers come from ../animation/src/audio.js)
 * and finished with reverb + bus compression in an OfflineAudioContext.
 */
"use strict";

const RA = {
	// chord per bar (bars are 4 beats = 2 s, starting on the feature cuts)
	act1: ["A3", "C4", "E4"],
	hitChord: ["C3", "G3", "C4", "E4", "G4", "D5"],
	bars: [
		[4.5, ["F2", "A3", "C4", "E4"]],
		[6.5, ["G2", "B3", "D4", "G4"]],
		[8.5, ["A2", "C4", "E4", "G4"]],
		[10.5, ["F2", "A3", "C4", "F4"]],
	],
	build: ["G2", "B3", "D4", "F4"],
	final: ["C2", "G3", "C4", "E4", "G4", "D5"],
};

// ------------------------------------------------------------------ synths
function supersaw(freq, dur, o = {}) {
	const x = buf(dur + (o.rel ?? 0.3));
	const det = [-0.14, -0.07, 0, 0.07, 0.14];
	det.forEach((d, i) => osc(x, "saw", freq * Math.pow(2, d / 12), 0.22, i * 731));
	filt(x, "lp", (t) => (o.cut ?? 3200) * (o.sweep ? 0.35 + 0.65 * Math.min(1, t / o.sweep) : 1), 0.9);
	filt(x, "hp", 120, 0.7);
	adsr(x, o.att ?? 0.01, o.dec ?? 0.25, o.sus ?? 0.6, o.rel ?? 0.3, dur);
	return x;
}
function subBass(freq, dur) {
	const x = buf(dur + 0.06);
	osc(x, "saw", freq, 0.25);
	for (let n = 0; n < x.length; n++) x[n] += Math.sin((2 * Math.PI * freq * n) / SR) * 0.9;
	filt(x, "lp", 420, 0.8);
	adsr(x, 0.006, 0.08, 0.85, 0.05, dur);
	return x;
}
function pluckSynth(freq, dur = 0.18) {
	const x = buf(dur + 0.2);
	osc(x, "saw", freq, 0.5);
	osc(x, "square", freq * 2.003, 0.18, 500);
	filt(x, "lp", (t) => 600 + 5200 * Math.exp(-t * 22), 1.4);
	adsr(x, 0.002, 0.12, 0.15, 0.12, dur);
	return x;
}
function blip(freq, dur = 0.05, gain = 1) {
	const x = buf(dur + 0.03);
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		x[n] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 60) * gain;
	}
	return x;
}
function riser(sec, f0 = 300, f1 = 6000) {
	const x = noise(sec);
	filt(x, "bp", (t) => f0 * Math.pow(f1 / f0, t / sec), 1.2);
	let ph = 0;
	for (let n = 0; n < x.length; n++) {
		const t = n / SR;
		const u = t / sec;
		ph += (2 * Math.PI * (180 * Math.pow(7, u))) / SR;
		x[n] = (x[n] * 0.9 + Math.sin(ph) * 0.25) * Math.pow(u, 1.6);
	}
	return x;
}
function impact() {
	const x = kick({ f1: 140, f2: 34, decay: 2.4, len: 1.8 });
	const n = noise(1.2);
	filt(n, "lp", (t) => 6000 * Math.exp(-t * 6) + 150, 0.7);
	for (let k = 0; k < n.length; k++) x[k] += n[k] * 0.7 * Math.exp((-k / SR) * 5);
	return x;
}
function clap() {
	const x = snap();
	const s = snare({ decay: 22 });
	for (let n = 0; n < Math.min(x.length, s.length); n++) x[n] = x[n] * 0.8 + s[n] * 0.5;
	return x;
}

// ------------------------------------------------------------------ score + sfx
async function buildReelSoundtrack() {
	_seed = 777;
	const len = Math.ceil(REEL_DUR * SR);
	const bus = {
		pump: [new Float32Array(len), new Float32Array(len)],
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
	const K = (t, g = 0.9) => {
		kicks.push(t);
		play(() => kick({ f1: 160, f2: 48, decay: 8, len: 0.45 }), t, "drums", g, 0, 0.02, "k");
	};

	// ---------- act 1: tension
	play(() => kick({ f1: 120, f2: 40, decay: 5, len: 0.9 }), 0.0, "sfx", 0.5, 0, 0.2);
	play(() => whoosh(0.5, 3000, 300), 0.0, "sfx", 0.25, 0, 0.2);
	RA.act1.forEach((n, i) => play(() => supersaw(hz(n), 3.3, { att: 0.6, cut: 1400, sus: 0.8, rel: 0.2, sweep: 3 }), 0.05, "pump", 0.16, i - 1, 0.35, "pad1" + n));
	for (let b = 0; b < 12; b++) play(() => hat(55, 9000), 0.25 + b * 0.25, "drums", 0.08 + b * 0.008, 0.4, 0.05, "hat");
	// counter blips (one per value change bucket)
	for (let k = 0; k < 26; k++) {
		const u = k / 26;
		// invert the counter's ease-out so blips follow the digits
		const t = TL.count + 0.85 * (1 - Math.pow(1 - u, 1 / 5)) * 0.999;
		play(() => blip(1800 + k * 40, 0.04), t, "sfx", 0.18, 0.2, 0.05);
	}
	// word hits
	const stabs = [
		["A3", "C4", "E4"],
		["A3", "C4", "E4"],
		["F3", "A3", "C4"],
		["G3", "B3", "D4"],
	];
	TL.words.forEach((t, i) => {
		K(t, 1);
		play(() => clap(), t, "drums", 0.5, 0, 0.25, "clap");
		stabs[i].forEach((n, j) => play(() => supersaw(hz(n), 0.18, { cut: 5000, dec: 0.1, sus: 0.3, rel: 0.15 }), t, "pump", 0.2, j - 1, 0.3, "stab" + n));
		play(() => subBass(hz(stabs[i][0].replace("3", "1")), 0.4), t, "pump", 0.6, 0, 0, "sb" + i);
		play(() => whoosh(0.25, 2500, 400), t - 0.06, "sfx", 0.18, i % 2 ? 0.5 : -0.5, 0.1);
	});
	play(() => riser(0.5, 400, 9000), 3.0, "sfx", 0.5, 0, 0.2);
	play(() => revCymbal(0.6), 2.9, "sfx", 0.35, 0, 0.2);

	// ---------- act 2: logo hit
	play(() => impact(), TL.hit, "sfx", 1.25, 0, 0.25);
	play(() => crash(2.6), TL.hit, "drums", 0.35, 0.1, 0.3, "crash");
	RA.hitChord.forEach((n, i) => play(() => supersaw(hz(n), 0.8, { cut: 6000, dec: 0.5, sus: 0.4, rel: 0.6 }), TL.hit, "pump", 0.13, (i / 5) * 2 - 1, 0.45));
	play(() => sparkle(10, 84, 0.7), TL.hit + 0.08, "sfx", 0.4, 0, 0.45);
	for (let i = 0; i < 9; i++) play(() => blip(3200 + i * 220, 0.03), TL.hit + 0.32 + i * 0.045, "sfx", 0.06, 0.3, 0.05);
	// arpeggio pickup
	const arp = ["C4", "E4", "G4", "C5", "E5", "G5", "C6", "E6"];
	arp.forEach((n, i) => play(() => pluckSynth(hz(n)), 3.75 + i * 0.0625, "pump", 0.16, (i % 2 ? 0.4 : -0.4), 0.3, "pl" + n));
	play(() => whoosh(0.4, 400, 5000), TL.zoom - 0.05, "sfx", 0.45, 0, 0.2);
	play(() => revCymbal(0.45), TL.zoom - 0.05, "sfx", 0.25, 0, 0.2);

	// ---------- act 3: groove (bars on the feature cuts)
	for (const [t0, ch] of RA.bars) {
		for (let b = 0; b < 4; b++) {
			const t = t0 + b * RB;
			K(t);
			if (b % 2 === 1) play(() => clap(), t, "drums", 0.42, 0, 0.2, "clap");
			play(() => hat(18, 7000), t + RB / 2, "drums", 0.16, 0.35, 0.05, "ohat");
			for (let s = 0; s < 4; s++) if (s !== 2) play(() => hat(80, 9000), t + s * (RB / 4), "drums", 0.06 + (s % 2) * 0.03, -0.3, 0.02, "chat");
			// offbeat bass
			play(() => subBass(hz(ch[0]), 0.2), t + RB / 2, "pump", 0.42, 0, 0, "ob" + ch[0]);
			// 16th pluck arp over chord tones
			const tones = ch.slice(1).concat([ch[1].replace(/\d/, (d) => String(Number(d) + 1))]);
			for (let s = 0; s < 4; s++) {
				const n = tones[(b * 4 + s) % tones.length];
				play(() => pluckSynth(hz(n)), t + s * (RB / 4), "pump", 0.11, s % 2 ? 0.35 : -0.35, 0.25, "pl" + n);
			}
		}
		ch.slice(1).forEach((n, i) => play(() => supersaw(hz(n), 1.9, { att: 0.05, cut: 2600, sus: 0.7, rel: 0.2 }), t0, "pump", 0.11, i - 1, 0.35, "pad" + n));
		play(() => subBass(hz(ch[0].replace("2", "1")), 1.9), t0, "pump", 0.16, 0, 0, "sub" + ch[0]);
		if (t0 > TL.feats[0]) {
			play(() => whoosh(0.45, 300, 4000), t0 - 0.28, "sfx", 0.4, 0.3, 0.15);
			play(() => crash(1.2), t0, "drums", 0.12, -0.2, 0.3, "crash12");
		}
	}
	// UI sound design (times mirror reel.js)
	const f = TL.feats;
	for (let i = 0; i < P1_QUERY.length; i++) play(() => clickSfx(2200 + ((i * 397) % 1200)), f[0] + P1_TYPE(i), "sfx", 0.22, 0.3, 0.02);
	play(() => pop(520, 0.12), f[0] + 0.7, "sfx", 0.25, 0.3, 0.1);
	[0.9, 1.0, 1.1].forEach((u, k) => play(() => blip(1100 + k * 330, 0.06), f[0] + u, "sfx", 0.28, 0.4, 0.12));
	play(() => pop(260, 0.18), f[0] + 1.18, "sfx", 0.35, 0.4, 0.1);
	for (let k = 0; k < 12; k++) play(() => blip(2400 + k * 60, 0.025), f[0] + 1.2 + 0.42 * (1 - Math.pow(1 - k / 12, 1 / 5)), "sfx", 0.1, 0.4, 0.02);
	VOTE_STEPS.forEach((s, k) => play(() => blip(900 + k * 90, 0.07), f[1] + s.u, "sfx", 0.3, 0.35, 0.1));
	play(() => {
		const x = clickSfx(1500);
		const y = kick({ f1: 300, f2: 120, decay: 30, len: 0.15 });
		for (let n = 0; n < x.length; n++) y[n] += x[n];
		return y;
	}, f[1] + 1.45, "sfx", 0.55, 0.4, 0.1);
	PICK_STAGE.forEach((u, k) => play(() => whoosh(0.32, 600 + k * 400, 3000 + k * 600), f[2] + u, "sfx", 0.16, 0.4, 0.1));
	[PICK_STAGE[1] + 0.25, PICK_STAGE[2] + 0.25].forEach((u) => play(() => swish(0.3, 1800), f[2] + u, "sfx", 0.25, 0.3, 0.1));
	["C6", "E6", "G6", "C7"].forEach((n, k) => play(() => mallet(hz(n), 0.2, GLOCK), f[2] + PICK_WIN + k * 0.05, "sfx", 0.2, 0.3, 0.35));
	for (let k = 0; k < 9; k++) play(() => blip(mtof(72 + [0, 2, 4, 7, 9, 12, 14, 16, 19][k]), 0.05), f[3] + 0.05 + k * 0.06, "sfx", 0.14, -0.2 + k * 0.08, 0.15);
	play(() => pop(700, 0.12), f[3] + 0.72, "sfx", 0.28, -0.2, 0.1);
	play(() => {
		const x = buf(0.75);
		let ph = 0;
		for (let n = 0; n < x.length; n++) {
			const t = n / SR;
			ph += (2 * Math.PI * (500 + 1300 * (t / 0.75))) / SR;
			x[n] = Math.sin(ph) * 0.3 * Math.min(1, t / 0.05) * Math.min(1, (0.75 - t) / 0.1);
		}
		return x;
	}, f[3] + 0.45, "sfx", 0.18, 0.4, 0.2);
	play(() => mallet(hz("G6"), 0.3, GLOCK), f[3] + 1.4, "sfx", 0.25, 0.4, 0.4);

	// ---------- act 4: build + final
	play(() => whoosh(0.55, 250, 3500), TL.fanIn - 0.05, "sfx", 0.45, 0, 0.2);
	RA.build.slice(1).forEach((n, i) => play(() => supersaw(hz(n), 1.0, { att: 0.02, cut: 1500, sus: 0.8, rel: 0.05, sweep: 1 }), 12.5, "pump", 0.13, i - 1, 0.3));
	TL.kinds.forEach((t, i) => {
		K(t, 0.9);
		play(() => clap(), t, "drums", 0.3 + i * 0.06, 0, 0.2, "clap");
		play(() => subBass(hz(RA.build[0]), 0.2), t, "pump", 0.5, 0, 0, "bsub");
	});
	for (let k = 0; k < 16; k++) play(() => snare({ decay: 30 }), 12.5 + k * 0.0625, "drums", 0.05 + (k / 16) * 0.2, 0.1, 0.1, "roll");
	play(() => riser(1.0, 300, 10000), 12.5, "sfx", 0.45, 0, 0.2);
	play(() => revCymbal(0.7), TL.final - 0.7, "sfx", 0.3, 0, 0.2);
	play(() => impact(), TL.final, "sfx", 1.3, 0, 0.3);
	play(() => crash(2.6), TL.final, "drums", 0.4, -0.1, 0.35, "crash");
	K(TL.final, 1);
	RA.final.forEach((n, i) => play(() => supersaw(hz(n), 1.2, { att: 0.005, cut: 5200, dec: 0.6, sus: 0.45, rel: 0.4 }), TL.final, "pump", 0.13, (i / 5) * 2 - 1, 0.5));
	play(() => subBass(hz("C1"), 1.2), TL.final, "pump", 0.6, 0, 0);
	play(() => sparkle(12, 84, 0.9), TL.final + 0.06, "sfx", 0.4, 0, 0.5);
	[14.15, 14.35].forEach((t) => {
		for (let k = 0; k < 8; k++) play(() => blip(4000 + k * 120, 0.02), t + k * 0.05, "sfx", 0.05, 0.2, 0.05);
	});

	// ---------- sidechain pump on pads/bass/arps
	const [PL, PR] = bus.pump;
	kicks.sort((a, b) => a - b);
	let ki = 0;
	for (let n = 0; n < len; n++) {
		const t = n / SR;
		while (ki + 1 < kicks.length && kicks[ki + 1] <= t) ki++;
		const since = kicks.length && t >= kicks[ki] ? t - kicks[ki] : 9;
		const g = 0.3 + 0.7 * (1 - Math.exp(-since / 0.085));
		PL[n] *= g;
		PR[n] *= g;
	}

	// ---------- drop-outs: a beat of near-silence before each big impact
	for (const hit of [TL.hit, TL.final]) {
		const a = Math.floor((hit - 0.075) * SR);
		const b = Math.floor((hit - 0.005) * SR);
		for (const k of ["pump", "drums", "sfx", "rev"])
			for (const ch of bus[k])
				for (let n = a - 240; n < b; n++) {
					const g = n < a ? 1 - (n - (a - 240)) / 240 : 0.04;
					ch[n] *= g;
				}
	}

	// ---------- graph: reverb, glue compression, master
	const ctx = new OfflineAudioContext(2, len, SR);
	const master = ctx.createGain();
	const comp = ctx.createDynamicsCompressor();
	comp.threshold.value = -12;
	comp.knee.value = 8;
	comp.ratio.value = 2.5;
	comp.attack.value = 0.004;
	comp.release.value = 0.12;
	const hpf = ctx.createBiquadFilter();
	hpf.type = "highpass";
	hpf.frequency.value = 30;
	master.connect(hpf);
	hpf.connect(comp);
	comp.connect(ctx.destination);
	const reverb = ctx.createConvolver();
	reverb.buffer = makeIR(ctx, 1.8);
	const rg = ctx.createGain();
	rg.gain.value = 0.3;
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
	src(bus.pump, master, 0.8);
	src(bus.drums, master, 0.85);
	src(bus.sfx, master, 0.75);
	src(bus.rev, reverb, 1);
	const out = await ctx.startRendering();
	const L = out.getChannelData(0);
	const Rr = out.getChannelData(1);
	let pk = 0;
	for (let n = 0; n < L.length; n++) pk = Math.max(pk, Math.abs(L[n]), Math.abs(Rr[n]));
	const g = pk > 0 ? 0.89 / pk : 1;
	const fade = Math.floor((REEL_DUR - 0.5) * SR);
	for (let n = 0; n < L.length; n++) {
		const ff = n > fade ? Math.max(0, 1 - (n - fade) / (L.length - fade)) : 1;
		L[n] *= g * ff;
		Rr[n] *= g * ff;
	}
	return out;
}
