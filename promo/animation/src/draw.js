/*
 * Characters, props and UI pieces for the NextQuest promo, all hand-drawn via engine.js.
 * Local coordinates: characters stand with their feet at (0, 0).
 */
"use strict";

// ---------------------------------------------------------------- the party
const BUDDIES = [
	{ name: "Pip", color: COL.cyan, wash: "#72dcea", acc: "headphones", h: 1.0, seed: 11 },
	{ name: "Moss", color: COL.violet, wash: "#a79bff", acc: "wizard", h: 1.04, seed: 23 },
	{ name: "Tally", color: COL.yellow, wash: "#ffd36a", acc: "beanie", h: 0.92, seed: 37 },
	{ name: "Bo", color: COL.green, wash: "#7fdfae", acc: "glasses", h: 1.1, seed: 53 },
];

function bodyShape(h, sq = 0) {
	const pts = [];
	const cy = -100 * h;
	const rx = 68 * (1 + sq * 0.5);
	const ry = 92 * h * (1 - sq * 0.35);
	for (let k = 0; k <= 48; k++) {
		const a = (k / 48) * TAU - Math.PI / 2;
		const bottom = Math.sin(a);
		pts.push([Math.cos(a) * rx * (1 + 0.1 * bottom), cy * (1 - sq * 0.35) + Math.sin(a) * ry]);
	}
	return pts;
}

/**
 * o: { x, y, s, look:[x,y], mood, arms, armL, armR, p, jump, squash, flip, sweat, prop, wave, t0 }
 */
function drawBuddy(ctx, b, o = {}) {
	const t = G.t;
	const p = o.p ?? 1;
	if (p <= 0) return;
	const h = b.h;
	const phase = b.seed * 0.37;
	const bob = o.still ? 0 : Math.sin(t * TAU * 0.9 + phase) * 3.5;
	const sq = (o.squash ?? 0) + (o.still ? 0 : 0.015 * Math.sin(t * TAU * 0.9 + phase + 1));
	ctx.save();
	ctx.translate(o.x ?? 0, (o.y ?? 0) - (o.jump ?? 0));
	ctx.scale((o.s ?? 1) * (o.flip ? -1 : 1), o.s ?? 1);
	if (o.rot) ctx.rotate(o.rot);
	const lineW = 4.6;
	const seed = b.seed;
	const outline = clamp(p / 0.5);
	const appear = clamp((p - 0.35) / 0.35);
	const detail = clamp((p - 0.55) / 0.45);
	const sqh = 1 - sq * 0.35;

	// shadow
	ctx.save();
	ctx.globalAlpha = 0.18 * outline * (1 - clamp((o.jump ?? 0) / 200) * 0.7);
	ctx.fillStyle = INK;
	ctx.beginPath();
	ctx.ellipse(0, 2, 62 * (1 + sq), 10, 0, 0, TAU);
	ctx.fill();
	ctx.restore();

	ctx.translate(0, bob * (1 - sq));

	// feet
	const footY = -4;
	for (const fx of [-26, 26]) {
		const fp = Shp.ellipse(fx, footY, 20, 9, { os: 0.05 });
		if (detail > 0) wash(ctx, Shp.ellipseFill(fx, footY, 20, 9, 20), shade(b.color, -0.45), { alpha: detail, seed });
	}

	// arms (behind body when resting)
	const arms = o.arms ?? "rest";
	const armPts = (side) => {
		const sx = side * 58 * (1 + sq * 0.5);
		const sy = -112 * h * sqh;
		let hx;
		let hy;
		let pose = side < 0 ? (o.armL ?? arms) : (o.armR ?? arms);
		const wv = Math.sin(t * TAU * 2.4 + phase) * 16;
		switch (pose) {
			case "up":
				hx = side * 100;
				hy = -228 * h + Math.sin(t * TAU * 2 + side) * 6;
				break;
			case "wave":
				hx = side * (104 + wv * 0.4);
				hy = -210 * h + wv;
				break;
			case "hold":
				hx = side * 30;
				hy = -66 * h;
				break;
			case "point":
				hx = side * 140;
				hy = -150 * h;
				break;
			case "throw":
				hx = side * 70;
				hy = -236 * h;
				break;
			case "hip":
				hx = side * 70;
				hy = -80 * h;
				break;
			default:
				hx = side * 96;
				hy = -46 * h + Math.sin(t * TAU * 0.9 + phase) * 3;
		}
		if (o.handOff && o.handOff[side < 0 ? 0 : 1]) {
			hx += o.handOff[side < 0 ? 0 : 1][0];
			hy += o.handOff[side < 0 ? 0 : 1][1];
		}
		const mx = (sx + hx) / 2 + side * 14;
		const my = (sy + hy) / 2 + 8;
		const pts = [];
		for (let k = 0; k <= 12; k++) {
			const u = k / 12;
			pts.push([
				(1 - u) * (1 - u) * sx + 2 * (1 - u) * u * mx + u * u * hx,
				(1 - u) * (1 - u) * sy + 2 * (1 - u) * u * my + u * u * hy,
			]);
		}
		return { pts, hx, hy, pose };
	};
	const aL = armPts(-1);
	const aR = armPts(1);
	for (const a of [aL, aR]) {
		stroke(ctx, a.pts, { w: lineW * 1.1, p: detail, seed: seed + a.hx });
	}

	// body
	const body = bodyShape(h, sq);
	wash(ctx, body, b.wash, { alpha: appear, seed, off: [4, 3] });
	// belly highlight
	ctx.save();
	ctx.globalAlpha = 0.28 * appear;
	ctx.fillStyle = "#ffffff";
	ctx.beginPath();
	ctx.ellipse(-18, -130 * h * sqh, 24, 36 * h, -0.4, 0, TAU);
	ctx.fill();
	ctx.restore();
	// hatch shadow on right side
	if (detail > 0) {
		ctx.save();
		ctx.beginPath();
		ctx.ellipse(40, -80 * h * sqh, 40, 80 * h, 0, 0, TAU);
		ctx.clip();
		hatch(ctx, body, { gap: 10, alpha: 0.28 * detail, seed, angle: -0.9 });
		ctx.restore();
	}
	sketch(ctx, body, { w: lineW, p: outline, seed });

	// hands
	for (const a of [aL, aR]) {
		if (detail <= 0) break;
		wash(ctx, Shp.ellipseFill(a.hx, a.hy, 10, 10, 16), b.wash, { alpha: detail, seed: seed + 3, off: [0, 0] });
		stroke(ctx, Shp.ellipse(a.hx, a.hy, 10, 10), { w: 3.4, p: detail, seed: seed + a.hy });
	}

	// face
	if (detail > 0) drawFace(ctx, b, o, h * sqh, detail);

	// accessory
	if (detail > 0) drawAccessory(ctx, b, h * sqh, detail, sq);

	// sweat
	if (o.sweat) {
		const sy = -170 * h + ((t * 60) % 30);
		ctx.save();
		ctx.globalAlpha = o.sweat;
		const drop = Shp.path(`M78,${sy - 16} C84,${sy - 4} 88,${sy} 88,${sy + 6} C88,${sy + 14} 70,${sy + 14} 70,${sy + 6} C70,${sy} 74,${sy - 4} 78,${sy - 16} Z`)[0];
		wash(ctx, drop, COL.cyanWash, { seed: 9, off: [0, 0] });
		stroke(ctx, drop, { w: 2.6, seed: 9 });
		ctx.restore();
	}
	// held prop
	if (o.prop && detail > 0) {
		ctx.save();
		ctx.translate((aL.hx + aR.hx) / 2, (aL.hy + aR.hy) / 2 - 10);
		o.prop(ctx, detail);
		ctx.restore();
	}
	ctx.restore();
}

