/*
 * The NextQuest promo timeline. Everything is a pure function of time `t` (seconds),
 * so the same code drives realtime playback and frame-accurate video export.
 *
 * Beat grid: 100 BPM (0.6 s per beat). Big hits land on beats; narration lines
 * and word-level cues come from the TTS pause analysis (see build notes).
 */
"use strict";

const DURATION = 47.5;

/** Narration line start times (seconds) — must match the narration track. */
const LINES = [1.2, 3.75, 5.1, 9.8, 13.0, 19.0, 21.9, 24.6, 30.0, 34.6, 39.3, 40.9];
const LINE_DURS = [1.525, 1.002, 4.358, 2.784, 4.844, 2.482, 2.32, 4.383, 4.248, 3.373, 1.004, 2.521];

/** Word-level cues derived from pauses in each narration line. */
const CUE = {
	shadow: 2.55,
	thud: 3.6,
	sign: 3.8,
	video: 5.1,
	tabletop: 5.98,
	board: 7.22,
	someday: 8.45,
	whip1: 9.25,
	logo: 9.6,
	subtitle: 10.95,
	toApp: 12.25,
	typeStart: 13.45,
	card: 14.65,
	hours: 15.76,
	difficulty: 16.25,
	acclaim: 17.2,
	formula: 17.35,
	stamp: 18.0,
	vote: 18.9,
	ten: 19.95,
	coins: 20.15,
	curtain: 21.9,
	lock: 22.3,
	hurt: 23.11,
	pick: 24.45,
	interest: 25.15,
	time: 25.97,
	around: 26.54,
	whatsNext: 27.8,
	hit: 29.4,
	events: 29.95,
	paint: 30.0,
	rsvp: 31.45,
	calendar: 33.45,
	dash: 34.35,
	chart: 34.8,
	whip2: 36.15,
	shrink: 36.99,
	hop: 37.75,
	flag: 38.4,
	finale: 39.0,
	nq: 39.3,
	stop: 40.9,
	start: 42.55,
	sting: 43.8,
	iris: 46.0,
};

// ------------------------------------------------------------------ world layout
const GROUND_Y = 330;
const PILE_X = 470;
const PARTY_X = [-960, -805, -650, -495];
const DESK_Y = 580;
const DESK_X = [2560, 2760, 3640, 3840];
const CX = WIN.x + WIN.side + 40; // app content origin
const CY = WIN.y + WIN.bar + 36;
const CW = WIN.w - WIN.side - 80;

// ------------------------------------------------------------------ camera
const CAM_KEYS = [
	// t, x, y, zoom, ease-into-this-key
	[0, -700, 175, 1.62],
	[2.9, -690, 150, 1.6, Ease.inOutSine],
	[3.6, -690, 150, 1.6],
	[4.35, 10, -110, 0.8, Ease.outCubic],
	[9.2, 20, -150, 0.85, Ease.inOutSine],
	[9.75, 3200, -40, 1.0, Ease.inOutExpo],
	[12.2, 3200, -50, 1.05, Ease.inOutSine],
	[12.95, 3200, 30, 0.97, Ease.inOutCubic],
	[13.6, 3300, -15, 1.12, Ease.inOutCubic],
	[18.7, 3310, -20, 1.14, Ease.inOutSine],
	[19.25, 3200, 60, 0.95, Ease.inOutCubic],
	[24.3, 3200, 55, 0.96, Ease.inOutSine],
	[24.8, 3250, -10, 1.06, Ease.inOutCubic],
	[29.2, 3250, -10, 1.08, Ease.inOutSine],
	[29.45, 3250, 10, 1.0, Ease.outCubic],
	[30.1, 3250, -10, 1.06, Ease.inOutCubic],
	[34.2, 3250, -10, 1.06],
	[34.6, 3260, -20, 1.1, Ease.inOutCubic],
	[36.1, 3265, -20, 1.12, Ease.inOutSine],
	[36.65, 80, -60, 0.82, Ease.inOutExpo],
	[38.45, 470, 40, 0.98, Ease.inOutSine],
	[38.95, 470, -320, 0.67, Ease.inOutCubic],
	[47.5, 470, -330, 0.7, Ease.inOutSine],
];

const SHAKES = [
	{ t: CUE.thud, amp: 26, dur: 0.7 },
	{ t: CUE.stamp, amp: 9, dur: 0.35 },
	{ t: CUE.hit, amp: 10, dur: 0.4 },
	{ t: CUE.flag, amp: 7, dur: 0.3 },
	{ t: CUE.finale, amp: 14, dur: 0.5 },
];

function camera(t) {
	let k = 0;
	while (k < CAM_KEYS.length - 1 && CAM_KEYS[k + 1][0] <= t) k++;
	const a = CAM_KEYS[k];
	const b = CAM_KEYS[Math.min(k + 1, CAM_KEYS.length - 1)];
	let x = a[1];
	let y = a[2];
	let z = a[3];
	if (b !== a && t > a[0]) {
		const e = b[4] ?? Ease.inOutCubic;
		const u = e(clamp((t - a[0]) / (b[0] - a[0])));
		x = lerp(a[1], b[1], u);
		y = lerp(a[2], b[2], u);
		z = lerp(a[3], b[3], u);
	}
	let sx = 0;
	let sy = 0;
	let rot = 0;
	for (const s of SHAKES) {
		if (t >= s.t && t < s.t + s.dur) {
			const f = 1 - (t - s.t) / s.dur;
			const amp = s.amp * f * f;
			sx += amp * vnoise(t * 38 + s.t);
			sy += amp * vnoise(t * 41 + s.t + 50);
			rot += amp * 0.0012 * vnoise(t * 30 + s.t + 90);
		}
	}
	// whip-pan velocity (for speed lines)
	const vx = (() => {
		const dt = 1 / 60;
		if (t + dt > DURATION) return 0;
		return 0;
	})();
	void vx;
	return { x: x + sx / z, y: y + sy / z, z, rot };
}

function whipAmount(t) {
	// speed-line intensity during the two whip pans
	return Math.max(env(t, 9.3, 9.72, 0.15, 0.2), env(t, 36.2, 36.62, 0.15, 0.2));
}

// ------------------------------------------------------------------ the backlog pile
const PILE_KINDS_BASE = ["box", "box", "cart", "ctrl", "book", "board", "d20", "box", "scroll", "meeple", "d6", "box"];
const PALETTE_ITEMS = [COL.coral, COL.violet, COL.cyan, COL.green, COL.yellow, "#ff9d5c", "#6f8cff", "#e06bb5"];
let PILE_ITEMS = null;

function buildPile() {
	const rnd = mulberry32(42);
	const items = [];
	for (let r = 0; r < 9; r++) {
		const yy = -34 - r * 64;
		const hw = 540 * Math.pow(Math.max(0, 1 - (r * 64 + 34) / 660), 0.72);
		const count = Math.max(1, Math.round((2 * hw) / 105));
		for (let i = 0; i < count; i++) {
			const x = -hw + (i + 0.5) * ((2 * hw) / count) + (rnd() - 0.5) * 34;
			items.push({
				kind: PILE_KINDS_BASE[Math.floor(rnd() * PILE_KINDS_BASE.length)],
				x,
				y: yy + (rnd() - 0.5) * 18,
				rot: (rnd() - 0.5) * 0.7,
				s: 0.9 + rnd() * 0.3,
				color: PALETTE_ITEMS[Math.floor(rnd() * PALETTE_ITEMS.length)],
				seed: 100 + items.length * 7,
				row: r,
				group: "base",
			});
		}
	}
	// the pile grows during "video games, tabletop campaigns, board games"
	const groups = [
		{ g: "video", t: CUE.video, kinds: ["box", "ctrl", "cart", "box", "ctrl", "cart"], span: 0.75 },
		{ g: "tabletop", t: CUE.tabletop, kinds: ["book", "d20", "scroll", "book", "d20", "scroll"], span: 1.0 },
		{ g: "board", t: CUE.board, kinds: ["board", "meeple", "d6", "board", "meeple", "d6"], span: 0.65 },
	];
	let slot = 0;
	for (const gr of groups) {
		gr.kinds.forEach((kind, j) => {
			const layer = Math.floor(slot / 6);
			const pos = slot % 6;
			const x = (pos - 2.5) * (120 - layer * 25) + (rnd() - 0.5) * 30;
			const y = -600 - layer * 70 + (rnd() - 0.5) * 20;
			items.push({
				kind,
				x,
				y: y + Math.abs(pos - 2.5) * 22,
				rot: (rnd() - 0.5) * 0.8,
				s: 0.95 + rnd() * 0.25,
				color: PALETTE_ITEMS[Math.floor(rnd() * PALETTE_ITEMS.length)],
				seed: 500 + slot * 11,
				row: 7 + layer,
				group: gr.g,
				drop: gr.t + (j / gr.kinds.length) * gr.span,
			});
			slot++;
		});
	}
	// which base items survive the shrink (bottom-centre)
	for (const it of items) it.keep = it.group === "base" && it.row <= 1 && Math.abs(it.x) < 300;
	// poof order: top first
	const doomed = items.filter((it) => !it.keep).sort((a, b) => a.y - b.y);
	doomed.forEach((it, i) => {
		it.poof = CUE.shrink + 0.02 + (i / doomed.length) * 0.95;
	});
	PILE_ITEMS = items;
}

function drawItem(ctx, it, x, y, s, rot) {
	switch (it.kind) {
		case "box":
			drawBox(ctx, x, y, 92 * s, 118 * s, it.color, it.seed, rot, it.seed);
			break;
		case "cart":
			drawCartridge(ctx, x, y, s * 1.05, it.color, it.seed, rot);
			break;
		case "ctrl":
			drawController(ctx, x, y, s, it.seed % 2 ? COL.slate3 : "#5b6b8c", it.seed, rot);
			break;
		case "book":
			drawBook(ctx, x, y, s * 1.05, it.color, it.seed, rot);
			break;
		case "board":
			drawBoardBox(ctx, x, y, s, it.color, it.seed, rot);
			break;
		case "d20":
			drawD20(ctx, x, y, s * 0.95, it.seed % 2 ? COL.violet : COL.coral, it.seed, rot);
			break;
		case "scroll":
			drawScroll(ctx, x, y, s, it.seed, rot);
			break;
		case "meeple":
			drawMeeple(ctx, x, y, s, it.color, it.seed, rot);
			break;
		case "d6":
			drawD6(ctx, x, y, s * 1.2, COL.white, it.seed, rot, [1, 3, 5, 6][it.seed % 4]);
			break;
	}
}

function pileHeightNow(t) {
	// top of the pile (local y, negative = up)
	let top = -600;
	for (const it of PILE_ITEMS) {
		if (it.group === "base") continue;
		if (it.drop !== undefined && t >= it.drop + 0.35 && (it.poof === undefined || t < it.poof)) top = Math.min(top, it.y - 60);
	}
	return top;
}

