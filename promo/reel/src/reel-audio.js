/*
 * Soundtrack for the NextQuest reel, in the spirit of French electro
 * (Justice's "Genesis"): a dramatic swelling open, a distorted saw-bass riff
 * as the hook over a stomping beat, big detuned stabs on the cuts, heavy
 * sidechain pump, and a hit for every moment on screen (timings from
 * reel.js). Original material; instruments come from ../shared/dsp.js.
 * 120 BPM, A minor.
 */
"use strict";

const STEP = RB / 4; // a 16th note
const RA = {
	// the hook: [step, semitones above A1, length in steps, glide to]
	call: [[0, 0, 3], [3, 12, 1], [4, 10, 2], [6, 7, 2], [8, 0, 2], [10, 3, 2], [12, 5, 1], [13, 7, 1], [14, 10, 2]],
	answer: [[0, 0, 3], [3, 12, 1], [4, 10, 2], [6, 7, 2], [8, 8, 3], [11, 7, 1], [12, 5, 2], [14, 3, 1, 0], [15, 2, 1]],
	// one 2 s bar per feature panel: call, answer, call (doubled up an octave), answer
	bars: [4.5, 6.5, 8.5, 10.5],
	chords: [["A2", "C3", "E3"], ["F2", "A2", "C3"], ["A2", "C3", "E3"], ["F2", "A2", "C3"]],
	kickSteps: [0, 4, 8, 12],
	clapSteps: [4, 12],
	stabSteps: [0, 10],
};