function drawFace(ctx, b, o, h, p) {
	const t = G.t;
	const mood = o.mood ?? "happy";
	const look = o.look ?? [0, 0];
	const eyeY = -128 * h;
	const seed = b.seed + 100;
	const phase = b.seed * 0.71;
	const blinking = !o.noBlink && fract((t + phase) / 3.3) < 0.045;
	const shock = mood === "shock";
	const erx = shock ? 17 : 14.5;
	const ery = shock ? 21 : 17.5;
	ctx.save();
	ctx.globalAlpha *= p;
	for (const side of [-1, 1]) {
		const ex = side * 23;
		if (blinking || mood === "joy") {
			// closed happy eyes ^ ^
			const arc =
				mood === "joy"
					? Shp.path(`M${ex - 11},${eyeY + 4} Q${ex},${eyeY - 12} ${ex + 11},${eyeY + 4}`)[0]
					: Shp.path(`M${ex - 11},${eyeY} Q${ex},${eyeY + 7} ${ex + 11},${eyeY}`)[0];
			stroke(ctx, arc, { w: 4.2, seed: seed + side });
			continue;
		}
		solid(ctx, Shp.ellipseFill(ex, eyeY, erx, ery, 24), COL.white);
		stroke(ctx, Shp.ellipse(ex, eyeY, erx, ery, { os: 0.1 }), { w: 3, seed: seed + side * 3 });
		const pr = shock ? 5 : 7.5;
		const px = ex + look[0] * (erx - pr - 2);
		const py = eyeY + look[1] * (ery - pr - 2);
		ctx.fillStyle = INK;
		ctx.beginPath();
		ctx.arc(px, py, pr, 0, TAU);
		ctx.fill();
		ctx.fillStyle = "#fff";
		ctx.beginPath();
		ctx.arc(px - pr * 0.35, py - pr * 0.4, pr * 0.32, 0, TAU);
		ctx.fill();
	}
	// brows
	if (mood === "shock" || mood === "worried" || mood === "determined") {
		for (const side of [-1, 1]) {
			const ex = side * 23;
			let d;
			if (mood === "shock") d = `M${ex - 12},${eyeY - 30} Q${ex},${eyeY - 38} ${ex + 12},${eyeY - 30}`;
			else if (mood === "worried")
				d = `M${ex - 12},${eyeY - 26 + side * 5} L${ex + 12},${eyeY - 26 - side * 5}`;
			else d = `M${ex - 12},${eyeY - 28 - side * 5} L${ex + 12},${eyeY - 24 + side * 5}`;
			stroke(ctx, Shp.path(d)[0], { w: 4.2, seed: seed + side * 7 });
		}
	}
	// cheeks
	ctx.save();
	ctx.globalAlpha *= 0.45;
	ctx.fillStyle = COL.pink;
	for (const side of [-1, 1]) {
		ctx.beginPath();
		ctx.ellipse(side * 44, eyeY + 24, 10, 6, 0, 0, TAU);
		ctx.fill();
	}
	ctx.restore();
	// mouth
	const my = eyeY + 34;
	if (mood === "shock") {
		const m = Shp.ellipseFill(0, my + 4, 9, 12, 20);
		solid(ctx, m, "#3a1f2a");
		stroke(ctx, Shp.ellipse(0, my + 4, 9, 12), { w: 3.2, seed });
	} else if (mood === "grin" || mood === "joy" || mood === "cheer") {
		const d = `M-17,${my - 3} Q0,${my - 1} 17,${my - 3} Q14,${my + 18} 0,${my + 18} Q-14,${my + 18} -17,${my - 3} Z`;
		const m = Shp.path(d)[0];
		solid(ctx, m, "#3a1f2a");
		ctx.save();
		ctx.beginPath();
		ctx.moveTo(m[0][0], m[0][1]);
		for (const q of m) ctx.lineTo(q[0], q[1]);
		ctx.clip();
		ctx.fillStyle = "#ff7d8f";
		ctx.beginPath();
		ctx.ellipse(0, my + 16, 10, 7, 0, 0, TAU);
		ctx.fill();
		ctx.restore();
		stroke(ctx, m, { w: 3.2, seed });
	} else if (mood === "worried") {
		stroke(ctx, Shp.path(`M-14,${my + 4} Q-7,${my - 2} 0,${my + 4} Q7,${my + 10} 14,${my + 4}`)[0], {
			w: 3.6,
			seed,
		});
	} else if (mood === "determined") {
		stroke(ctx, Shp.path(`M-14,${my + 2} Q0,${my + 8} 14,${my}`)[0], { w: 3.8, seed });
	} else {
		stroke(ctx, Shp.path(`M-15,${my} Q0,${my + 14} 15,${my}`)[0], { w: 3.8, seed });
	}
	ctx.restore();
}