function drawPile(ctx, t) {
	if (t < 3.0) return;
	// fall in as one mass
	const fallT = prog(t, 3.08, 0.52, Ease.inQuad);
	const fallY = lerp(-1700, 0, fallT);
	const impact = spring(t, CUE.thud, 2.6, 5.5);
	const sy = 1 - 0.16 * impact;
	const sx = 1 + 0.1 * impact;
	// shrink phase
	const shrinkP = prog(t, CUE.shrink, 1.05, Ease.inOutCubic);
	ctx.save();
	ctx.translate(PILE_X, GROUND_Y + fallY);
	ctx.scale(sx, sy);
	// wobble when items land
	let jig = 0;
	for (const it of PILE_ITEMS) if (it.drop !== undefined) jig += spring(t, it.drop + 0.35, 4, 9) * 0.012;
	ctx.scale(1 - jig * 0.5, 1 + jig);

	// mound backing
	const top = t < CUE.video ? -600 : pileHeightNow(t);
	const moundH = lerp(-top + 30, 190, shrinkP);
	const moundW = lerp(580, 330, shrinkP);
	const mound = Shp.path(
		`M${-moundW},0 C${-moundW * 0.8},${-moundH * 0.45} ${-moundW * 0.45},${-moundH} 0,${-moundH} C${moundW * 0.45},${-moundH} ${moundW * 0.8},${-moundH * 0.45} ${moundW},0 Z`,
	)[0];
	wash(ctx, mound, "#b79f80", { seed: 900, alpha: 0.55, off: [0, 0] });
	hatch(ctx, mound, { gap: 13, alpha: 0.22, seed: 901, angle: 0.8 });

	// items
	for (const it of PILE_ITEMS) {
		let x = it.x;
		let y = it.y;
		let s = it.s;
		let rot = it.rot;
		if (it.drop !== undefined) {
			if (t < it.drop) continue;
			const u = clamp((t - it.drop) / 0.35);
			y = lerp(it.y - 900, it.y, Ease.inQuad(u));
			rot = it.rot + (1 - u) * 1.8;
			if (u >= 1) {
				const b = spring(t, it.drop + 0.35, 3, 7);
				y -= b * 18;
			}
		}
		if (it.poof !== undefined && t >= it.poof) {
			const u = clamp((t - it.poof) / 0.22);
			if (u >= 1) continue;
			s *= 1 - Ease.inBack(u, 2.5);
			if (s <= 0.02) continue;
		}
		if (it.keep && shrinkP > 0) {
			// survivors settle together
			x = lerp(it.x, it.x * 0.75, shrinkP);
		}
		drawItem(ctx, it, x, y, s, rot);
	}
	// puffs
	for (const it of PILE_ITEMS) {
		if (it.poof !== undefined && it.seed % 2 === 0 && t >= it.poof && t < it.poof + 0.5) {
			const u = (t - it.poof) / 0.5;
			drawPuff(ctx, it.x, it.y, 26 + 34 * Ease.outCubic(u), (1 - u) * 0.85, it.seed);
		}
	}

	// face
	const faceA = prog(t, 4.05, 0.3) * (1 - prog(t, CUE.shrink + 0.45, 0.3));
	if (faceA > 0) drawPileFace(ctx, t, faceA, top);

	// sign
	const signP = prog(t, CUE.sign, 0.45, Ease.outBack);
	const signOut = prog(t, CUE.shrink + 0.1, 0.35, Ease.inBack);
	if (signP > 0 && signOut < 1) {
		ctx.save();
		ctx.translate(-20, 10);
		ctx.rotate(-0.06 + spring(t, CUE.sign, 2, 4) * 0.1);
		ctx.scale(signP * (1 - signOut), signP * (1 - signOut));
		const post = Shp.rrect(-10, -40, 20, 190, 6, { os: 0 });
		wash(ctx, post, COL.woodDark, { seed: 950 });
		stroke(ctx, post, { w: 3.6, seed: 950 });
		const board = Shp.rrect(-185, -140, 370, 110, 12, { os: 0 });
		wash(ctx, board, COL.wood, { seed: 951, hl: 0.25 });
		for (let k = 0; k < 3; k++)
			stroke(ctx, Shp.line(-170, -118 + k * 34, -40 + k * 60, -118 + k * 34), { w: 1.8, alpha: 0.3, seed: 952 + k, color: COL.woodDark });
		sketch(ctx, board, { w: 4.4, seed: 951 });
		htext(ctx, "THE BACKLOG", 0, -66, { size: 50, weight: 800, align: "center", p: prog(t, CUE.sign + 0.05, 0.5, Ease.linear), seed: 4 });
		ctx.restore();
	}

	// sticky note: "someday..."
	const noteP = prog(t, CUE.someday, 0.25, Ease.outBack);
	const noteOut = prog(t, CUE.shrink + 0.2, 0.3, Ease.inBack);
	if (noteP > 0 && noteOut < 1) {
		ctx.save();
		ctx.translate(250, top + 120);
		ctx.rotate(0.14 + spring(t, CUE.someday + 0.25, 3, 6) * 0.08);
		const sc = lerp(1.8, 1, noteP) * (1 - noteOut);
		ctx.scale(sc, sc);
		ctx.globalAlpha = clamp(noteP * 2);
		const note = Shp.rrect(-100, -90, 200, 170, 4, { os: 0 });
		ctx.save();
		ctx.globalAlpha *= 0.2;
		solid(ctx, Shp.rrect(-92, -80, 200, 170, 4, { os: 0 }), "#5a4020");
		ctx.restore();
		wash(ctx, note, "#ffe36e", { seed: 960, hl: 0.3 });
		stroke(ctx, note, { w: 3, seed: 960 });
		solid(ctx, Shp.rrect(-100, -90, 200, 26, 2, { os: 0 }), "#f5cf3a", 0.8);
		htext(ctx, "someday...", 0, 20, { size: 50, font: FONT_SCRIPT, weight: 700, align: "center", color: "#2a2f40", mode: "write", p: prog(t, CUE.someday + 0.1, 0.5, Ease.linear), seed: 12 });
		ctx.restore();
	}
	ctx.restore();

	// dust clouds at impact
	if (t >= CUE.thud && t < CUE.thud + 1.4) {
		const u = (t - CUE.thud) / 1.4;
		for (let k = 0; k < 7; k++) {
			const dir = k < 4 ? -1 : 1;
			const kk = k % 4;
			const x = PILE_X + dir * (500 + kk * 90 + Ease.outCubic(u) * (220 + kk * 60));
			const y = GROUND_Y - 30 - kk * 18 - u * 40;
			drawPuff(ctx, x, y, 50 + kk * 16 + u * 60, (1 - u) * 0.95, 30 + k, "#efe3cc");
		}
	}
}

function drawPileFace(ctx, t, a, top) {
	const shocked = t >= CUE.shrink;
	const fy = Math.max(top * 0.55, -380);
	ctx.save();
	ctx.globalAlpha *= a;
	const open = prog(t, 4.05, 0.25, Ease.outBack);
	const look = t < CUE.video ? [-0.8, 0.2] : [-0.6 + 0.4 * Math.sin(t * 1.3), 0.1];
	for (const side of [-1, 1]) {
		const ex = side * 92 - 10;
		const ey = fy + (side > 0 ? 8 : 0);
		const rx = shocked ? 58 : 54;
		const ry = (shocked ? 60 : 44) * open;
		if (ry < 1) continue;
		const e = Shp.ellipseFill(ex, ey, rx, ry, 30);
		solid(ctx, e, COL.white);
		const px = ex + look[0] * 16;
		const py = ey + look[1] * 10 + (shocked ? 0 : 6);
		ctx.fillStyle = INK;
		ctx.beginPath();
		ctx.arc(px, py, shocked ? 9 : 14, 0, TAU);
		ctx.fill();
		// heavy grumpy lid
		if (!shocked) {
			ctx.save();
			ctx.beginPath();
			ctx.moveTo(e[0][0], e[0][1]);
			for (const q of e) ctx.lineTo(q[0], q[1]);
			ctx.clip();
			solid(
				ctx,
				[
					[ex - rx - 5, ey - ry - 5],
					[ex + rx + 5, ey - ry - 5],
					[ex + rx + 5, ey - ry * 0.1 + side * 8],
					[ex - rx - 5, ey - ry * 0.1 - side * 8],
				],
				"#9a8466",
			);
			ctx.restore();
			stroke(ctx, Shp.line(ex - rx, ey - ry * 0.1 - side * 8, ex + rx, ey - ry * 0.1 + side * 8), { w: 5, seed: 970 + side });
		}
		stroke(ctx, Shp.ellipse(ex, ey, rx, ry, { os: 0.08 }), { w: 5, seed: 972 + side });
		// brow
		const by = ey - ry - 16;
		const brow = shocked
			? Shp.path(`M${ex - 36},${by - 10} Q${ex},${by - 26} ${ex + 36},${by - 10}`)[0]
			: Shp.line(ex - 40, by - side * 12, ex + 40, by + side * 12);
		stroke(ctx, brow, { w: 11, seed: 974 + side });
	}
	// mouth
	const my = fy + 118;
	const mouth = shocked
		? Shp.ellipse(-10, my, 30, 36)
		: Shp.path(`M-80,${my} Q-50,${my - 18} -20,${my} Q10,${my + 16} 40,${my - 2} Q60,${my - 12} 70,${my - 4}`)[0];
	if (shocked) solid(ctx, Shp.ellipseFill(-10, my, 30, 36, 24), "#3a1f2a");
	stroke(ctx, mouth, { w: 8, seed: 980 });
	ctx.restore();
}

// ------------------------------------------------------------------ scene 1: the party + ground
function drawGround(ctx, t) {
	const p = prog(t, 0.05, 1.0, Ease.outCubic);
	stroke(ctx, Shp.path(`M-2600,${GROUND_Y + 6} C-1500,${GROUND_Y - 8} -300,${GROUND_Y + 10} 300,${GROUND_Y} S1800,${GROUND_Y - 6} 2800,${GROUND_Y + 4}`)[0], {
		w: 5,
		p,
		seed: 1,
	});
	// grass tufts & pebbles
	const rnd = mulberry32(7);
	for (let k = 0; k < 40; k++) {
		const x = -2300 + k * 125 + rnd() * 50;
		const kp = prog(t, 0.2 + k * 0.02, 0.4);
		if (kp <= 0) continue;
		if (k % 3 === 0) {
			stroke(ctx, Shp.ellipse(x, GROUND_Y + 18 + rnd() * 20, 8 + rnd() * 6, 4 + rnd() * 3), { w: 2.4, p: kp, seed: k, alpha: 0.6 });
		} else {
			stroke(ctx, Shp.path(`M${x},${GROUND_Y} q4,-18 10,-24 M${x + 8},${GROUND_Y} q2,-12 -4,-20`)[0], { w: 2.6, p: kp, seed: k, alpha: 0.7 });
		}
	}
	// hand-drawn ground shading
	ctx.save();
	ctx.globalAlpha = 0.5 * p;
	const g = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + 400);
	g.addColorStop(0, "rgba(201,168,120,0.35)");
	g.addColorStop(1, "rgba(201,168,120,0)");
	ctx.fillStyle = g;
	ctx.fillRect(-4000, GROUND_Y, 9000, 700);
	ctx.restore();
}

function drawClouds(ctx, t, list) {
	for (const c of list) {
		const x = c.x + t * c.v;
		const pts = Shp.path(
			`M${x - 90},${c.y} C${x - 110},${c.y - 40} ${x - 50},${c.y - 60} ${x - 30},${c.y - 40} C${x - 20},${c.y - 80} ${x + 50},${c.y - 80} ${x + 50},${c.y - 40} C${x + 90},${c.y - 50} ${x + 110},${c.y} ${x + 80},${c.y} Z`,
		)[0];
		ctx.save();
		ctx.globalAlpha = c.a ?? 1;
		wash(ctx, pts, "#ffffff", { seed: c.x, off: [0, 0], alpha: 0.85, grad: false, edge: false });
		stroke(ctx, pts, { w: 3.4, seed: c.x, alpha: 0.75 });
		ctx.restore();
	}
}

const CLOUDS_1 = [
	{ x: -1500, y: -760, v: 6 },
	{ x: -150, y: -840, v: 4 },
	{ x: 1250, y: -700, v: 5 },
];