async function buildReelSoundtrack() {
	_seed = 777;
	const len = Math.ceil(REEL_DUR * SR);
	const stereo = () => [new Float32Array(len), new Float32Array(len)];
	const bus = { music: stereo(), bass: stereo(), drums: stereo(), sfx: stereo(), rev: stereo() };
	const cache = new Map();
	function play(fn, when, which, gain = 1, pan = 0, rev = 0.08, key = null) {
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
		}
	}
	const kicks = [];
	const K = (t, g = 0.9) => {
		kicks.push(t);
		play(() => stomp(), t, "drums", g, 0, 0.02, "k");
	};
	const Clap = (t, g = 0.55) => play(() => bigClap(), t, "drums", g, 0, 0.1, "clap");
	const HC = (t, g = 0.12, pan = -0.3) => play(() => hatC(), t, "drums", g, pan, 0.02, "hc");
	const HO = (t, g = 0.14, pan = 0.3) => play(() => hatO(), t, "drums", g, pan, 0.04, "ho");
	const Crash = (t, g = 0.22) => play(() => crashHit(), t, "drums", g, -0.15, 0.2, "crash");
	const A1 = hz("A1");
	const Bass = (semi, t, steps, g = 0.62, glideSemi = null, o = {}) => {
		const dur = steps * STEP - 0.01;
		const f = A1 * Math.pow(2, semi / 12);
		const glide = glideSemi === null ? {} : { glideTo: A1 * Math.pow(2, glideSemi / 12), glideAt: dur * 0.55 };
		play(() => grit(f, dur, { ...glide, ...o }), t, "bass", g, 0, 0, `b${semi}${steps}${glideSemi}${o.cut ?? ""}`);
	};
	const chord = (names, oct = 0) => names.map((nm) => hz(nm) * Math.pow(2, oct));
	const Stab = (names, t, dur = 0.22, g = 0.3, o = {}) => play(() => stabChord(chord(names), dur, o), t, "music", g, 0, 0.2, `s${names}${dur}${o.swell ?? ""}`);
	const Pluck = (name, t, g = 0.16, pan = 0.35) => play(() => stabChord([hz(name)], 0.08, { cut: 5000, snapK: 25, sustain: 0.3, release: 0.1 }), t, "sfx", g, pan, 0.12, "p" + name);
	const riff = (pattern, t0, from = 0, to = 16, g = 0.62, o = {}) => {
		for (const [s, semi, steps, glide = null] of pattern) if (s >= from && s < to) Bass(semi, t0 + (s - from) * STEP, steps, g, glide, o);
	};

	// ---------- act 1: a dramatic swell over the group-chat wall
	play(() => boom(1.6), TL.laser, "sfx", 0.45, 0, 0.1);
	play(() => crashHit(2.4), TL.laser, "drums", 0.16, 0.2, 0.3);
	Stab(["A1", "A2", "E3", "A3", "C4"], TL.laser + 0.05, 1.4, 0.34, { swell: true, attack: 1.1, sustain: 1, release: 0.15, drive: 3.2 });
	play(() => riseUp(1.45, 200, 6000), 0.05, "sfx", 0.22, 0, 0.1);
	// the counter ticks, hat by hat
	for (let k = 0; k < 26; k++) {
		const u = k / 26;
		HC(TL.count + 0.85 * (1 - Math.pow(1 - u, 1 / 5)) * 0.999, 0.06 + u * 0.08, k % 2 ? 0.45 : -0.45);
	}
	// ANYONE / UP FOR / A GAME / TONIGHT?  one huge hit per word, the last one a dominant
	const wordChords = [["A2", "C3", "E3"], ["A2", "C3", "E3"], ["F2", "A2", "C3"], ["E2", "G#2", "B2"]];
	const wordBass = [0, 0, -4, -5];
	TL.words.forEach((t, i) => {
		K(t, 1);
		Clap(t, 0.5);
		Stab(wordChords[i], t, 0.32, 0.36, { drive: 3 });
		Bass(wordBass[i], t, 3, 0.7);
		Bass(wordBass[i] + 12, t + 3 * STEP, 1, 0.45);
		HO(t + 2 * STEP, 0.08 + i * 0.03);
	});
	// clap roll and riser into the logo, then a breath
	for (let k = 0; k < 6; k++) Clap(3.0 + 0.125 + k * 0.0625 * (k > 2 ? 0.75 : 1), 0.12 + k * 0.06);
	play(() => riseUp(0.5, 300, 9000), 3.0, "sfx", 0.3, 0, 0.1);

	// ---------- act 2: the drop on the logo, the riff arrives
	Crash(TL.hit, 0.3);
	K(TL.hit, 1);
	Clap(TL.hit, 0.35);
	play(() => boom(1.2), TL.hit, "sfx", 0.32, 0, 0.05);
	Stab(["A2", "E3", "A3", "C4"], TL.hit, 0.5, 0.36, { drive: 3.2 });
	riff(RA.call, TL.hit, 0, 8);
	for (let s = 0; s < 8; s++) {
		if (s % 4 === 0 && s) K(TL.hit + s * STEP, 0.85);
		if (s === 4) Clap(TL.hit + s * STEP);
		if (s % 4 === 2) HO(TL.hit + s * STEP);
		HC(TL.hit + s * STEP, s % 2 ? 0.06 : 0.1);
	}
	play(() => riseUp(0.28, 1500, 10000), TL.zoom - 0.22, "sfx", 0.16, 0, 0.05);

	// ---------- act 3: the groove; call, answer, call doubled, answer
	RA.bars.forEach((t0, bi) => {
		const pattern = bi % 2 ? RA.answer : RA.call;
		riff(pattern, t0);
		if (bi === 2) riff(pattern, t0, 0, 16, 0.22, { cut: 2600, snap: 2500 }); // the octave-up double
		Crash(t0, bi === 0 ? 0.24 : 0.14);
		for (const s of RA.stabSteps) Stab(RA.chords[bi], t0 + s * STEP, s ? 0.16 : 0.26, s ? 0.2 : 0.28);
		for (let s = 0; s < 16; s++) {
			const t = t0 + s * STEP;
			if (RA.kickSteps.includes(s)) K(t, s === 0 ? 0.95 : 0.85);
			if (RA.clapSteps.includes(s)) Clap(t);
			if (s % 4 === 2) HO(t, 0.13);
			HC(t, s % 2 ? 0.05 : 0.09, s % 2 ? 0.4 : -0.4);
		}
		// a fill into every cut
		if (bi < 3) for (let k = 0; k < 3; k++) Clap(t0 + (13 + k) * STEP, 0.12 + k * 0.06);
	});

	// UI hits (times mirror reel.js), small and gritty so the riff stays in front
	const f = TL.feats;
	// 01 post
	for (let i = 0; i < P1_QUERY.length; i += 2) HC(f[0] + P1_TYPE(i), 0.07, 0.4);
	Pluck("E5", f[0] + P1_WHEN_T);
	Pluck("A5", f[0] + P1_VIS_T);
	Clap(f[0] + P1_POST_T, 0.3);
	Stab(["A4", "C5", "E5"], f[0] + P1_POST_T, 0.12, 0.14);
	// 02 discord: the card lands, edits as people join, then the reminder
	Pluck("A4", f[1] + 0.14);
	P2_JOIN.forEach((j, k) => Pluck(["C5", "E5", "G5"][k], f[1] + j.u));
	for (let k = 0; k < 3; k++) HC(f[1] + P2_REMIND_T + k * 0.03, 0.1, 0.4);
	Pluck("A5", f[1] + P2_REMIND_T + 0.09, 0.12);
	// 03 join: a guest arrives from an invite link, then I'm in
	play(() => riseUp(0.2, 1200, 8000), f[2] + P3_GUEST_T - 0.15, "sfx", 0.12, 0.4, 0.05);
	Clap(f[2] + P3_IN_T, 0.28);
	Stab(["C5", "E5", "G5"], f[2] + P3_IN_T, 0.12, 0.13);
	// 04 wrap up: ticks, rising stars, a line of text, same time next week, stats
	for (let k = 0; k < 5; k++) HC(f[3] + 0.2 + k * 0.06, 0.1, -0.2 + k * 0.1);
	P4_STARS.forEach((u, k) => Pluck(["A4", "C5", "E5", "A5"][k], f[3] + u, 0.13));
	for (let i = 0; i < P4_RECAP.length; i += 4) HC(f[3] + P4_RECAP_T(i), 0.05, 0.4);
	Pluck("E5", f[3] + P4_REPEAT_T);
	[0, 0.04, 0.08].forEach((d, k) => Pluck(["A5", "C6", "E6"][k], f[3] + P4_STATS_T + d, 0.1));

	// ---------- act 4: four rising hits, a roll, a breath, the final drop
	play(() => riseUp(1.0, 250, 9000), TL.kinds[0] - 0.08, "sfx", 0.28, 0, 0.1);
	const kindChords = [["A2", "C3", "E3"], ["C3", "E3", "G3"], ["D3", "F3", "A3"], ["E3", "G#3", "B3"]];
	const kindBass = [0, 3, 5, 7];
	TL.kinds.forEach((t, i) => {
		K(t, 1);
		Clap(t, 0.4);
		Stab(kindChords[i], t, 0.2, 0.32);
		Bass(kindBass[i], t, 2, 0.7);
	});
	for (let k = 0; k < 6; k++) Clap(TL.final - 0.42 + k * 0.0625 * (k > 3 ? 0.8 : 1), 0.1 + k * 0.06);
	Crash(TL.final, 0.34);
	K(TL.final, 1);
	Clap(TL.final, 0.4);
	play(() => boom(1.5), TL.final, "sfx", 0.38, 0, 0.05);
	Stab(["A2", "E3", "A3", "C4", "E4"], TL.final, 0.7, 0.38, { drive: 3.4 });
	riff(RA.call, TL.final, 0, 8);
	for (let s = 0; s < 8; s++) {
		if (s % 4 === 0 && s) K(TL.final + s * STEP, 0.9);
		if (s === 4) Clap(TL.final + s * STEP);
		if (s % 4 === 2) HO(TL.final + s * STEP);
		HC(TL.final + s * STEP, s % 2 ? 0.06 : 0.1);
	}
	// the last word: one big chord on the lockup, left to ring out
	const end = TL.final + 1.0;
	K(end, 1);
	Clap(end, 0.35);
	Crash(end, 0.26);
	Stab(["A1", "A2", "E3", "A3", "C4"], end, 0.36, 0.36, { drive: 3.2, release: 0.12 });
	Bass(0, end, 3, 0.75);

	// ---------- heavy sidechain pump on the bass and synths
	kicks.sort((a, b) => a - b);
	let ki = 0;
	for (let n = 0; n < len; n++) {
		const t = n / SR;
		while (ki + 1 < kicks.length && kicks[ki + 1] <= t) ki++;
		const since = kicks.length && t >= kicks[ki] ? t - kicks[ki] : 9;
		const g = 0.22 + 0.78 * (1 - Math.exp(-since / 0.09));
		for (const k of ["music", "bass"]) {
			bus[k][0][n] *= g;
			bus[k][1][n] *= g;
		}
	}

	// ---------- stop-time breaths before the two drops
	for (const hit of [TL.hit, TL.final]) {
		const a = Math.floor((hit - 0.08) * SR);
		const b = Math.floor((hit - 0.004) * SR);
		for (const k of ["music", "bass", "drums", "rev"])
			for (const ch of bus[k]) for (let n = a - 240; n < b; n++) ch[n] *= n < a ? 1 - (n - (a - 240)) / 240 : 0.02;
	}

	// ---------- graph: a short room, presence, glue compression, saturation
	const ctx = new OfflineAudioContext(2, len, SR);
	const master = ctx.createGain();
	const comp = ctx.createDynamicsCompressor();
	comp.threshold.value = -14;
	comp.knee.value = 6;
	comp.ratio.value = 2.5;
	comp.attack.value = 0.003;
	comp.release.value = 0.1;
	const hpf = ctx.createBiquadFilter();
	hpf.type = "highpass";
	hpf.frequency.value = 36;
	const presence = ctx.createBiquadFilter();
	presence.type = "peaking";
	presence.frequency.value = 2400;
	presence.Q.value = 0.8;
	presence.gain.value = 3.5;
	master.connect(hpf);
	hpf.connect(presence);
	presence.connect(comp);
	comp.connect(ctx.destination);
	const reverb = ctx.createConvolver();
	reverb.buffer = makeIR(ctx, 1.1);
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
	src(bus.bass, master, 0.5);
	src(bus.music, master, 0.85);
	src(bus.drums, master, 0.85);
	src(bus.sfx, master, 0.8);
	src(bus.rev, reverb, 1.0);
	const out = await ctx.startRendering();

	// saturating limiter + peak normalise, short fades at both ends
	let peak = 0;
	for (let ch = 0; ch < 2; ch++) {
		const d = out.getChannelData(ch);
		for (let n = 0; n < d.length; n++) {
			d[n] = Math.tanh(d[n] * 1.15) / Math.tanh(1.15);
			peak = Math.max(peak, Math.abs(d[n]));
		}
	}
	const norm = 0.84 / (peak || 1);
	for (let ch = 0; ch < 2; ch++) {
		const d = out.getChannelData(ch);
		for (let n = 0; n < d.length; n++) d[n] *= norm;
		for (let n = 0; n < 240; n++) d[n] *= n / 240;
		for (let n = 0; n < 9600; n++) d[d.length - 1 - n] *= n / 9600;
	}
	return out;
}