function drawAccessory(ctx, b, h, p, sq) {
	const seed = b.seed + 200;
	const top = -192 * h;
	ctx.save();
	ctx.globalAlpha *= p;
	switch (b.acc) {
		case "headphones": {
			const band = Shp.path(`M-70,${-128 * h} C-74,${top - 40} 74,${top - 40} 70,${-128 * h}`)[0];
			stroke(ctx, band, { w: 11, color: COL.slate3, seed });
			stroke(ctx, band, { w: 3, color: "#5b6576", seed: seed + 1, alpha: 0.8 });
			for (const side of [-1, 1]) {
				const cup = Shp.rrect(side * 74 - 14, -150 * h, 28, 50, 12, { os: 0 });
				wash(ctx, cup, COL.slate2, { seed: seed + side, off: [0, 0], hl: 0.3 });
				stroke(ctx, cup, { w: 3.4, seed: seed + side });
				solid(ctx, Shp.rrect(side * 74 - 6, -140 * h, 12, 30, 5, { os: 0 }), COL.cyan, 0.9);
			}
			break;
		}
		case "wizard": {
			const brim = Shp.ellipseFill(0, top + 18, 78, 15, 30);
			const cone = Shp.path(
				`M-54,${top + 16} C-40,${top - 40} -8,${top - 110} 30,${top - 150} C36,${top - 154} 42,${top - 146} 38,${top - 138} C26,${top - 100} 44,${top - 40} 54,${top + 16} Z`,
			)[0];
			wash(ctx, cone, "#6a5ae6", { seed, off: [2, 2] });
			hatch(ctx, cone, { gap: 9, alpha: 0.3, seed, angle: 0.7 });
			sketch(ctx, cone, { w: 4.2, seed });
			wash(ctx, brim, "#5848d0", { seed: seed + 2, off: [2, 1] });
			stroke(ctx, Shp.ellipse(0, top + 18, 78, 15), { w: 4.2, seed: seed + 3 });
			drawStar(ctx, 4, top - 50, 15, COL.yellow, seed + 4);
			drawStar(ctx, -22, top - 12, 8, COL.yellow, seed + 5);
			break;
		}
		case "beanie": {
			const dome = Shp.path(
				`M-66,${top + 44} C-70,${top - 30} 70,${top - 30} 66,${top + 44} C30,${top + 34} -30,${top + 34} -66,${top + 44} Z`,
			)[0];
			wash(ctx, dome, COL.coral, { seed, off: [2, 2] });
			for (let k = 0; k < 4; k++) {
				const y = top + 6 + k * 0;
				const x = -45 + k * 30;
				stroke(ctx, Shp.path(`M${x},${top + 36} C${x + 2},${top + 10} ${x + 6},${top - 4} ${x + 8},${top - 12}`)[0], {
					w: 2.6,
					alpha: 0.5,
					seed: seed + k,
					color: "#a3392b",
				});
				void y;
			}
			sketch(ctx, dome, { w: 4.2, seed });
			const cuff = Shp.path(`M-68,${top + 44} C-30,${top + 32} 30,${top + 32} 68,${top + 44} L66,${top + 60} C30,${top + 50} -30,${top + 50} -66,${top + 60} Z`)[0];
			wash(ctx, cuff, "#e0584a", { seed: seed + 1, off: [1, 1] });
			stroke(ctx, cuff, { w: 3.6, seed: seed + 1 });
			const pom = Shp.ellipseFill(0, top - 18, 17, 16, 20);
			wash(ctx, pom, COL.white, { seed: seed + 2, off: [1, 1] });
			stroke(ctx, Shp.ellipse(0, top - 18, 17, 16), { w: 3.6, seed: seed + 2 });
			break;
		}
		case "glasses": {
			for (const side of [-1, 1]) {
				stroke(ctx, Shp.ellipse(side * 23, -128 * h, 22, 21, { os: 0.08 }), { w: 4, seed: seed + side });
			}
			stroke(ctx, Shp.path(`M-2,${-130 * h} Q0,${-136 * h} 2,${-130 * h}`)[0], { w: 3.4, seed });
			stroke(ctx, Shp.line(-45, -132 * h, -64, -138 * h), { w: 3.4, seed: seed + 5 });
			stroke(ctx, Shp.line(45, -132 * h, 64, -138 * h), { w: 3.4, seed: seed + 6 });
			// tuft of hair
			for (let k = -1; k <= 1; k++) {
				stroke(ctx, Shp.path(`M${k * 10},${top + 4} Q${k * 14 + 6},${top - 22} ${k * 22 + 10},${top - 26}`)[0], {
					w: 4,
					seed: seed + k * 3,
				});
			}
			break;
		}
	}
	ctx.restore();
}

// ---------------------------------------------------------------- little icons
function starPts(cx, cy, r, n = 5, inner = 0.45, rot = -Math.PI / 2) {
	const pts = [];
	for (let k = 0; k <= n * 2; k++) {
		const rr = k % 2 === 0 ? r : r * inner;
		const a = rot + (k / (n * 2)) * TAU;
		pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
	}
	return pts;
}
function drawStar(ctx, cx, cy, r, color, seed = 0, p = 1) {
	if (p <= 0) return;
	const pts = starPts(cx, cy, r);
	wash(ctx, pts, color, { seed, off: [1, 1], alpha: p });
	stroke(ctx, pts, { w: Math.max(2, r * 0.18), seed, p });
}

function drawSparkle(ctx, x, y, r, color = COL.yellow, rot = 0) {
	if (r <= 0.5) return;
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(rot);
	const pts = [];
	for (let k = 0; k <= 8; k++) {
		const rr = k % 2 === 0 ? r : r * 0.22;
		const a = (k / 8) * TAU;
		pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
	}
	solid(ctx, pts, color);
	stroke(ctx, pts, { w: Math.max(1.5, r * 0.09), seed: x * 0.1, wob: 0.6 });
	ctx.restore();
}

function drawHeart(ctx, x, y, s, color = COL.coral, seed = 0) {
	const pts = Shp.path("M0,10 C-6,4 -16,-2 -16,-10 C-16,-18 -6,-20 0,-12 C6,-20 16,-18 16,-10 C16,-2 6,4 0,10 Z")[0].map(
		(q) => [x + q[0] * s, y + q[1] * s],
	);
	wash(ctx, pts, color, { seed, off: [1, 1] });
	stroke(ctx, pts, { w: 2.6 * Math.max(0.6, s), seed });
}