function partyScene1(ctx, t) {
	const reveal = [0.15, 0.4, 0.65, 0.9];
	const props = [
		(c, a) => drawController(c, 0, 8, 0.6 * a, COL.slate3, 1),
		(c, a) => drawD20(c, 0, 0, 0.55 * a, COL.violet, 2),
		(c, a) => drawMeeple(c, 0, 2, 0.6 * a, COL.coral, 3),
		null,
	];
	BUDDIES.forEach((b, i) => {
		const p = prog(t, reveal[i], 0.75, Ease.linear);
		let mood = "happy";
		let look = [i < 2 ? 0.7 : -0.7, 0];
		let arms = i === 3 ? "hip" : "hold";
		let jump = 0;
		let sweat = 0;
		let squash = 0;
		if (t > 1.2 && t < 2.55) {
			// chatting: glance at each other
			look = [Math.sin(t * 2 + i) > 0 ? 0.8 : -0.8, 0];
			mood = i % 2 ? "grin" : "happy";
		}
		if (t >= CUE.shadow) {
			look = [0.55, -0.9];
			mood = "worried";
		}
		if (t >= CUE.thud) {
			const j = Math.max(0, Math.sin(clamp((t - CUE.thud - i * 0.04) / 0.45) * Math.PI));
			jump = j * 70;
			squash = -0.08 * j + 0.1 * spring(t, CUE.thud + 0.45 + i * 0.04, 3, 6);
			mood = "shock";
			look = [0.9, -0.3];
			arms = "up";
			sweat = 1;
		}
		if (t >= 4.6) {
			arms = i === 3 ? "hip" : "hold";
			mood = t > CUE.someday + 0.2 ? "worried" : "shock";
			look = [0.95, -0.5 - 0.3 * clamp((t - 5) / 3)];
		}
		drawBuddy(ctx, b, {
			x: PARTY_X[i],
			y: GROUND_Y,
			s: 1,
			p,
			mood,
			look,
			arms,
			jump,
			squash,
			sweat,
			prop: t < CUE.thud || t > 4.6 ? props[i] : null,
		});
	});
	// "!" exclamations at the thud
	const ex = env(t, CUE.thud + 0.05, CUE.thud + 1.3, 0.15, 0.3);
	if (ex > 0) {
		PARTY_X.forEach((x, i) => {
			ctx.save();
			ctx.translate(x + 20, GROUND_Y - 320 - i * 6);
			ctx.scale(ex, ex);
			htext(ctx, "!", 0, 0, { size: 90, weight: 800, align: "center", mode: "none", color: COL.coral });
			ctx.restore();
		});
	}
}

function partyScene7(ctx, t) {
	// the party watches the pile shrink, then hops on top and plants the flag
	const onTop = [
		[PILE_X - 170, GROUND_Y - 165],
		[PILE_X - 55, GROUND_Y - 195],
		[PILE_X + 60, GROUND_Y - 195],
		[PILE_X + 175, GROUND_Y - 160],
	];
	BUDDIES.forEach((b, i) => {
		let x = PARTY_X[i] + 120;
		let y = GROUND_Y;
		let mood = "determined";
		let arms = "hip";
		let look = [0.9, -0.4];
		const hopT = CUE.hop + i * 0.08;
		if (t >= CUE.shrink) {
			mood = "grin";
			arms = "up";
		}
		if (t >= hopT) {
			const u = clamp((t - hopT) / 0.5);
			const e = Ease.inOutQuad(u);
			x = lerp(PARTY_X[i] + 120, onTop[i][0], e);
			y = lerp(GROUND_Y, onTop[i][1], e) - Math.sin(u * Math.PI) * 170;
			arms = u < 1 ? "up" : "rest";
			look = [0.2, -0.3];
		}
		if (t >= CUE.flag) {
			arms = i === 1 || i === 2 ? "up" : "wave";
			mood = "cheer";
			look = [0, -0.4];
		}
		drawBuddy(ctx, b, { x, y, s: 0.85, mood, arms, look, squash: t >= hopT + 0.5 ? 0.12 * spring(t, hopT + 0.5, 3, 6) : 0 });
	});
}

function drawFlag(ctx, t) {
	if (t < CUE.flag - 0.3) return;
	const u = prog(t, CUE.flag - 0.3, 0.3, Ease.inQuad);
	const baseX = PILE_X + 5;
	const baseY = GROUND_Y - 150;
	ctx.save();
	ctx.translate(baseX, lerp(baseY - 900, baseY, u));
	ctx.rotate(0.04 + spring(t, CUE.flag, 2.5, 4) * 0.12);
	const pole = Shp.rrect(-7, -420, 14, 440, 6, { os: 0 });
	wash(ctx, pole, COL.woodDark, { seed: 1001 });
	stroke(ctx, pole, { w: 3.6, seed: 1001 });
	solid(ctx, Shp.ellipseFill(0, -426, 14, 14, 16), COL.gold);
	stroke(ctx, Shp.ellipse(0, -426, 14, 14), { w: 3, seed: 1002 });
	// waving cloth
	const pts = [];
	const fw = 250;
	const fh = 150;
	const top = [];
	const bot = [];
	for (let k = 0; k <= 16; k++) {
		const x = (k / 16) * fw;
		const wv = Math.sin(t * 7 - k * 0.5) * 12 * (k / 16);
		top.push([6 + x, -410 + wv]);
		bot.push([6 + x, -410 + fh + wv * 1.1]);
	}
	for (const q of top) pts.push(q);
	for (let k = bot.length - 1; k >= 0; k--) pts.push(bot[k]);
	pts.push(top[0]);
	wash(ctx, pts, "#161a22", { seed: 1003, hl: 0.15 });
	sketch(ctx, pts, { w: 4, seed: 1003 });
	// chevrons on the flag
	const mid = (k) => top[Math.round(k)][1] + fh / 2;
	stroke(
		ctx,
		[
			[70, mid(4.5) - 40],
			[112, mid(7) + 0],
			[70, mid(4.5) + 40],
		],
		{ w: 18, color: COL.chalk, seed: 1004, lo: 0.7 },
	);
	stroke(
		ctx,
		[
			[125, mid(8) - 40],
			[167, mid(10.5) + 0],
			[125, mid(8) + 40],
		],
		{ w: 18, color: COL.cyan, seed: 1005, lo: 0.7 },
	);
	ctx.restore();
}

function drawShadowOnGround(ctx, t) {
	// the shadow of the falling backlog sweeps in before the thud
	const a = prog(t, CUE.shadow, 1.05, Ease.inQuad) * (1 - prog(t, CUE.thud, 0.05));
	if (a <= 0) return;
	ctx.save();
	ctx.globalAlpha = 0.35 * a;
	ctx.fillStyle = INK;
	ctx.beginPath();
	ctx.ellipse(PILE_X, GROUND_Y + 6, 300 + 350 * a, 22 + 18 * a, 0, 0, TAU);
	ctx.fill();
	ctx.restore();
}

function labelsScene1(ctx, t) {
	const labels = [
		{ s: "video games", t: CUE.video, y: -560, c: COL.cyanDeep },
		{ s: "tabletop campaigns", t: CUE.tabletop, y: -430, c: "#6a5ae6" },
		{ s: "board games", t: CUE.board, y: -300, c: "#1f9a63" },
	];
	const out = prog(t, 9.0, 0.3, Ease.inCubic);
	labels.forEach((l, i) => {
		const p = prog(t, l.t, 0.55, Ease.linear);
		if (p <= 0) return;
		ctx.save();
		ctx.globalAlpha = 1 - out;
		const x = -1080 + i * 50;
		htext(ctx, l.s, x, l.y, { size: 84, font: FONT_SCRIPT, weight: 700, color: l.c, mode: "write", p, seed: 20 + i });
		const w = measureText(ctx, l.s, 84, 700, FONT_SCRIPT);
		const ap = prog(t, l.t + 0.35, 0.35, Ease.outCubic);
		const ax = x + w + 20;
		const ex = PILE_X - 200;
		const ey = -330 + i * 40;
		const arr = Shp.path(`M${ax},${l.y - 24} C${ax + (ex - ax) * 0.4},${l.y - 70} ${ax + (ex - ax) * 0.8},${l.y - 40} ${ex},${ey}`)[0];
		stroke(ctx, arr, { w: 5, p: ap, seed: 30 + i, color: l.c });
		if (ap > 0.95) {
			const e = arr[arr.length - 1];
			const d = arr[arr.length - 3];
			const ang = Math.atan2(e[1] - d[1], e[0] - d[0]);
			stroke(ctx, [
				[e[0] - Math.cos(ang - 0.5) * 24, e[1] - Math.sin(ang - 0.5) * 24],
				e,
				[e[0] - Math.cos(ang + 0.5) * 24, e[1] - Math.sin(ang + 0.5) * 24],
			], { w: 5, seed: 40 + i, color: l.c });
		}
		ctx.restore();
	});
}

// ------------------------------------------------------------------ scene 2: logo
const LOGO_X = 3200;
const LOGO_Y = -80;

function drawLogoScene(ctx, t) {
	if (t < 9.3 || t > 13.2) return;
	const size = 220;
	const wsz = 150;
	const ww = measureText(ctx, "NextQuest", wsz, 800);
	const total = size + 44 + ww;
	const mx = LOGO_X - total / 2 + size / 2;
	const my = LOGO_Y - 40;
	// fly the mark into the app sidebar
	const fly = prog(t, CUE.toApp + 0.1, 0.6, Ease.inOutCubic);
	const tx = WIN.x + 56;
	const ty = WIN.y + WIN.bar + 56;
	const fx = lerp(mx, tx, fly);
	const fy = lerp(my, ty, fly) - Math.sin(fly * Math.PI) * 120;
	const fs = lerp(size, 52, fly);
	const markP = prog(t, CUE.logo, 0.9, Ease.linear);
	if (fly < 1) drawLogoMark(ctx, fx, fy, fs, markP);
	// burst lines
	const bl = env(t, CUE.logo + 0.3, CUE.logo + 1.1, 0.1, 0.4);
	if (bl > 0 && fly <= 0) {
		for (let k = 0; k < 10; k++) {
			const a = (k / 10) * TAU + 0.2;
			const r0 = size * 0.8 + (1 - bl) * 30;
			stroke(ctx, Shp.line(mx + Math.cos(a) * r0, my + Math.sin(a) * r0, mx + Math.cos(a) * (r0 + 50 * bl), my + Math.sin(a) * (r0 + 50 * bl)), {
				w: 6,
				color: k % 2 ? COL.cyan : COL.yellow,
				seed: k,
			});
		}
	}
	const wordA = 1 - prog(t, CUE.toApp, 0.35, Ease.inCubic);
	if (wordA > 0) {
		ctx.save();
		ctx.globalAlpha = wordA;
		drawWordmark(ctx, mx + size / 2 + 44, my + wsz * 0.36, wsz, prog(t, CUE.logo + 0.25, 0.8, Ease.linear), { align: "left" });
		htext(ctx, "your party's shared quest board", LOGO_X, LOGO_Y + 190, {
			size: 76,
			font: FONT_SCRIPT,
			weight: 700,
			color: "#5b6272",
			align: "center",
			mode: "write",
			p: prog(t, CUE.subtitle, 1.3, Ease.linear),
			seed: 50,
		});
		// underline swoosh
		const up = prog(t, CUE.subtitle + 1.2, 0.35, Ease.outCubic);
		stroke(ctx, Shp.path(`M${LOGO_X - 420},${LOGO_Y + 222} C${LOGO_X - 150},${LOGO_Y + 205} ${LOGO_X + 150},${LOGO_Y + 238} ${LOGO_X + 430},${LOGO_Y + 212}`)[0], {
			w: 7,
			color: COL.cyan,
			p: up,
			seed: 51,
		});
		// sparkles
		for (let k = 0; k < 6; k++) {
			const st = CUE.logo + 0.5 + k * 0.25;
			const sp = env(t, st, st + 1.4, 0.2, 0.5);
			const ang = k * 1.9;
			drawSparkle(ctx, LOGO_X + Math.cos(ang) * 640, LOGO_Y - 40 + Math.sin(ang) * 200, 26 * sp, k % 2 ? COL.yellow : COL.cyan, t * 2 + k);
		}
		ctx.restore();
	}
}

// ------------------------------------------------------------------ app pages
function pageAlpha(t, t0, t1) {
	// pages swap cleanly: the old one is gone by t1, the new one fades in from t1
	return Math.min(prog(t, t0, 0.3, Ease.outCubic), 1 - prog(t, t1 - 0.2, 0.2, Ease.inCubic));
}

function chip(ctx, x, y, w, h, o = {}) {
	const pts = Shp.rrect(x, y, w, h, h / 2, { os: 0 });
	solid(ctx, pts, o.fill ?? COL.slate3, o.alpha ?? 1);
	if (o.stroke) stroke(ctx, Shp.rrect(x, y, w, h, h / 2), { w: 2.4, color: o.stroke, seed: x * 0.1 });
}