function drawPuff(ctx, x, y, r, a, seed = 0, color = "#ffffff") {
	if (a <= 0 || r <= 0) return;
	ctx.save();
	ctx.globalAlpha *= a;
	const rnd = mulberry32(Math.floor(seed * 1000) + 7);
	for (let k = 0; k < 6; k++) {
		const ang = (k / 6) * TAU + rnd();
		const d = r * 0.55;
		const rr = r * (0.45 + rnd() * 0.25);
		const cx = x + Math.cos(ang) * d;
		const cy = y + Math.sin(ang) * d * 0.7;
		wash(ctx, Shp.ellipseFill(cx, cy, rr, rr * 0.85, 18), color, { seed: seed + k, off: [0, 0], grad: false, edge: false });
		stroke(ctx, Shp.ellipse(cx, cy, rr, rr * 0.85, { os: 0.02, a0: ang + 1.5 }), {
			w: 3,
			seed: seed + k,
			alpha: 0.85,
			p: 0.72,
		});
	}
	ctx.restore();
}

// ---------------------------------------------------------------- props
function drawController(ctx, x, y, s, color = COL.slate3, seed = 0, rot = 0) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(rot);
	ctx.scale(s, s);
	const body = Shp.path(
		"M-50,-20 C-40,-38 40,-38 50,-20 C62,0 68,34 48,38 C34,41 28,20 16,16 L-16,16 C-28,20 -34,41 -48,38 C-68,34 -62,0 -50,-20 Z",
	)[0];
	wash(ctx, body, color, { seed, off: [2, 2] });
	sketch(ctx, body, { w: 4, seed });
	stroke(ctx, Shp.line(-36, -6, -18, -6), { w: 5, seed: seed + 1, color: COL.ink });
	stroke(ctx, Shp.line(-27, -15, -27, 3), { w: 5, seed: seed + 2, color: COL.ink });
	const bcols = [COL.coral, COL.yellow, COL.green, COL.cyan];
	[
		[26, -12],
		[36, -3],
		[26, 6],
		[16, -3],
	].forEach((b, i) => {
		solid(ctx, Shp.ellipseFill(b[0], b[1], 5, 5, 12), bcols[i]);
	});
	ctx.restore();
}

function drawD20(ctx, x, y, s, color = COL.violet, seed = 0, rot = 0, num = "20") {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(rot);
	ctx.scale(s, s);
	const hex = Shp.ngon(0, 0, 40, 6, -Math.PI / 2);
	wash(ctx, hex, color, { seed, off: [2, 2] });
	const tri = [
		[0, -24],
		[22, 14],
		[-22, 14],
		[0, -24],
	];
	solid(ctx, tri, shade(color, 0.3), 0.8);
	sketch(ctx, hex, { w: 3.6, seed });
	stroke(ctx, tri, { w: 2.6, seed: seed + 1 });
	for (let k = 0; k < 6; k++) {
		const hv = hex[k];
		const tv = k === 0 ? tri[0] : k === 1 || k === 2 ? tri[1] : k === 3 ? tri[1] : tri[2];
		if (k === 3) stroke(ctx, Shp.line(hv[0], hv[1], tri[2][0], tri[2][1]), { w: 2.2, seed: seed + k });
		stroke(ctx, Shp.line(hv[0], hv[1], tv[0], tv[1]), { w: 2.2, seed: seed + k + 9 });
	}
	htext(ctx, num, 0, 8, { size: 16, weight: 800, align: "center", mode: "none", jitter: 0.4 });
	ctx.restore();
}

function drawMeeple(ctx, x, y, s, color = COL.coral, seed = 0, rot = 0) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(rot);
	ctx.scale(s, s);
	const m = Shp.path(
		"M0,-38 C12,-38 16,-28 13,-19 C26,-17 40,-11 40,-2 C40,6 30,6 22,4 L32,34 L8,34 L0,20 L-8,34 L-32,34 L-22,4 C-30,6 -40,6 -40,-2 C-40,-11 -26,-17 -13,-19 C-16,-28 -12,-38 0,-38 Z",
	)[0];
	wash(ctx, m, color, { seed, off: [2, 2] });
	sketch(ctx, m, { w: 3.6, seed });
	ctx.restore();
}

function drawBox(ctx, x, y, w, h, color, seed = 0, rot = 0, kind = 0) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(rot);
	const box = Shp.rrect(-w / 2, -h / 2, w, h, 6, { os: 0 });
	wash(ctx, box, color, { seed, off: [2, 2] });
	const rnd = mulberry32(seed * 97 + 3);
	// cover art band
	const art = Shp.rrect(-w / 2 + 8, -h / 2 + 8, w - 16, h * 0.55, 4, { os: 0 });
	solid(ctx, art, shade(color, 0.35), 0.9);
	ctx.save();
	ctx.beginPath();
	ctx.rect(-w / 2 + 8, -h / 2 + 8, w - 16, h * 0.55);
	ctx.clip();
	if (kind % 3 === 0) {
		// little mountain & sun
		solid(
			ctx,
			[
				[-w / 2 + 6, -h / 2 + 8 + h * 0.55],
				[-w * 0.1, -h / 2 + 18],
				[w * 0.1, -h / 2 + 8 + h * 0.3],
				[w * 0.25, -h / 2 + 24],
				[w / 2, -h / 2 + 8 + h * 0.55],
			],
			shade(color, -0.35),
			0.8,
		);
		solid(ctx, Shp.ellipseFill(w * 0.25, -h / 2 + 20, 6, 6, 12), COL.yellow, 0.95);
	} else if (kind % 3 === 1) {
		drawStar(ctx, 0, -h / 2 + 8 + h * 0.27, Math.min(w, h) * 0.17, COL.yellow, seed + 5);
	} else {
		solid(ctx, Shp.ellipseFill(0, -h / 2 + 8 + h * 0.3, w * 0.18, w * 0.18, 16), shade(color, -0.3), 0.8);
	}
	ctx.restore();
	// title scribbles
	const ly = -h / 2 + 8 + h * 0.55 + 10;
	stroke(ctx, Shp.line(-w / 2 + 12, ly, -w / 2 + 12 + (w - 24) * (0.6 + rnd() * 0.3), ly), {
		w: 3.4,
		seed: seed + 1,
		alpha: 0.75,
	});
	if (h > 70)
		stroke(ctx, Shp.line(-w / 2 + 12, ly + 11, -w / 2 + 12 + (w - 24) * (0.3 + rnd() * 0.3), ly + 11), {
			w: 2.4,
			seed: seed + 2,
			alpha: 0.5,
		});
	sketch(ctx, box, { w: 3.8, seed });
	ctx.restore();
}

function drawCartridge(ctx, x, y, s, color, seed = 0, rot = 0) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(rot);
	ctx.scale(s, s);
	const c = Shp.path("M-30,-38 L22,-38 L30,-30 L30,38 L-30,38 Z")[0];
	wash(ctx, c, "#8d95a6", { seed, off: [2, 2] });
	const lab = Shp.rrect(-22, -24, 44, 44, 4, { os: 0 });
	wash(ctx, lab, color, { seed: seed + 1, off: [1, 1] });
	for (let k = 0; k < 4; k++) stroke(ctx, Shp.line(-20 + k * 12, 30, -20 + k * 12, 36), { w: 2, seed: seed + k });
	sketch(ctx, c, { w: 3.6, seed });
	stroke(ctx, lab, { w: 2.6, seed: seed + 3 });
	ctx.restore();
}

function drawBook(ctx, x, y, s, color, seed = 0, rot = 0) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(rot);
	ctx.scale(s, s);
	const b = Shp.rrect(-36, -46, 72, 92, 5, { os: 0 });
	wash(ctx, b, color, { seed, off: [2, 2] });
	stroke(ctx, Shp.line(-26, -44, -26, 44), { w: 2.6, seed: seed + 1, alpha: 0.7 });
	// emblem: a little shield
	const sh = Shp.path("M6,-24 L22,-18 C22,0 16,10 6,16 C-4,10 -10,0 -10,-18 Z")[0];
	wash(ctx, sh, COL.yellow, { seed: seed + 2, off: [1, 1] });
	stroke(ctx, sh, { w: 2.6, seed: seed + 2 });
	stroke(ctx, Shp.line(-8, 28, 20, 28), { w: 2.6, seed: seed + 4, alpha: 0.7 });
	sketch(ctx, b, { w: 3.6, seed });
	ctx.restore();
}

function drawScroll(ctx, x, y, s, seed = 0, rot = 0) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(rot);
	ctx.scale(s, s);
	const b = Shp.path("M-40,-22 L40,-22 L40,22 L-40,22 Z")[0];
	wash(ctx, b, "#f3dcae", { seed, off: [2, 2] });
	for (const sx of [-44, 44]) {
		const r = Shp.rrect(sx - 7, -28, 14, 56, 7, { os: 0 });
		wash(ctx, r, "#dcb577", { seed: seed + sx, off: [1, 1] });
		stroke(ctx, r, { w: 3, seed: seed + sx });
	}
	for (let k = 0; k < 3; k++)
		stroke(ctx, Shp.line(-28, -10 + k * 10, 20 - k * 8, -10 + k * 10), { w: 2, seed: seed + k, alpha: 0.6 });
	sketch(ctx, b, { w: 3.4, seed });
	ctx.restore();
}

function drawBoardBox(ctx, x, y, s, color, seed = 0, rot = 0) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(rot);
	ctx.scale(s, s);
	const b = Shp.rrect(-60, -34, 120, 68, 6, { os: 0 });
	wash(ctx, b, color, { seed, off: [2, 2] });
	// side (3d lid)
	const side = Shp.path("M-60,34 L-60,46 L60,46 L60,34")[0];
	stroke(ctx, side, { w: 3.4, seed: seed + 1 });
	solid(
		ctx,
		[
			[-60, 34],
			[-60, 46],
			[60, 46],
			[60, 34],
		],
		shade(color, -0.3),
		0.8,
	);
	for (let i = 0; i < 4; i++)
		for (let j = 0; j < 2; j++)
			if ((i + j) % 2 === 0)
				solid(ctx, Shp.rrect(-44 + i * 14, -22 + j * 14, 14, 14, 1, { os: 0 }), shade(color, -0.35), 0.75);
	drawMeeple(ctx, 30, -4, 0.45, COL.yellow, seed + 4);
	sketch(ctx, b, { w: 3.8, seed });
	ctx.restore();
}

function drawD6(ctx, x, y, s, color = COL.white, seed = 0, rot = 0, pips = 5) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(rot);
	ctx.scale(s, s);
	const b = Shp.rrect(-22, -22, 44, 44, 8, { os: 0 });
	wash(ctx, b, color, { seed, off: [1, 1] });
	sketch(ctx, b, { w: 3.2, seed });
	const P = {
		1: [[0, 0]],
		3: [
			[-10, -10],
			[0, 0],
			[10, 10],
		],
		5: [
			[-10, -10],
			[10, -10],
			[0, 0],
			[-10, 10],
			[10, 10],
		],
		6: [
			[-10, -11],
			[10, -11],
			[-10, 0],
			[10, 0],
			[-10, 11],
			[10, 11],
		],
	}[pips] || [[0, 0]];
	ctx.fillStyle = INK;
	for (const q of P) {
		ctx.beginPath();
		ctx.arc(q[0], q[1], 4, 0, TAU);
		ctx.fill();
	}
	ctx.restore();
}

function drawCoin(ctx, x, y, r, seed = 0, spin = 0) {
	const sx = Math.max(0.15, Math.abs(Math.cos(spin)));
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(sx, 1);
	solid(ctx, Shp.ellipseFill(0, 0, r, r, 22), COL.gold);
	solid(ctx, Shp.ellipseFill(-r * 0.2, -r * 0.2, r * 0.55, r * 0.55, 16), "#ffe08a", 0.8);
	stroke(ctx, Shp.ellipse(0, 0, r, r, { os: 0.06 }), { w: Math.max(2, r * 0.16), seed });
	stroke(ctx, Shp.ellipse(0, 0, r * 0.62, r * 0.62, { os: 0.02 }), { w: Math.max(1.4, r * 0.08), seed: seed + 1, alpha: 0.7 });
	ctx.restore();
}