function popScale(ctx, x, y, p, fn) {
	if (p <= 0) return;
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(p, p);
	fn();
	ctx.restore();
}

function pageBacklog(ctx, t) {
	const a = pageAlpha(t, 12.95, CUE.vote);
	if (a <= 0) return;
	ctx.save();
	ctx.globalAlpha *= a;
	htext(ctx, "Backlog", CX, CY + 40, { size: 52, weight: 800, color: COL.chalk, mode: "none", seed: 1 });
	htext(ctx, "12 games · 214 effort", CX + 250, CY + 38, { size: 26, weight: 500, color: COL.chalkDim, mode: "none" });
	// propose input
	const iy = CY + 76;
	uiCard(ctx, CX, iy, 860, 72, { fill: "#0f1217", stroke: t > 13.35 && t < 14.6 ? COL.cyan : COL.slate3, r: 14, seed: 3 });
	const typed = "Dragon's Peak";
	const nChars = Math.floor(clamp((t - CUE.typeStart) / 0.7) * typed.length);
	if (t < CUE.typeStart) {
		htext(ctx, "Paste a Steam link or type a title…", CX + 28, iy + 47, { size: 28, weight: 500, color: "#5f6878", mode: "none", jitter: 0.3 });
	} else if (t < CUE.card) {
		htext(ctx, typed.slice(0, nChars), CX + 28, iy + 48, { size: 32, weight: 600, color: COL.chalk, mode: "none", jitter: 0.3 });
		const tw = measureText(ctx, typed.slice(0, nChars), 32, 600);
		if (fract(t * 2.2) < 0.6) stroke(ctx, Shp.line(CX + 32 + tw, iy + 18, CX + 32 + tw, iy + 56), { w: 3, color: COL.cyan, seed: 4 });
	}
	chip(ctx, CX + 890, iy + 4, 270, 64, { fill: COL.cyan });
	htext(ctx, "+ Propose", CX + 1025, iy + 47, { size: 30, weight: 800, color: "#06222a", mode: "none", align: "center" });
	// dropdown suggestion
	const dd = prog(t, 14.2, 0.2, Ease.outCubic) * (1 - prog(t, CUE.card - 0.05, 0.1));
	if (dd > 0) {
		ctx.save();
		ctx.globalAlpha *= dd;
		uiCard(ctx, CX, iy + 84, 860, 92, { fill: "#232933", stroke: COL.slate3, r: 12, seed: 5 });
		drawCoverArt(ctx, "dragon", CX + 14, iy + 96, 68, 68, 6);
		htext(ctx, "Dragon's Peak", CX + 100, iy + 128, { size: 30, weight: 700, color: COL.chalk, mode: "none" });
		htext(ctx, "2024 · Steam · HowLongToBeat", CX + 100, iy + 160, { size: 22, weight: 500, color: COL.chalkDim, mode: "none" });
		ctx.restore();
	}
	// the game card
	const cp = prog(t, CUE.card, 0.45, Ease.outBack);
	if (cp > 0) {
		ctx.save();
		const cy = CY + 180;
		ctx.translate(CX + CW / 2, cy + 220);
		ctx.scale(lerp(0.85, 1, cp), lerp(0.85, 1, cp));
		ctx.globalAlpha *= clamp(cp * 2);
		ctx.translate(-(CX + CW / 2), -(cy + 220));
		uiCard(ctx, CX, cy, CW, 440, { r: 22, seed: 7 });
		// cover art with watercolor bleed reveal
		const rv = prog(t, CUE.card + 0.1, 0.55, Ease.outCubic);
		ctx.save();
		ctx.beginPath();
		ctx.arc(CX + 174, cy + 220, 280 * rv, 0, TAU);
		ctx.clip();
		drawCoverArt(ctx, "dragon", CX + 24, cy + 24, 300, 392, 8);
		ctx.restore();
		htext(ctx, "Dragon's Peak", CX + 360, cy + 90, { size: 58, weight: 800, color: COL.chalk, p: prog(t, CUE.card + 0.15, 0.5, Ease.linear), seed: 9 });
		const tg = prog(t, CUE.card + 0.4, 0.3, Ease.outCubic);
		ctx.save();
		ctx.globalAlpha *= tg;
		chip(ctx, CX + 360, cy + 118, 110, 38, { fill: "rgba(52,209,230,0.16)", stroke: COL.cyan });
		htext(ctx, "VIDEO", CX + 415, cy + 145, { size: 20, weight: 800, color: COL.cyan, mode: "none", align: "center" });
		htext(ctx, "Action RPG · Open world · Single-player", CX + 488, cy + 145, { size: 24, weight: 500, color: COL.chalkDim, mode: "none" });
		ctx.restore();
		// stat chips
		const chips = [
			{ t: CUE.hours, icon: "hourglass", label: "~100 h", sub: "length" },
			{ t: CUE.difficulty, icon: "skull", label: "", sub: "difficulty" },
			{ t: CUE.acclaim, icon: "star", label: "94%", sub: "acclaim" },
		];
		chips.forEach((c, i) => {
			const pp = prog(t, c.t - 0.05, 0.4, Ease.outBack);
			if (pp <= 0) return;
			const x = CX + 360 + i * 262;
			const y = cy + 190;
			popScale(ctx, x + 120, y + 60, pp, () => {
				ctx.translate(-(x + 120), -(y + 60));
				uiCard(ctx, x, y, 240, 120, { fill: "#262c36", stroke: i === 2 ? COL.yellow : COL.slate3, r: 18, seed: 20 + i });
				drawIcon(ctx, c.icon, x + 44, y + 50, 1.3, i === 1 ? COL.coral : COL.chalk, 30 + i);
				if (i === 1) {
					for (let k = 0; k < 5; k++) {
						const on = prog(t, c.t + 0.05 + k * 0.07, 0.15, Ease.outBack);
						solid(ctx, Shp.ellipseFill(x + 96 + k * 27, y + 50, 10 * Math.max(0.35, on), 10 * Math.max(0.35, on), 14), on > 0.5 ? COL.coral : COL.slate3);
					}
				} else {
					htext(ctx, c.label, x + 86, y + 64, { size: 42, weight: 800, color: COL.chalk, mode: "none" });
				}
				htext(ctx, c.sub, x + 24, y + 104, { size: 22, weight: 500, color: COL.chalkDim, mode: "none" });
			});
		});
		// formula (straight from the README example)
		htext(ctx, "13 × 2.0 × 1.12 ≈ 29 effort", CX + 360, cy + 380, {
			size: 50,
			font: FONT_SCRIPT,
			weight: 700,
			color: COL.cyan,
			mode: "write",
			p: prog(t, CUE.formula, 0.6, Ease.linear),
			seed: 40,
		});
		// effort stamp
		const sp = prog(t, CUE.stamp - 0.14, 0.14, Ease.inQuad);
		if (sp > 0) {
			const sq = spring(t, CUE.stamp, 3, 7);
			ctx.save();
			ctx.translate(CX + CW - 110, cy + 90);
			ctx.rotate(-0.22);
			const sc = lerp(2.6, 1, sp) * (1 + sq * 0.12);
			ctx.scale(sc, sc * (1 - sq * 0.08));
			ctx.globalAlpha *= clamp(sp * 3);
			const outer = Shp.ellipseFill(0, 0, 88, 88, 40);
			wash(ctx, outer, COL.cyan, { seed: 60, hl: 0.3 });
			sketch(ctx, Shp.ellipse(0, 0, 88, 88), { w: 5, seed: 60 });
			stroke(ctx, Shp.ellipse(0, 0, 74, 74, { os: 0.05 }), { w: 3, seed: 61, color: "#06222a", alpha: 0.7 });
			htext(ctx, "29", 0, 18, { size: 78, weight: 800, color: "#06222a", align: "center", mode: "none" });
			htext(ctx, "EFFORT", 0, 52, { size: 20, weight: 800, color: "#06222a", align: "center", mode: "none", spacing: 2 });
			ctx.restore();
			// ink splats
			const sa = env(t, CUE.stamp, CUE.stamp + 0.8, 0.02, 0.4);
			if (sa > 0) {
				for (let k = 0; k < 9; k++) {
					const ang = k * 0.7 + 0.3;
					const r = 110 + Ease.outCubic(clamp((t - CUE.stamp) / 0.3)) * 60;
					ctx.save();
					ctx.globalAlpha *= sa;
					solid(ctx, Shp.ellipseFill(CX + CW - 110 + Math.cos(ang) * r, cy + 90 + Math.sin(ang) * r, 6 + (k % 3) * 3, 6 + (k % 3) * 3, 10), COL.cyan);
					ctx.restore();
				}
			}
		}
		ctx.restore();
	}
	// mouse cursor
	const cur = cursorPath(t);
	if (cur) drawCursor(ctx, cur.x, cur.y, 1.2, cur.click);
	ctx.restore();
}

function cursorPath(t) {
	if (t < 13.0 || t > 15.0) return null;
	const keys = [
		[13.0, CX + 900, CY + 520],
		[13.35, CX + 240, CY + 118],
		[14.2, CX + 240, CY + 118],
		[14.5, CX + 300, CY + 200],
		[15.0, CX + 1250, CY + 700],
	];
	let k = 0;
	while (k < keys.length - 2 && keys[k + 1][0] <= t) k++;
	const a = keys[k];
	const b = keys[k + 1];
	const u = Ease.inOutCubic(clamp((t - a[0]) / (b[0] - a[0])));
	const click = Math.max(env(t, 13.35, 13.6, 0.02, 0.2), env(t, 14.52, 14.8, 0.02, 0.2));
	return { x: lerp(a[1], b[1], u), y: lerp(a[2], b[2], u), click };
}

// voting --------------------------------------------------------------
const GAMES = [
	{ id: "dragon", title: "Dragon's Peak", type: "VIDEO", tc: COL.cyan, effort: 29, votes: 17 },
	{ id: "gloom", title: "Gloomkeep", type: "TTRPG", tc: COL.violet, effort: 13, votes: 13 },
	{ id: "meeple", title: "Meeple Mayhem", type: "BOARD GAME", tc: COL.green, effort: 3, votes: 10 },
];
const JAR_Y = CY + 330;
const CARD_W = 350;
const cardX = (i) => CX + 20 + i * 400;

// coin flights: buddy i%4 → jar
const FLIGHTS = (() => {
	const jars = [0, 1, 0, 2, 1, 0, 2, 0, 1, 2, 0, 1, 1, 0, 2, 1];
	return jars.map((j, i) => ({ from: i % 4, jar: j, t: CUE.coins + i * 0.082, dur: 0.55 }));
})();

function jarCount(t, j) {
	let n = 0;
	for (const f of FLIGHTS) if (f.jar === j && t >= f.t + f.dur) n++;
	return n;
}

function drawJar(ctx, x, y, n, a, seed) {
	ctx.save();
	ctx.globalAlpha *= a;
	const body = Shp.path(`M${x - 70},${y} C${x - 95},${y + 20} ${x - 95},${y + 220} ${x - 60},${y + 240} L${x + 60},${y + 240} C${x + 95},${y + 220} ${x + 95},${y + 20} ${x + 70},${y} Z`)[0];
	solid(ctx, body, "rgba(143,227,238,0.08)");
	// coins stacked inside
	for (let k = 0; k < n; k++) {
		const cy = y + 222 - k * 17;
		const cx = x + ((k * 37) % 23) - 11;
		ctx.save();
		ctx.translate(cx, cy);
		ctx.scale(1, 0.42);
		solid(ctx, Shp.ellipseFill(0, 0, 40, 40, 20), COL.gold);
		stroke(ctx, Shp.ellipse(0, 0, 40, 40, { os: 0.04 }), { w: 5, seed: seed + k, color: "#6b4a10" });
		ctx.restore();
	}
	stroke(ctx, body, { w: 3.4, color: COL.chalk, seed, alpha: 0.9 });
	const lid = Shp.rrect(x - 80, y - 26, 160, 30, 8, { os: 0 });
	solid(ctx, lid, "#3a4250");
	stroke(ctx, lid, { w: 3, color: COL.chalk, seed: seed + 1, alpha: 0.9 });
	// glass glint
	stroke(ctx, Shp.path(`M${x - 62},${y + 40} C${x - 72},${y + 90} ${x - 70},${y + 150} ${x - 58},${y + 190}`)[0], { w: 6, color: "#ffffff", alpha: 0.35, seed: seed + 2 });
	// coin slot
	stroke(ctx, Shp.line(x - 26, y - 12, x + 26, y - 12), { w: 5, color: "#0b0d11", seed: seed + 3 });
	ctx.restore();
}