/** Stylised hourglass / skull / clock / people icons for UI chips. */
function drawIcon(ctx, kind, x, y, s, color = COL.chalk, seed = 0, p = 1) {
	if (p <= 0) return;
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(s, s);
	const o = { w: 3.2, color, seed, p };
	switch (kind) {
		case "hourglass":
			strokes(
				ctx,
				[
					Shp.line(-12, -16, 12, -16),
					Shp.path("M-10,-16 C-10,-4 10,4 10,16")[0],
					Shp.path("M10,-16 C10,-4 -10,4 -10,16")[0],
					Shp.line(-12, 16, 12, 16),
				],
				o,
			);
			solid(
				ctx,
				[
					[-7, 14],
					[7, 14],
					[0, 6],
				],
				COL.yellow,
				p,
			);
			break;
		case "skull":
			strokes(
				ctx,
				[
					Shp.path("M-14,2 C-18,-18 18,-18 14,2 C14,8 8,8 8,14 L-8,14 C-8,8 -14,8 -14,2 Z")[0],
					Shp.ellipse(-6, -2, 4, 4),
					Shp.ellipse(6, -2, 4, 4),
				],
				o,
			);
			break;
		case "star":
			drawStar(ctx, 0, 0, 16, COL.yellow, seed, p);
			break;
		case "heart":
			drawHeart(ctx, 0, 0, 1, COL.coral, seed);
			break;
		case "clock":
			strokes(ctx, [Shp.ellipse(0, 0, 16, 16), Shp.poly([[0, -9], [0, 0], [7, 5]])], o);
			break;
		case "people":
			strokes(
				ctx,
				[
					Shp.ellipse(-7, -8, 6, 6),
					Shp.path("M-17,14 C-17,0 3,0 3,14")[0],
					Shp.ellipse(9, -6, 5, 5),
					Shp.path("M1,4 C4,0 16,0 17,14")[0],
				],
				o,
			);
			break;
		case "calendar":
			strokes(
				ctx,
				[Shp.rrect(-15, -12, 30, 28, 4, { os: 0 }), Shp.line(-15, -3, 15, -3), Shp.line(-7, -17, -7, -8), Shp.line(7, -17, 7, -8)],
				o,
			);
			break;
		case "list":
			strokes(ctx, [Shp.line(-8, -10, 14, -10), Shp.line(-8, 0, 14, 0), Shp.line(-8, 10, 14, 10)], o);
			for (const yy of [-10, 0, 10]) {
				ctx.fillStyle = color;
				ctx.beginPath();
				ctx.arc(-15, yy, 2.6, 0, TAU);
				ctx.fill();
			}
			break;
		case "home":
			strokes(ctx, [Shp.poly([[-15, 0], [0, -14], [15, 0]]), Shp.poly([[-10, -4], [-10, 14], [10, 14], [10, -4]])], o);
			break;
		case "dice":
			strokes(ctx, [Shp.rrect(-13, -13, 26, 26, 5, { os: 0 })], o);
			for (const q of [
				[-5, -5],
				[5, 5],
				[0, 0],
			]) {
				ctx.fillStyle = color;
				ctx.beginPath();
				ctx.arc(q[0], q[1], 2.6, 0, TAU);
				ctx.fill();
			}
			break;
		case "check":
			stroke(ctx, Shp.poly([[-10, 0], [-3, 8], [12, -10]]), { ...o, w: 4.4 });
			break;
		case "lock":
			strokes(ctx, [Shp.rrect(-13, -4, 26, 20, 4, { os: 0 }), Shp.path("M-8,-4 L-8,-10 C-8,-20 8,-20 8,-10 L8,-4")[0]], o);
			break;
		case "chart":
			strokes(ctx, [Shp.poly([[-15, -14], [-15, 14], [15, 14]]), Shp.poly([[-10, 8], [-2, 0], [4, 4], [13, -9]])], o);
			break;
	}
	ctx.restore();
}

// ---------------------------------------------------------------- logo
const CHEV1 = [
	[14, 16],
	[26, 29],
	[14, 42],
];
const CHEV2 = [
	[28, 16],
	[40, 29],
	[28, 42],
];

/** NextQuest mark (the favicon's double chevron) on a dark tile. size = tile width. */
function drawLogoMark(ctx, x, y, size, p = 1, o = {}) {
	if (p <= 0) return;
	const k = size / 58;
	ctx.save();
	ctx.translate(x - size / 2, y - size / 2);
	const tp = prog(p, 0, 0.35, Ease.outBack);
	ctx.translate(size / 2, size / 2);
	ctx.scale(tp, tp);
	ctx.rotate((1 - tp) * -0.3);
	ctx.translate(-size / 2, -size / 2);
	const tile = Shp.rrect(0, 0, size, size, 13 * k, { os: 0 });
	const ow = Math.min(3 * k, 5);
	wash(ctx, tile, o.tile ?? "#161a22", { seed: 5, off: [ow, ow], hl: 0.12, wob: Math.min(2.5 * k, 4) });
	sketch(ctx, Shp.rrect(0, 0, size, size, 13 * k), { w: 3.4 * Math.max(1, k * 0.6), seed: 5, wob: Math.min(1.4 * k, 3) });
	const sc = (pts) => pts.map((q) => [q[0] * k, q[1] * k]);
	stroke(ctx, sc(CHEV1), { w: 6.4 * k, color: COL.chalk, p: prog(p, 0.3, 0.35, Ease.outCubic), seed: 7, wob: 0.9 * k, lo: 0.7 });
	stroke(ctx, sc(CHEV2), { w: 6.4 * k, color: COL.cyan, p: prog(p, 0.55, 0.35, Ease.outCubic), seed: 9, wob: 0.9 * k, lo: 0.7 });
	ctx.restore();
}

function drawWordmark(ctx, x, y, size, p = 1, o = {}) {
	if (p <= 0) return;
	const wNext = measureText(ctx, "Next", size, 800);
	const wQuest = measureText(ctx, "Quest", size, 800);
	const total = wNext + wQuest;
	const x0 = o.align === "left" ? x : x - total / 2;
	htext(ctx, "Next", x0, y, {
		size,
		weight: 800,
		color: o.color1 ?? INK,
		p: clamp(p / 0.6),
		mode: o.mode ?? "pop",
		seed: 3,
	});
	htext(ctx, "Quest", x0 + wNext, y, {
		size,
		weight: 800,
		color: o.color2 ?? COL.cyanDeep,
		p: clamp((p - 0.35) / 0.65),
		mode: o.mode ?? "pop",
		seed: 8,
	});
	return total;
}

// ---------------------------------------------------------------- desktop monitor + app shell
const WIN = { x: 2440, y: -420, w: 1520, h: 860, side: 270, bar: 54 };
const NAV = [
	{ id: "dash", label: "Dashboard", icon: "home" },
	{ id: "backlog", label: "Backlog", icon: "list" },
	{ id: "pick", label: "What's next?", icon: "dice" },
	{ id: "events", label: "Events", icon: "calendar" },
];