function gameCardSmall(ctx, g, x, y, w, h, o = {}) {
	uiCard(ctx, x, y, w, h, { r: 18, seed: x * 0.01, stroke: o.glow ? COL.yellow : COL.slate3, w: o.glow ? 4 : 2.6 });
	drawCoverArt(ctx, g.id, x + 14, y + 14, w - 28, h * 0.5, x * 0.02);
	htext(ctx, g.title, x + 18, y + h * 0.5 + 58, { size: 32, weight: 800, color: COL.chalk, mode: "none" });
	const bw = measureText(ctx, g.type, 18, 800) + 26;
	chip(ctx, x + 18, y + h - 52, bw, 34, { fill: rgba(g.tc, 0.16), stroke: g.tc });
	htext(ctx, g.type, x + 18 + bw / 2, y + h - 28, { size: 18, weight: 800, color: g.tc, mode: "none", align: "center" });
	htext(ctx, `${g.effort} effort`, x + w - 18, y + h - 26, { size: 22, weight: 600, color: COL.chalkDim, mode: "none", align: "right" });
}

function pageVote(ctx, t) {
	const a = pageAlpha(t, CUE.vote, CUE.pick);
	if (a <= 0) return;
	ctx.save();
	ctx.globalAlpha *= a;
	htext(ctx, "What's next?", CX, CY + 40, { size: 52, weight: 800, color: COL.chalk, mode: "none" });
	// "10 votes" budget
	const bp = prog(t, CUE.ten, 0.35, Ease.outBack);
	if (bp > 0) {
		popScale(ctx, CX + 520, CY + 26, bp, () => {
			chip(ctx, -20, -30, 440, 60, { fill: "rgba(255,184,48,0.14)", stroke: COL.gold });
			drawCoin(ctx, 18, 0, 18, 3);
			htext(ctx, "10 votes each · secret", 48, 11, { size: 28, weight: 700, color: COL.yellow, mode: "none" });
		});
	}
	GAMES.forEach((g, i) => {
		const cp = prog(t, CUE.vote + 0.15 + i * 0.1, 0.4, Ease.outBack);
		if (cp <= 0) return;
		const x = cardX(i);
		const y = CY + 80;
		popScale(ctx, x + CARD_W / 2, y + 110, cp, () => {
			ctx.translate(-(x + CARD_W / 2), -(y + 110));
			gameCardSmall(ctx, g, x, y, CARD_W, 220);
		});
		const jp = prog(t, CUE.vote + 0.4 + i * 0.1, 0.4, Ease.outBack);
		if (jp > 0) {
			ctx.save();
			ctx.translate(x + CARD_W / 2, JAR_Y + 120);
			ctx.scale(jp, jp);
			ctx.translate(-(x + CARD_W / 2), -(JAR_Y + 120));
			drawJar(ctx, x + CARD_W / 2, JAR_Y, jarCount(t, i), 1, 300 + i * 9);
			ctx.restore();
		}
	});
	// curtain (secret ballot)
	const cu = prog(t, CUE.curtain - 0.05, 0.4, Ease.outBounce);
	if (cu > 0) {
		const top = JAR_Y - 40;
		const hgt = 300 * cu;
		const pts = [
			[CX - 10, top],
			[CX + CW + 10, top],
		];
		for (let k = 0; k <= 24; k++) {
			const x = CX + CW + 10 - (k / 24) * (CW + 20);
			const scal = Math.sin((k / 24) * Math.PI * 12) * 10;
			pts.push([x, top + hgt + Math.abs(scal)]);
		}
		pts.push([CX - 10, top]);
		wash(ctx, pts, "#5e4bd6", { seed: 700, hl: 0.18, off: [0, 0] });
		// folds
		for (let k = 1; k < 12; k++) {
			const x = CX + (k / 12) * CW;
			stroke(ctx, Shp.path(`M${x},${top + 6} C${x - 8},${top + hgt * 0.4} ${x + 8},${top + hgt * 0.7} ${x},${top + hgt - 6}`)[0], {
				w: 3,
				color: "#2e2380",
				alpha: 0.55,
				seed: 710 + k,
				p: cu,
			});
		}
		stroke(ctx, pts, { w: 4, seed: 700 });
		// gold rod
		const rod = Shp.rrect(CX - 20, top - 16, CW + 40, 22, 11, { os: 0 });
		solid(ctx, rod, COL.gold);
		stroke(ctx, rod, { w: 3, seed: 701 });
		if (cu > 0.6) {
			const lk = prog(t, CUE.lock, 0.3, Ease.outBack);
			popScale(ctx, CX + CW / 2, top + hgt * 0.55, lk, () => {
				chip(ctx, -250, -48, 500, 96, { fill: "rgba(11,13,17,0.55)" });
				drawIcon(ctx, "lock", -190, 0, 1.6, COL.yellow, 720);
				htext(ctx, "secret ballot", -150, 16, { size: 50, font: FONT_SCRIPT, weight: 700, color: COL.white, mode: "none" });
			});
		}
		// only the group totals show
		GAMES.forEach((g, i) => {
			const tp = prog(t, CUE.lock + 0.3 + i * 0.12, 0.3, Ease.outBack);
			if (tp <= 0) return;
			popScale(ctx, cardX(i) + CARD_W / 2, top + 34, tp, () => {
				chip(ctx, -70, -26, 140, 52, { fill: COL.gold });
				drawCoin(ctx, -40, 0, 14, 800 + i);
				htext(ctx, String(g.votes), 14, 13, { size: 36, weight: 800, color: "#3a2606", mode: "none", align: "center" });
			});
		});
	}
	ctx.restore();
}

function coinsInFlight(ctx, t) {
	if (t < CUE.coins || t > CUE.coins + 2.2) return;
	for (const f of FLIGHTS) {
		const u = (t - f.t) / f.dur;
		if (u < 0 || u > 1) continue;
		const bx = DESK_X[f.from];
		const by = DESK_Y - 240;
		const jx = cardX(f.jar) + CARD_W / 2;
		const jy = JAR_Y - 20;
		const x = lerp(bx, jx, u);
		const y = lerp(by, jy, u) - Math.sin(u * Math.PI) * 260;
		drawCoin(ctx, x, y, 22, f.t * 10, u * 14);
	}
}

function partyDesk(ctx, t) {
	// the party stands on the desk in front of the monitor during voting / picking
	const inT = CUE.vote + 0.25;
	if (t < inT || t > 36.3) return;
	BUDDIES.forEach((b, i) => {
		const rise = prog(t, inT + i * 0.07, 0.45, Ease.outBack);
		let arms = "rest";
		let mood = "happy";
		let look = [i < 2 ? 0.6 : -0.6, -0.8];
		let jump = 0;
		// throwing coins
		for (const f of FLIGHTS) {
			if (f.from === i && t >= f.t - 0.12 && t < f.t + 0.1) arms = "throw";
		}
		if (t >= CUE.ten && t < CUE.coins) {
			mood = "grin";
		}
		if (t >= CUE.curtain) {
			mood = "happy";
			look = [i % 2 ? -0.8 : 0.8, -0.2];
		}
		if (t >= CUE.hurt) {
			mood = "joy";
			arms = "hip";
		}
		if (t >= CUE.pick) {
			mood = "happy";
			arms = "rest";
			look = [i < 2 ? 0.5 : -0.5, -0.9];
		}
		if (t >= CUE.whatsNext) mood = "worried";
		if (t >= CUE.hit) {
			const j = Math.max(0, Math.sin(clamp((t - CUE.hit - i * 0.05) / 0.5) * Math.PI));
			jump = j * 110;
			mood = "cheer";
			arms = "up";
		}
		if (t >= CUE.hit + 0.9) {
			mood = "grin";
			arms = "rest";
		}
		if (t >= CUE.rsvp + i * 0.25) {
			arms = i % 2 ? "wave" : "up";
			mood = "grin";
		}
		if (t >= CUE.rsvp + 1.4) arms = "rest";
		if (t >= CUE.dash) {
			mood = "happy";
			look = [i < 2 ? 0.6 : -0.6, -0.9];
		}
		const yOff = (1 - rise) * 420;
		drawBuddy(ctx, b, { x: DESK_X[i], y: DESK_Y + yOff, s: 0.95, mood, arms, look, jump });
		// coin stash above heads
		const st = env(t, CUE.ten, CUE.coins + 1.4, 0.2, 0.3);
		if (st > 0) {
			ctx.save();
			ctx.translate(DESK_X[i], DESK_Y + yOff - 280 * b.h - 30);
			ctx.scale(st, st);
			const left = Math.max(0, 10 - FLIGHTS.filter((f) => f.from === i && t >= f.t).length * 2.5);
			const chipPts = Shp.rrect(-52, -28, 112, 56, 28, { os: 0 });
			wash(ctx, chipPts, COL.white, { seed: 1400 + i, off: [0, 0], hl: 0 });
			stroke(ctx, Shp.rrect(-52, -28, 112, 56, 28), { w: 3.4, seed: 1400 + i });
			drawCoin(ctx, -22, 0, 17, i);
			htext(ctx, `×${Math.round(left)}`, 2, 13, { size: 34, weight: 800, color: INK, mode: "none" });
			ctx.restore();
		}
		// hearts
		if (t >= CUE.hurt && t < CUE.hurt + 1.6) {
			for (let k = 0; k < 2; k++) {
				const ht = CUE.hurt + i * 0.12 + k * 0.45;
				const u = clamp((t - ht) / 1.0);
				if (u <= 0 || u >= 1) continue;
				ctx.save();
				ctx.globalAlpha = 1 - u;
				drawHeart(ctx, DESK_X[i] + Math.sin(u * 6 + i) * 20, DESK_Y - 250 - u * 160, 1.4 * Ease.outBack(clamp(u * 3)), COL.coral, i * 7 + k);
				ctx.restore();
			}
		}
	});
}

// picker ---------------------------------------------------------------
const SCORES = {
	// cumulative score after each factor lands: [interest, +time, +party]
	dragon: [0.42, 0.52, 0.54],
	gloom: [0.32, 0.54, 0.84],
	meeple: [0.25, 0.5, 0.72],
};

function scoreAt(t, id) {
	const s = SCORES[id];
	const a = prog(t, CUE.interest, 0.5, Ease.outCubic) * s[0];
	const b = prog(t, CUE.time, 0.5, Ease.outCubic) * (s[1] - s[0]);
	const c = prog(t, CUE.around, 0.5, Ease.outCubic) * (s[2] - s[1]);
	return a + b + c;
}

function rankY(t, id) {
	// animate row positions as ranking changes
	const order = (tt) =>
		GAMES.map((g) => g.id)
			.sort((x, y) => scoreAtFinal(tt, y) - scoreAtFinal(tt, x));
	const stageTimes = [CUE.pick, CUE.interest + 0.5, CUE.time + 0.5, CUE.around + 0.5];
	let y = 0;
	let prevIdx = null;
	for (let k = 0; k < stageTimes.length; k++) {
		const idx = order(stageTimes[k] + 0.001).indexOf(id);
		if (prevIdx === null) {
			y = idx;
		} else {
			const u = prog(t, stageTimes[k], 0.4, Ease.inOutCubic);
			y = lerp(y, idx, u);
		}
		prevIdx = idx;
	}
	return y;
}
function scoreAtFinal(t, id) {
	const s = SCORES[id];
	if (t >= CUE.around + 0.5) return s[2];
	if (t >= CUE.time + 0.5) return s[1];
	if (t >= CUE.interest + 0.5) return s[0];
	return { dragon: 3, gloom: 2, meeple: 1 }[id];
}

function pagePick(ctx, t) {
	const a = pageAlpha(t, CUE.pick, CUE.events);
	if (a <= 0) return;
	ctx.save();
	ctx.globalAlpha *= a;
	htext(ctx, "What's next?", CX, CY + 40, { size: 52, weight: 800, color: COL.chalk, mode: "none" });
	// tonight context
	const ctxP = prog(t, CUE.pick + 0.1, 0.35, Ease.outBack);
	popScale(ctx, CX, CY + 96, ctxP, () => {
		htext(ctx, "Tonight:", 0, 12, { size: 28, weight: 600, color: COL.chalkDim, mode: "none" });
		chip(ctx, 120, -24, 160, 50, { fill: COL.slate3 });
		drawIcon(ctx, "clock", 148, 1, 0.8, COL.chalk, 5);
		htext(ctx, "3 hrs", 172, 12, { size: 26, weight: 700, color: COL.chalk, mode: "none" });
		chip(ctx, 296, -24, 190, 50, { fill: COL.slate3 });
		drawIcon(ctx, "people", 326, 1, 0.8, COL.chalk, 6);
		htext(ctx, "4 players", 350, 12, { size: 26, weight: 700, color: COL.chalk, mode: "none" });
	});
	// factor legend
	const factors = [
		{ t: CUE.interest, icon: "heart", label: "interest" },
		{ t: CUE.time, icon: "clock", label: "time fit" },
		{ t: CUE.around, icon: "people", label: "who's around" },
	];
	factors.forEach((f, i) => {
		const fp = prog(t, f.t - 0.1, 0.35, Ease.outBack);
		if (fp <= 0) return;
		const x = CX + 610 + i * 190;
		const y = CY + 30;
		const pulse = 1 + 0.25 * spring(t, f.t, 3, 5);
		popScale(ctx, x, y, fp * pulse, () => {
			solid(ctx, Shp.ellipseFill(0, 0, 34, 34, 24), i === 0 ? "rgba(255,122,102,0.25)" : "rgba(52,209,230,0.2)");
			drawIcon(ctx, f.icon, 0, 0, 1.1, i === 0 ? COL.coral : COL.cyan, 900 + i);
			htext(ctx, f.label, 0, 70, { size: 34, font: FONT_SCRIPT, weight: 700, color: COL.chalk, mode: "none", align: "center" });
		});
	});
	// ranked rows
	const winnerFocus = prog(t, CUE.whatsNext, 0.5, Ease.inOutCubic);
	GAMES.forEach((g, gi) => {
		const rp = prog(t, CUE.pick + 0.15 + gi * 0.08, 0.35, Ease.outCubic);
		if (rp <= 0) return;
		const r = rankY(t, g.id);
		const x = CX;
		const y = CY + 180 + r * 150;
		const isWin = g.id === "gloom";
		ctx.save();
		ctx.globalAlpha *= rp * (isWin ? 1 : 1 - 0.55 * winnerFocus);
		let shake = 0;
		if (isWin && t > CUE.whatsNext + 0.4 && t < CUE.hit) shake = Math.sin(t * 70) * 3 * prog(t, CUE.whatsNext + 0.4, 1.0, Ease.inQuad);
		ctx.translate(shake, 0);
		uiCard(ctx, x, y, CW, 128, { r: 18, seed: 400 + gi, stroke: isWin && winnerFocus > 0.5 ? COL.yellow : COL.slate3, w: isWin && winnerFocus > 0.5 ? 4 : 2.6 });
		drawCoverArt(ctx, g.id, x + 14, y + 14, 130, 100, 410 + gi);
		htext(ctx, g.title, x + 166, y + 58, { size: 36, weight: 800, color: COL.chalk, mode: "none" });
		const bw = measureText(ctx, g.type, 18, 800) + 26;
		chip(ctx, x + 166, y + 76, bw, 34, { fill: rgba(g.tc, 0.16), stroke: g.tc });
		htext(ctx, g.type, x + 166 + bw / 2, y + 100, { size: 18, weight: 800, color: g.tc, mode: "none", align: "center" });
		// score bar
		const s = scoreAt(t, g.id);
		const bx = x + 520;
		const bwMax = 520;
		solid(ctx, Shp.rrect(bx, y + 46, bwMax, 36, 18, { os: 0 }), "#0f1217");
		if (s > 0.005) {
			const segs = [
				[0, SCORES[g.id][0], COL.coral],
				[SCORES[g.id][0], SCORES[g.id][1], COL.cyan],
				[SCORES[g.id][1], SCORES[g.id][2], COL.violet],
			];
			for (const sg of segs) {
				const a0 = sg[0];
				const a1 = Math.min(sg[1], s);
				if (a1 <= a0) continue;
				solid(ctx, Shp.rrect(bx + a0 * bwMax, y + 46, (a1 - a0) * bwMax, 36, 10, { os: 0 }), sg[2], 0.95);
			}
			stroke(ctx, Shp.rrect(bx, y + 46, bwMax * Math.max(0.07, s), 36, 18), { w: 2.4, color: "#0b0d11", seed: 420 + gi });
		}
		htext(ctx, String(Math.round(s * 100)), x + CW - 30, y + 78, { size: 44, weight: 800, color: COL.chalk, mode: "none", align: "right" });
		ctx.restore();
	});
	ctx.restore();
}

function winnerReveal(ctx, t) {
	const wp = prog(t, CUE.hit - 0.08, 0.35, Ease.outBack);
	const out = prog(t, CUE.events, 0.45, Ease.inOutCubic);
	if (wp <= 0) return;
	const g = GAMES[1];
	// fly towards the "next up" chip on the events page
	if (out >= 1) return;
	const cx = lerp(CX + CW / 2, CX + 980, out);
	const cy = lerp(CY + 340, CY + 350, out);
	const sc = lerp(wp, 0.3, out);
	ctx.save();
	ctx.globalAlpha *= 1 - Ease.inQuad(out);
	ctx.translate(cx, cy);
	ctx.scale(sc, sc);
	ctx.rotate(lerp(-0.04, 0, out));
	// glow rays
	const ray = (1 - out) * clamp(wp);
	if (ray > 0) {
		ctx.save();
		ctx.globalAlpha *= 0.35 * ray;
		for (let k = 0; k < 14; k++) {
			const a0 = (k / 14) * TAU + t * 0.6;
			ctx.fillStyle = k % 2 ? COL.yellow : COL.cyan;
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.arc(0, 0, 620, a0, a0 + 0.14);
			ctx.closePath();
			ctx.fill();
		}
		ctx.restore();
	}
	const w = 560;
	const h = 400;
	uiCard(ctx, -w / 2, -h / 2, w, h, { r: 24, stroke: COL.yellow, w: 6, seed: 500 });
	drawCoverArt(ctx, "gloom", -w / 2 + 20, -h / 2 + 20, w - 40, 240, 501);
	htext(ctx, g.title, 0, h / 2 - 70, { size: 58, weight: 800, color: COL.chalk, mode: "none", align: "center" });
	htext(ctx, "TTRPG · 3–5 players · score 84", 0, h / 2 - 28, { size: 26, weight: 600, color: COL.chalkDim, mode: "none", align: "center" });
	// crown
	const cr = prog(t, CUE.hit + 0.1, 0.35, Ease.outBounce);
	if (cr > 0) {
		ctx.save();
		ctx.translate(0, lerp(-h / 2 - 260, -h / 2 - 30, cr));
		ctx.rotate(-0.12);
		const crown = Shp.path("M-70,30 L-80,-40 L-40,-5 L0,-60 L40,-5 L80,-40 L70,30 Z")[0];
		wash(ctx, crown, COL.gold, { seed: 510, hl: 0.35 });
		sketch(ctx, crown, { w: 5, seed: 510 });
		for (const q of [
			[-80, -44],
			[0, -64],
			[80, -44],
		])
			solid(ctx, Shp.ellipseFill(q[0], q[1], 10, 10, 12), COL.coral);
		ctx.restore();
	}
	// banner
	const bn = prog(t, CUE.hit + 0.18, 0.4, Ease.outBack);
	if (bn > 0) {
		ctx.save();
		ctx.translate(0, h / 2 + 50);
		ctx.scale(bn, 1);
		const ban = Shp.path("M-300,-40 L300,-40 L270,0 L300,40 L-300,40 L-270,0 Z")[0];
		wash(ctx, ban, COL.coral, { seed: 520, hl: 0.25 });
		sketch(ctx, ban, { w: 5, seed: 520 });
		htext(ctx, "NEXT UP!", 0, 22, { size: 64, weight: 800, color: COL.white, align: "center", mode: "none", stroke: INK, strokeW: 8 });
		ctx.restore();
	}
	ctx.restore();
}

// confetti (screen-independent: world coords around the monitor)
const CONFETTI = (() => {
	const rnd = mulberry32(99);
	const arr = [];
	for (let k = 0; k < 120; k++) {
		const side = k % 2 ? 1 : -1;
		arr.push({
			x0: 3250 + side * 520,
			y0: 350,
			vx: -side * (250 + rnd() * 900),
			vy: -(900 + rnd() * 900),
			spin: (rnd() - 0.5) * 20,
			c: [COL.cyan, COL.yellow, COL.coral, COL.violet, COL.green, COL.pink][k % 6],
			w: 14 + rnd() * 14,
			h: 8 + rnd() * 8,
			shape: k % 3,
		});
	}
	return arr;
})();

function drawConfetti(ctx, t, t0) {
	const dt = t - t0;
	if (dt < 0 || dt > 3.2) return;
	for (const c of CONFETTI) {
		const drag = 1 - Math.exp(-1.6 * dt);
		const x = c.x0 + (c.vx / 1.6) * drag + Math.sin(dt * 5 + c.spin) * 20;
		const y = c.y0 + (c.vy / 1.6) * drag + 420 * dt * dt;
		const a = 1 - clamp((dt - 2.4) / 0.8);
		ctx.save();
		ctx.globalAlpha = a;
		ctx.translate(x, y);
		ctx.rotate(c.spin * dt);
		ctx.scale(1, Math.cos(dt * 8 + c.spin));
		ctx.fillStyle = c.c;
		if (c.shape === 0) ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
		else if (c.shape === 1) {
			ctx.beginPath();
			ctx.arc(0, 0, c.h * 0.8, 0, TAU);
			ctx.fill();
		} else {
			ctx.beginPath();
			ctx.moveTo(0, -c.h);
			ctx.lineTo(c.h, c.h);
			ctx.lineTo(-c.h, c.h);
			ctx.closePath();
			ctx.fill();
		}
		ctx.strokeStyle = INK;
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.restore();
	}
}

// events -----------------------------------------------------------------
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const HOURS = ["5 pm", "6 pm", "7 pm", "8 pm", "9 pm"];
const GRID = { x: CX + 90, y: CY + 150, cw: 132, ch: 80 };
const PAINT = [
	// buddy colour, cells [col,row] swept in order
	{ c: COL.cyan, t: CUE.paint, cells: [[2, 1], [3, 1], [4, 1], [4, 2], [3, 2], [2, 2], [2, 3], [3, 3], [4, 3]] },
	{ c: COL.violet, t: CUE.paint + 0.22, cells: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [4, 3], [3, 3], [1, 3]] },
	{ c: COL.yellow, t: CUE.paint + 0.44, cells: [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [3, 4], [1, 1], [0, 1]] },
	{ c: COL.green, t: CUE.paint + 0.66, cells: [[1, 0], [2, 0], [3, 2], [4, 2], [4, 3], [3, 3], [2, 4]] },
];
const cellC = (c, r) => [GRID.x + c * GRID.cw + GRID.cw / 2, GRID.y + r * GRID.ch + GRID.ch / 2];