function drawMonitor(ctx, p, active, activeT, title, hideLogo = false) {
	const { x, y, w, h, side, bar } = WIN;
	const pad = 26;
	const outer = Shp.rrect(x - pad, y - pad, w + pad * 2, h + pad * 2, 34, { os: 0 });
	const drawP = prog(p, 0, 0.55, Ease.inOutCubic);
	const fillA = prog(p, 0.25, 0.4, Ease.outCubic);
	// stand + desk
	const neck = Shp.path(`M${x + w / 2 - 70},${y + h + pad} L${x + w / 2 - 95},${y + h + pad + 90} L${x + w / 2 + 95},${y + h + pad + 90} L${x + w / 2 + 70},${y + h + pad} Z`)[0];
	wash(ctx, neck, "#4a5262", { alpha: fillA, seed: 61 });
	stroke(ctx, neck, { w: 4.4, p: drawP, seed: 61 });
	const base = Shp.rrect(x + w / 2 - 220, y + h + pad + 84, 440, 30, 14, { os: 0 });
	wash(ctx, base, "#3b4250", { alpha: fillA, seed: 62 });
	stroke(ctx, base, { w: 4.4, p: drawP, seed: 62 });
	// soft drop shadow
	ctx.save();
	ctx.globalAlpha = 0.16 * fillA;
	solid(ctx, Shp.rrect(x - pad + 22, y - pad + 26, w + pad * 2, h + pad * 2, 34, { os: 0 }), "#3a2c20");
	ctx.restore();
	// bezel
	wash(ctx, outer, "#2b303b", { alpha: fillA, seed: 63, hl: 0.1 });
	// screen
	const screen = Shp.rrect(x, y, w, h, 14, { os: 0 });
	ctx.save();
	ctx.globalAlpha = fillA;
	solid(ctx, screen, COL.slate);
	// subtle screen glow gradient
	const gg = ctx.createRadialGradient(x + w * 0.6, y + h * 0.3, 50, x + w * 0.6, y + h * 0.3, w * 0.8);
	gg.addColorStop(0, "rgba(52,209,230,0.07)");
	gg.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = gg;
	ctx.fillRect(x, y, w, h);
	ctx.restore();
	sketch(ctx, outer, { w: 5.2, p: drawP, seed: 63 });
	stroke(ctx, screen, { w: 3.2, p: drawP, seed: 64, color: "#0b0d11" });
	if (fillA <= 0) return;
	const ui = prog(p, 0.45, 0.45, Ease.outCubic);
	ctx.save();
	ctx.globalAlpha *= ui;
	// title bar
	stroke(ctx, Shp.line(x + 6, y + bar, x + w - 6, y + bar), { w: 2.2, color: COL.slate3, seed: 65 });
	[COL.coral, COL.yellow, COL.green].forEach((c, i) => {
		solid(ctx, Shp.ellipseFill(x + 32 + i * 30, y + bar / 2, 9, 9, 16), c);
	});
	htext(ctx, title ?? "NextQuest", x + w / 2, y + bar / 2 + 9, {
		size: 24,
		weight: 600,
		color: COL.chalkDim,
		align: "center",
		mode: "none",
		jitter: 0.3,
	});
	// sidebar
	solid(ctx, Shp.rrect(x + 2, y + bar + 2, side, h - bar - 4, 10, { os: 0 }), "#181c23");
	stroke(ctx, Shp.line(x + side, y + bar + 8, x + side, y + h - 10), { w: 2.2, color: COL.slate3, seed: 66 });
	if (!hideLogo) drawLogoMark(ctx, x + 48, y + bar + 56, 46, 1);
	drawWordmark(ctx, x + 84, y + bar + 67, 30, 1, { align: "left", mode: "none", color1: COL.chalk, color2: COL.cyan });
	NAV.forEach((n, i) => {
		const ny = y + bar + 160 + i * 74;
		const isActive = n.id === active;
		if (isActive) {
			const ap = prog(G.t, activeT ?? -10, 0.35, Ease.outBack);
			ctx.save();
			ctx.globalAlpha *= 0.18 + 0.1 * ap;
			solid(ctx, Shp.rrect(x + 18, ny - 30, side - 36, 58, 14, { os: 0 }), COL.cyan);
			ctx.restore();
			stroke(ctx, Shp.line(x + 20, ny - 20, x + 20, ny + 18), { w: 5, color: COL.cyan, seed: 67 + i, p: ap });
		}
		drawIcon(ctx, n.icon, x + 52, ny, 0.9, isActive ? COL.cyan : COL.chalkDim, 70 + i);
		htext(ctx, n.label, x + 82, ny + 10, {
			size: 27,
			weight: isActive ? 700 : 500,
			color: isActive ? COL.chalk : COL.chalkDim,
			mode: "none",
			jitter: 0.3,
			seed: i * 5,
		});
	});
	// member avatars at sidebar bottom
	BUDDIES.forEach((b, i) => {
		const ax = x + 50 + i * 46;
		const ay = y + h - 50;
		solid(ctx, Shp.ellipseFill(ax, ay, 18, 18, 18), b.color);
		stroke(ctx, Shp.ellipse(ax, ay, 18, 18), { w: 2.6, color: "#0b0d11", seed: 80 + i });
		ctx.fillStyle = INK;
		ctx.beginPath();
		ctx.arc(ax - 6, ay - 2, 2.6, 0, TAU);
		ctx.arc(ax + 6, ay - 2, 2.6, 0, TAU);
		ctx.fill();
	});
	ctx.restore();
}

/** A rounded UI card in the dark app theme. */
function uiCard(ctx, x, y, w, h, o = {}) {
	const pts = Shp.rrect(x, y, w, h, o.r ?? 16, { os: 0 });
	ctx.save();
	ctx.globalAlpha *= o.alpha ?? 1;
	solid(ctx, pts, o.fill ?? COL.slate2);
	stroke(ctx, Shp.rrect(x, y, w, h, o.r ?? 16), {
		w: o.w ?? 2.6,
		color: o.stroke ?? COL.slate3,
		seed: o.seed ?? x * 0.01,
		p: o.p ?? 1,
		wob: 1.1,
	});
	ctx.restore();
}