function pointAt(pts, p) {
	const total = polyLength(pts);
	let target = total * p;
	for (let i = 1; i < pts.length; i++) {
		const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
		if (target <= seg) {
			const u = seg ? target / seg : 0;
			return [lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)];
		}
		target -= seg;
	}
	return pts[pts.length - 1];
}

function pageEvents(ctx, t) {
	const a = pageAlpha(t, CUE.events, CUE.dash);
	if (a <= 0) return;
	ctx.save();
	ctx.globalAlpha *= a;
	htext(ctx, "Events", CX, CY + 40, { size: 52, weight: 800, color: COL.chalk, mode: "none" });
	htext(ctx, "When can everyone play?", CX, CY + 92, { size: 28, weight: 500, color: COL.chalkDim, mode: "none" });
	// grid
	const gp = prog(t, CUE.events + 0.05, 0.45, Ease.outCubic);
	ctx.save();
	ctx.globalAlpha *= gp;
	DAYS.forEach((d, c) => htext(ctx, d, GRID.x + c * GRID.cw + GRID.cw / 2, GRID.y - 16, { size: 26, weight: 700, color: COL.chalkDim, mode: "none", align: "center" }));
	HOURS.forEach((h, r) => htext(ctx, h, GRID.x - 16, GRID.y + r * GRID.ch + GRID.ch / 2 + 9, { size: 22, weight: 600, color: COL.chalkDim, mode: "none", align: "right" }));
	solid(ctx, Shp.rrect(GRID.x, GRID.y, GRID.cw * 5, GRID.ch * 5, 12, { os: 0 }), "#0f1217");
	for (let c = 0; c <= 5; c++) stroke(ctx, Shp.line(GRID.x + c * GRID.cw, GRID.y, GRID.x + c * GRID.cw, GRID.y + GRID.ch * 5), { w: 2, color: COL.slate3, seed: c, p: gp });
	for (let r = 0; r <= 5; r++) stroke(ctx, Shp.line(GRID.x, GRID.y + r * GRID.ch, GRID.x + GRID.cw * 5, GRID.y + r * GRID.ch), { w: 2, color: COL.slate3, seed: 10 + r, p: gp });
	ctx.restore();
	// paint strokes
	ctx.save();
	ctx.beginPath();
	ctx.rect(GRID.x, GRID.y, GRID.cw * 5, GRID.ch * 5);
	ctx.clip();
	for (const pnt of PAINT) {
		const pts = pnt.cells.map((q) => cellC(q[0], q[1]));
		const pp = prog(t, pnt.t, 0.55, Ease.inOutSine);
		if (pp <= 0) continue;
		ctx.save();
		ctx.globalCompositeOperation = "lighter";
		stroke(ctx, pts, { w: 66, color: pnt.c, alpha: 0.32, p: pp, seed: pnt.t, wob: 6, lo: 0.75, rough: 0.2 });
		ctx.restore();
	}
	// best time glow (all four overlap: Fri 7 pm)
	const bt = prog(t, CUE.paint + 1.25, 0.35, Ease.outBack);
	if (bt > 0) {
		const [bx, by] = cellC(4, 2);
		ctx.save();
		ctx.globalAlpha *= 0.9;
		solid(ctx, Shp.rrect(bx - GRID.cw / 2 + 4, by - GRID.ch / 2 + 4, GRID.cw - 8, GRID.ch - 8, 10, { os: 0 }), COL.gold, 0.85 * bt);
		ctx.restore();
		stroke(ctx, Shp.rrect(bx - GRID.cw / 2 + 4, by - GRID.ch / 2 + 4, GRID.cw - 8, GRID.ch - 8, 10), { w: 4, color: INK, seed: 77, p: bt });
		drawStar(ctx, bx, by, 22 * bt, COL.white, 78);
	}
	ctx.restore();
	// brush following the latest stroke
	for (const pnt of PAINT) {
		const pp = prog(t, pnt.t, 0.55, Ease.inOutSine);
		if (pp <= 0 || pp >= 1) continue;
		const pts = pnt.cells.map((q) => cellC(q[0], q[1]));
		const [px, py] = pointAt(pts, pp);
		drawBrush(ctx, px, py, pnt.c, pnt.t);
	}
	// event card
	const ep = prog(t, CUE.rsvp - 0.1, 0.45, Ease.outBack);
	if (ep > 0) {
		const ex = CX + 790;
		const ey = CY + 140;
		ctx.save();
		ctx.translate(lerp(300, 0, ep), 0);
		ctx.globalAlpha *= clamp(ep * 2);
		uiCard(ctx, ex, ey, 380, 420, { r: 22, stroke: COL.cyan, w: 3.4, seed: 600 });
		htext(ctx, "FRI · 7:00 PM", ex + 28, ey + 62, { size: 38, weight: 800, color: COL.cyan, mode: "none" });
		htext(ctx, "Gloomkeep", ex + 28, ey + 118, { size: 40, weight: 800, color: COL.chalk, mode: "none" });
		htext(ctx, "Session 1 · Discord + VTT", ex + 28, ey + 156, { size: 22, weight: 500, color: COL.chalkDim, mode: "none" });
		htext(ctx, "RSVP", ex + 28, ey + 220, { size: 24, weight: 800, color: COL.chalkDim, mode: "none", spacing: 2 });
		BUDDIES.forEach((b, i) => {
			const rp = prog(t, CUE.rsvp + 0.08 + i * 0.22, 0.3, Ease.outBack);
			if (rp <= 0) return;
			const ax = ex + 64 + i * 84;
			const ay = ey + 280;
			popScale(ctx, ax, ay, rp, () => {
				solid(ctx, Shp.ellipseFill(0, 0, 30, 30, 20), b.color);
				stroke(ctx, Shp.ellipse(0, 0, 30, 30), { w: 3, color: "#0b0d11", seed: 610 + i });
				ctx.fillStyle = INK;
				ctx.beginPath();
				ctx.arc(-9, -4, 3.6, 0, TAU);
				ctx.arc(9, -4, 3.6, 0, TAU);
				ctx.fill();
				stroke(ctx, Shp.path("M-8,8 Q0,15 8,8")[0], { w: 2.6, seed: 615 + i });
				const yes = i !== 3;
				chip(ctx, -30, 38, 60, 34, { fill: yes ? COL.green : COL.yellow });
				if (yes) drawIcon(ctx, "check", 0, 55, 0.9, "#06222a", 620 + i);
				else htext(ctx, "?", 0, 67, { size: 28, weight: 800, color: "#3a2606", mode: "none", align: "center" });
			});
		});
		htext(ctx, "3 going · 1 maybe", ex + 28, ey + 392, { size: 24, weight: 600, color: COL.chalkDim, mode: "none", p: prog(t, CUE.rsvp + 1.0, 0.3), seed: 5 });
		// circled date + "it's on!"
		const cp = prog(t, CUE.calendar, 0.5, Ease.inOutSine);
		stroke(ctx, Shp.ellipse(ex + 146, ey + 48, 150, 44, { os: 0.2, a0: -2.8, spiral: 0.12 }), { w: 6, color: COL.coral, p: cp, seed: 630 });
		const on = prog(t, CUE.calendar + 0.35, 0.35, Ease.outBack);
		popScale(ctx, ex + 330, ey - 20, on, () => {
			ctx.rotate(0.18);
			htext(ctx, "it's on!", 0, 0, { size: 60, font: FONT_SCRIPT, weight: 700, color: COL.coral, mode: "none", align: "center", stroke: COL.slate, strokeW: 8 });
		});
		ctx.restore();
	}
	ctx.restore();
}

function drawBrush(ctx, x, y, color, seed) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(-0.7 + Math.sin(G.t * 12 + seed) * 0.15);
	const handle = Shp.rrect(-8, -170, 16, 120, 8, { os: 0 });
	wash(ctx, handle, COL.wood, { seed: 640 });
	stroke(ctx, handle, { w: 3, seed: 640 });
	const ferrule = Shp.rrect(-11, -58, 22, 26, 3, { os: 0 });
	solid(ctx, ferrule, "#c9cdd6");
	stroke(ctx, ferrule, { w: 3, seed: 641 });
	const bristle = Shp.path("M-11,-32 C-14,-10 -6,4 0,10 C6,4 14,-10 11,-32 Z")[0];
	wash(ctx, bristle, color, { seed: 642 });
	stroke(ctx, bristle, { w: 3, seed: 642 });
	ctx.restore();
}

// dashboard ----------------------------------------------------------------
function pageDash(ctx, t) {
	const a = pageAlpha(t, CUE.dash, 36.9);
	if (a <= 0) return;
	ctx.save();
	ctx.globalAlpha *= a;
	htext(ctx, "Dashboard", CX, CY + 40, { size: 52, weight: 800, color: COL.chalk, mode: "none" });
	const stats = [
		{ big: "42%", sub: "complete", bar: 0.42 },
		{ big: "7", sub: "games finished" },
		{ big: "6.5", sub: "effort / week" },
		{ big: "Mar 14", sub: "projected finish" },
	];
	stats.forEach((s, i) => {
		const sp = prog(t, CUE.dash + 0.1 + i * 0.08, 0.35, Ease.outBack);
		const x = CX + i * 296;
		const y = CY + 70;
		popScale(ctx, x + 136, y + 60, sp, () => {
			ctx.translate(-(x + 136), -(y + 60));
			uiCard(ctx, x, y, 272, 120, { r: 18, seed: 700 + i });
			htext(ctx, s.big, x + 22, y + 62, { size: 46, weight: 800, color: i === 2 ? COL.cyan : COL.chalk, mode: "none" });
			htext(ctx, s.sub, x + 22, y + 98, { size: 22, weight: 500, color: COL.chalkDim, mode: "none" });
			if (s.bar) {
				solid(ctx, Shp.rrect(x + 130, y + 36, 120, 14, 7, { os: 0 }), "#0f1217");
				solid(ctx, Shp.rrect(x + 130, y + 36, 120 * s.bar * prog(t, CUE.dash + 0.3, 0.6), 14, 7, { os: 0 }), COL.green);
			}
		});
	});
	// burn-up chart
	const cx0 = CX;
	const cy0 = CY + 220;
	const cw = CW;
	const ch = 410;
	const cp = prog(t, CUE.dash + 0.25, 0.35, Ease.outCubic);
	ctx.save();
	ctx.globalAlpha *= cp;
	uiCard(ctx, cx0, cy0, cw, ch, { r: 22, seed: 720 });
	htext(ctx, "Burn-up", cx0 + 30, cy0 + 52, { size: 32, weight: 800, color: COL.chalk, mode: "none" });
	htext(ctx, "effort completed vs. the backlog", cx0 + 180, cy0 + 50, { size: 22, weight: 500, color: COL.chalkDim, mode: "none" });
	const ax = cx0 + 70;
	const ay = cy0 + ch - 50;
	const aw = cw - 130;
	const ah = ch - 140;
	stroke(ctx, Shp.poly([[ax, cy0 + 80], [ax, ay], [ax + aw, ay]]), { w: 3, color: COL.chalkDim, seed: 721, p: prog(t, CUE.dash + 0.3, 0.4) });
	// backlog total line
	const totalY = ay - ah * 0.92;
	const dashP = prog(t, CUE.chart - 0.1, 0.5, Ease.linear);
	for (let k = 0; k < 30; k++) {
		const x0 = ax + (k / 30) * aw;
		if (k / 30 > dashP) break;
		stroke(ctx, Shp.line(x0, totalY, x0 + aw / 60, totalY), { w: 3, color: COL.coral, seed: 730 + k, alpha: 0.8 });
	}
	htext(ctx, "backlog total", ax + aw - 10, totalY - 14, { size: 22, weight: 600, color: COL.coral, mode: "none", align: "right", p: dashP });
	// completed effort (weekly cumulative)
	const pts = [];
	const vals = [0, 0.04, 0.09, 0.12, 0.18, 0.22, 0.29, 0.33, 0.38, 0.42];
	vals.forEach((v, i) => pts.push([ax + (i / 16) * aw, ay - v * ah]));
	const lp = prog(t, CUE.chart, 0.75, Ease.inOutSine);
	// area under
	if (lp > 0) {
		const cut = Math.max(2, Math.ceil(lp * pts.length));
		const area = pts.slice(0, cut).concat([[pts[cut - 1][0], ay], [ax, ay]]);
		solid(ctx, area, COL.cyan, 0.12);
	}
	stroke(ctx, pts, { w: 7, color: COL.cyan, p: lp, seed: 740, wob: 1 });
	// projection (dashed) to the finish flag
	const proj = [pts[pts.length - 1], [ax + (15.2 / 16) * aw, totalY]];
	const pp = prog(t, CUE.chart + 0.65, 0.45, Ease.inOutSine);
	const segs = 12;
	for (let k = 0; k < segs; k++) {
		const u0 = k / segs;
		const u1 = (k + 0.55) / segs;
		if (u0 > pp) break;
		const e = Math.min(u1, pp);
		stroke(ctx, Shp.line(lerp(proj[0][0], proj[1][0], u0), lerp(proj[0][1], proj[1][1], u0), lerp(proj[0][0], proj[1][0], e), lerp(proj[0][1], proj[1][1], e)), {
			w: 5,
			color: COL.violet,
			seed: 750 + k,
		});
	}
	// finish flag
	const ff = prog(t, CUE.chart + 1.05, 0.35, Ease.outBack);
	popScale(ctx, proj[1][0], proj[1][1], ff, () => {
		stroke(ctx, Shp.line(0, 0, 0, -70), { w: 4, color: COL.chalk, seed: 760 });
		const fl = Shp.path("M0,-70 L50,-58 L0,-44 Z")[0];
		solid(ctx, fl, COL.yellow);
		stroke(ctx, fl, { w: 3, seed: 761 });
	});
	htext(ctx, "burn rate", pts[5][0] - 10, pts[5][1] - 34, { size: 40, font: FONT_SCRIPT, weight: 700, color: COL.cyan, mode: "write", p: prog(t, CUE.chart + 0.3, 0.5, Ease.linear), align: "right", seed: 770 });
	ctx.restore();
	ctx.restore();
}