/** Watercolor cover art for the fictional games. */
function drawCoverArt(ctx, kind, x, y, w, h, seed = 0) {
	ctx.save();
	ctx.beginPath();
	ctx.rect(x, y, w, h);
	ctx.clip();
	if (kind === "dragon") {
		const g = ctx.createLinearGradient(x, y, x, y + h);
		g.addColorStop(0, "#ffb38a");
		g.addColorStop(0.55, "#ff7d6b");
		g.addColorStop(1, "#6d4bb8");
		ctx.fillStyle = g;
		ctx.fillRect(x, y, w, h);
		solid(ctx, Shp.ellipseFill(x + w * 0.7, y + h * 0.3, w * 0.13, w * 0.13, 20), "#ffe7a0", 0.95);
		const mtn = [
			[x - 10, y + h],
			[x + w * 0.1, y + h * 0.62],
			[x + w * 0.28, y + h * 0.7],
			[x + w * 0.5, y + h * 0.28],
			[x + w * 0.66, y + h * 0.58],
			[x + w * 0.82, y + h * 0.48],
			[x + w + 10, y + h * 0.72],
			[x + w + 10, y + h],
		];
		wash(ctx, mtn, "#3b2a6b", { seed, off: [0, 0], hl: 0.25 });
		const snow = [
			[x + w * 0.42, y + h * 0.4],
			[x + w * 0.5, y + h * 0.28],
			[x + w * 0.58, y + h * 0.42],
			[x + w * 0.52, y + h * 0.38],
			[x + w * 0.48, y + h * 0.42],
		];
		solid(ctx, snow, "#f3eaff", 0.9);
		// dragon silhouette gliding past the sun
		const dx = x + w * 0.46;
		const dy = y + h * 0.22;
		const k = w / 300;
		const drag = Shp.path(
			"M-60,6 C-40,4 -20,0 -6,-2 C4,-4 12,-8 18,-14 L26,-18 L24,-12 C30,-12 34,-10 36,-6 C28,-6 24,-4 20,0 C14,6 4,10 -8,10 C-24,10 -44,12 -60,6 Z",
		)[0].map((q) => [dx + q[0] * k * 1.3, dy + q[1] * k * 1.3]);
		const wing = Shp.path("M-18,0 C-26,-24 -44,-46 -66,-54 C-54,-40 -50,-30 -52,-22 C-44,-26 -36,-22 -34,-16 C-28,-20 -22,-14 -18,0 Z")[0].map((q) => [
			dx + q[0] * k * 1.3 + 18 * k,
			dy + q[1] * k * 1.3,
		]);
		const wing2 = Shp.path("M-6,-2 C-4,-30 8,-54 28,-66 C22,-50 22,-40 24,-32 C28,-36 36,-34 38,-28 C32,-24 20,-12 -6,-2 Z")[0].map((q) => [
			dx + q[0] * k * 1.3,
			dy + q[1] * k * 1.3,
		]);
		solid(ctx, wing, "#3a2866", 0.9);
		solid(ctx, drag, "#2a1d4d", 0.97);
		solid(ctx, wing2, "#2a1d4d", 0.97);
	} else if (kind === "gloom") {
		const g = ctx.createLinearGradient(x, y, x, y + h);
		g.addColorStop(0, "#23324f");
		g.addColorStop(1, "#0f1a2b");
		ctx.fillStyle = g;
		ctx.fillRect(x, y, w, h);
		solid(ctx, Shp.ellipseFill(x + w * 0.25, y + h * 0.22, w * 0.1, w * 0.1, 20), "#e9f3ff", 0.9);
		// castle
		const cx = x + w * 0.55;
		const base = y + h * 0.82;
		const castle = [
			[cx - 70, base],
			[cx - 70, base - 90],
			[cx - 56, base - 90],
			[cx - 56, base - 76],
			[cx - 42, base - 76],
			[cx - 42, base - 150],
			[cx - 20, base - 175],
			[cx + 2, base - 150],
			[cx + 2, base - 100],
			[cx + 20, base - 100],
			[cx + 20, base - 88],
			[cx + 34, base - 88],
			[cx + 34, base - 100],
			[cx + 56, base - 100],
			[cx + 56, base],
		];
		solid(ctx, castle, "#0a0f1a", 0.95);
		for (const q of [
			[cx - 26, base - 130],
			[cx + 40, base - 70],
			[cx - 56, base - 50],
		])
			solid(ctx, Shp.rrect(q[0], q[1], 8, 12, 3, { os: 0 }), COL.yellow, 0.9);
		ctx.fillStyle = "rgba(139,124,255,0.35)";
		ctx.fillRect(x, base - 10, w, h);
	} else if (kind === "meeple") {
		const g = ctx.createLinearGradient(x, y, x + w, y + h);
		g.addColorStop(0, "#9ff0c9");
		g.addColorStop(1, "#3fcf8e");
		ctx.fillStyle = g;
		ctx.fillRect(x, y, w, h);
		for (let i = 0; i < 6; i++)
			for (let j = 0; j < 8; j++)
				if ((i + j) % 2 === 0) solid(ctx, Shp.rrect(x + i * 40 - 10, y + j * 40 - 10, 40, 40, 2, { os: 0 }), "#2fae76", 0.35);
		drawMeeple(ctx, x + w * 0.35, y + h * 0.55, 1.2, COL.coral, seed + 1, -0.15);
		drawMeeple(ctx, x + w * 0.65, y + h * 0.48, 1.0, COL.yellow, seed + 2, 0.2);
		drawMeeple(ctx, x + w * 0.5, y + h * 0.75, 0.8, COL.violet, seed + 3, 0.05);
	}
	ctx.restore();
	stroke(ctx, Shp.rrect(x, y, w, h, 8), { w: 2.4, color: "#0b0d11", seed });
}

// ---------------------------------------------------------------- cursor
function drawCursor(ctx, x, y, s = 1, click = 0) {
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(s * (1 - click * 0.15), s * (1 - click * 0.15));
	const c = Shp.path("M0,0 L0,40 L10,30 L18,48 L25,45 L17,28 L31,28 Z")[0];
	solid(ctx, c, COL.white);
	stroke(ctx, c, { w: 3.4, seed: 91, wob: 0.6 });
	ctx.restore();
	if (click > 0) {
		ctx.save();
		ctx.globalAlpha = click;
		for (let k = 0; k < 5; k++) {
			const a = -Math.PI * 0.9 + k * 0.4;
			const r0 = 18 + (1 - click) * 10;
			stroke(ctx, Shp.line(x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * (r0 + 14), y + Math.sin(a) * (r0 + 14)), {
				w: 3.4,
				color: COL.cyan,
				seed: k,
			});
		}
		ctx.restore();
	}
}