// ------------------------------------------------------------------ desk dressing
function drawDesk(ctx, t, a) {
	if (a <= 0) return;
	ctx.save();
	ctx.globalAlpha *= a;
	const y = DESK_Y + 30;
	const deskTop = [
		[1500, y],
		[4900, y],
	];
	const dgr = ctx.createLinearGradient(1200, 0, 5200, 0);
	dgr.addColorStop(0, "rgba(226,199,159,0)");
	dgr.addColorStop(0.2, "rgba(226,199,159,0.55)");
	dgr.addColorStop(0.8, "rgba(226,199,159,0.55)");
	dgr.addColorStop(1, "rgba(226,199,159,0)");
	ctx.fillStyle = dgr;
	ctx.fillRect(1200, y, 4000, 500);
	for (let k = 0; k < 8; k++) stroke(ctx, Shp.line(1800 + k * 360, y + 40 + (k % 3) * 30, 2000 + k * 360, y + 40 + (k % 3) * 30), { w: 2, alpha: 0.35, seed: 1100 + k, color: COL.woodDark });
	stroke(ctx, deskTop, { w: 5, seed: 1099 });
	// mug with steam
	const mx = 4250;
	const mug = Shp.path(`M${mx - 50},${y - 110} L${mx + 50},${y - 110} L${mx + 44},${y} L${mx - 44},${y} Z`)[0];
	wash(ctx, mug, COL.coral, { seed: 1110 });
	sketch(ctx, mug, { w: 4, seed: 1110 });
	stroke(ctx, Shp.path(`M${mx + 48},${y - 90} C${mx + 90},${y - 90} ${mx + 90},${y - 30} ${mx + 44},${y - 30}`)[0], { w: 5, seed: 1111 });
	htext(ctx, "GG", mx, y - 45, { size: 40, weight: 800, align: "center", mode: "none", color: COL.white });
	for (let k = 0; k < 3; k++) {
		const sx = mx - 25 + k * 25;
		const ph = t * 2 + k;
		stroke(ctx, Shp.path(`M${sx},${y - 125} C${sx + 14 * Math.sin(ph)},${y - 160} ${sx - 14 * Math.sin(ph)},${y - 190} ${sx + 6},${y - 225}`)[0], { w: 3, alpha: 0.4, seed: 1112 + k });
	}
	// dice on desk
	drawD20(ctx, 2150, y - 38, 0.9, COL.violet, 1120, -0.2, "20");
	drawD6(ctx, 2270, y - 26, 1, COL.white, 1121, 0.25, 6);
	drawMeeple(ctx, 4450, y - 36, 1.05, COL.green, 1122, 0.1);
	ctx.restore();
}

// ------------------------------------------------------------------ finale
const FIN_Y = -850;
const FIN_X = PILE_X;

function drawFinale(ctx, t) {
	if (t < 38.6) return;
	const size = 330;
	const wsz = 250;
	const ww = measureText(ctx, "NextQuest", wsz, 800);
	const total = size + 60 + ww;
	const mx = FIN_X - total / 2 + size / 2;
	const my = FIN_Y;
	// slam
	const sl = prog(t, CUE.finale - 0.16, 0.16, Ease.inQuad);
	if (sl > 0) {
		const sq = spring(t, CUE.finale, 2.6, 6);
		ctx.save();
		ctx.translate(mx, my);
		const sc = lerp(3.2, 1, sl) * (1 + sq * 0.1);
		ctx.scale(sc, sc * (1 - sq * 0.08));
		ctx.globalAlpha *= clamp(sl * 3);
		drawLogoMark(ctx, 0, 0, size, 0.35 + 0.65 * prog(t, CUE.finale - 0.05, 0.3, Ease.linear));
		ctx.restore();
		// shockwave ring
		const sw = clamp((t - CUE.finale) / 0.6);
		if (sw > 0 && sw < 1) {
			stroke(ctx, Shp.ellipse(mx, my, 200 + sw * 520, 200 + sw * 520), { w: 16 * (1 - sw), color: COL.cyan, seed: 1200, alpha: 1 - sw });
		}
	}
	drawWordmark(ctx, mx + size / 2 + 60, my + wsz * 0.36, wsz, prog(t, CUE.finale + 0.08, 0.65, Ease.linear), { align: "left" });
	// tagline
	htext(ctx, "Stop scrolling the backlog.", FIN_X, FIN_Y + 285, {
		size: 120,
		weight: 700,
		color: "#3b4252",
		align: "center",
		mode: "write",
		p: prog(t, CUE.stop, 1.35, Ease.linear),
		seed: 1300,
	});
	htext(ctx, "Start playing it.", FIN_X, FIN_Y + 455, {
		size: 170,
		weight: 800,
		color: COL.cyanDeep,
		align: "center",
		mode: "pop",
		stagger: 0.7,
		p: prog(t, CUE.start, 0.8, Ease.linear),
		seed: 1301,
	});
	const ul = prog(t, CUE.start + 0.85, 0.4, Ease.outCubic);
	stroke(ctx, Shp.path(`M${FIN_X - 560},${FIN_Y + 505} C${FIN_X - 200},${FIN_Y + 485} ${FIN_X + 200},${FIN_Y + 530} ${FIN_X + 580},${FIN_Y + 490}`)[0], { w: 14, color: COL.yellow, p: ul, seed: 1302 });
	// sting sparkles (kept clear of the lettering)
	const SPK = [
		[-980, -120], [-860, 180], [-700, -300], [-1020, 420], [930, -230], [1010, 120], [780, -330], [1060, 400],
		[-560, 620], [620, 640], [-300, -330], [340, -320],
	];
	SPK.forEach(([dx, dy], k) => {
		const st = CUE.sting + (k % 4) * 0.08;
		const sp = env(t, st, st + 1.8, 0.15, 0.9);
		if (sp <= 0) return;
		drawSparkle(ctx, FIN_X + dx, FIN_Y + dy, 44 * sp, [COL.yellow, COL.cyan, COL.coral][k % 3], t + k);
	});
}

const CLOUDS_FIN = [
	{ x: -1000, y: -1060, v: 10 },
	{ x: 1850, y: -1080, v: -8 },
	{ x: -900, y: -420, v: 7 },
	{ x: 1900, y: -380, v: -5 },
];

// ------------------------------------------------------------------ iris out
function drawIris(ctx, t) {
	const u = prog(t, CUE.iris, 1.25, Ease.inCubic);
	if (u <= 0) return;
	// centre on the logo mark in screen space
	const cam = camera(t);
	const size = 330;
	const ww = measureText(ctx, "NextQuest", 250, 800);
	const mxw = FIN_X - (size + 60 + ww) / 2 + size / 2;
	const sx = (mxw - cam.x) * cam.z + W / 2;
	const sy = (FIN_Y - cam.y) * cam.z + H / 2;
	const r = lerp(Math.hypot(W, H), 0, u);
	ctx.save();
	ctx.fillStyle = INK;
	ctx.beginPath();
	ctx.rect(0, 0, W, H);
	ctx.arc(sx, sy, Math.max(0, r), 0, TAU, true);
	ctx.fill("evenodd");
	ctx.restore();
}

// ------------------------------------------------------------------ frame
function drawSpeedLines(ctx, t) {
	const a = whipAmount(t);
	if (a <= 0) return;
	ctx.save();
	const rnd = mulberry32(Math.floor(t * 30));
	for (let k = 0; k < 22; k++) {
		const y = rnd() * H;
		const x = rnd() * W;
		const l = 300 + rnd() * 700;
		stroke(ctx, Shp.line(x - l / 2, y, x + l / 2, y), { w: 3 + rnd() * 5, alpha: 0.45 * a, seed: k, color: INK });
	}
	ctx.restore();
}

function renderFrame(ctx, t) {
	setFrameTime(t);
	drawPaperBase(ctx);
	const cam = camera(t);
	ctx.save();
	ctx.translate(W / 2, H / 2);
	ctx.rotate(cam.rot);
	ctx.scale(cam.z, cam.z);
	ctx.translate(-cam.x, -cam.y);

	const inValley = t < 9.9 || t > 36.1;
	const inApp = t > 9.2 && t < 36.8;
	if (inValley) {
		drawClouds(ctx, t, CLOUDS_1);
		if (t > 38.2) drawClouds(ctx, t, CLOUDS_FIN);
		drawGround(ctx, t);
		drawShadowOnGround(ctx, t);
		if (t < 9.9) {
			drawPile(ctx, t);
			partyScene1(ctx, t);
			labelsScene1(ctx, t);
		} else {
			drawPile(ctx, t);
			drawFlag(ctx, t);
			partyScene7(ctx, t);
			drawFinale(ctx, t);
		}
	}
	if (inApp) {
		drawDesk(ctx, t, prog(t, CUE.toApp, 0.6));
		const mp = prog(t, CUE.toApp - 0.05, 0.85, Ease.linear);
		if (mp > 0) {
			const active = t < CUE.vote ? "backlog" : t < CUE.events ? "pick" : t < CUE.dash ? "events" : "dash";
			const activeT = t < CUE.vote ? 12.9 : t < CUE.events ? CUE.vote : t < CUE.dash ? CUE.events : CUE.dash;
			drawMonitor(ctx, mp, active, activeT, "NextQuest", t < CUE.toApp + 0.7);
			ctx.save();
			ctx.beginPath();
			ctx.rect(WIN.x + WIN.side + 2, WIN.y + WIN.bar + 2, WIN.w - WIN.side - 4, WIN.h - WIN.bar - 4);
			ctx.clip();
			pageBacklog(ctx, t);
			pageVote(ctx, t);
			pagePick(ctx, t);
			pageEvents(ctx, t);
			pageDash(ctx, t);
			winnerReveal(ctx, t);
			ctx.restore();
		}
		partyDesk(ctx, t);
		coinsInFlight(ctx, t);
		drawConfetti(ctx, t, CUE.hit);
		drawLogoScene(ctx, t);
	}
	ctx.restore();
	drawSpeedLines(ctx, t);
	drawPaperOverlay(ctx);
	drawIris(ctx, t);
}
