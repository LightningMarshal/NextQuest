/*
 * Hand-drawn rendering engine for the NextQuest promo animation.
 *
 * Everything is drawn procedurally onto a 2D canvas: tapered ink strokes with
 * "line boil" (the wobble re-seeds a few times per second, like traditional
 * animation), watercolor-style washes, hatching, handwritten text and a paper
 * grain overlay. No external libraries.
 */
"use strict";

const W = 1920;
const H = 1080;
const TAU = Math.PI * 2;
const BOIL_FPS = 8;

const INK = "#1f2433";
const PAPER = "#f6efe0";
const COL = {
	ink: INK,
	paper: PAPER,
	cyan: "#34d1e6",
	cyanDeep: "#0e9fb3",
	cyanWash: "#8fe3ee",
	violet: "#8b7cff",
	violetWash: "#b9b0ff",
	green: "#3fcf8e",
	greenWash: "#96e6bf",
	yellow: "#ffc94a",
	yellowWash: "#ffe08f",
	coral: "#ff7a66",
	coralWash: "#ffb3a6",
	pink: "#ff8fb1",
	slate: "#14171d",
	slate2: "#1f242c",
	slate3: "#2a313b",
	chalk: "#e7ebf1",
	chalkDim: "#8a93a3",
	gold: "#ffb830",
	wood: "#c9925a",
	woodDark: "#8a5a32",
	white: "#fffdf8",
};

// ---------------------------------------------------------------- math
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const invlerp = (a, b, x) => clamp((x - a) / (b - a));
const fract = (x) => x - Math.floor(x);

const Ease = {
	linear: (t) => t,
	inQuad: (t) => t * t,
	outQuad: (t) => 1 - (1 - t) * (1 - t),
	inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
	inCubic: (t) => t * t * t,
	outCubic: (t) => 1 - Math.pow(1 - t, 3),
	inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
	outQuart: (t) => 1 - Math.pow(1 - t, 4),
	inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
	outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
	inExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
	inOutExpo: (t) =>
		t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
	outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
	inBack: (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
	outElastic: (t) =>
		t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1,
	outBounce: (t) => {
		const n1 = 7.5625;
		const d1 = 2.75;
		if (t < 1 / d1) return n1 * t * t;
		if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
		if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
		return n1 * (t -= 2.625 / d1) * t + 0.984375;
	},
};

/** Eased 0..1 progress of `t` through the window [t0, t0 + dur]. */
function prog(t, t0, dur, ease = Ease.inOutCubic) {
	if (dur <= 0) return t >= t0 ? 1 : 0;
	return ease(clamp((t - t0) / dur));
}

/** 0→1→0 envelope: rises over [t0, t0+a], holds, falls over [t1-r, t1]. */
function env(t, t0, t1, a = 0.2, r = 0.2) {
	return Math.min(prog(t, t0, a, Ease.outCubic), 1 - prog(t, t1 - r, r, Ease.inCubic));
}

/** Damped spring impulse: 0 at t0, overshoots and settles (for squash & jiggle). */
function spring(t, t0, freq = 3, damp = 5) {
	if (t < t0) return 0;
	const x = t - t0;
	return Math.exp(-damp * x) * Math.sin(TAU * freq * x);
}

const h1 = (x) => fract(Math.sin(x * 127.1 + 311.7) * 43758.5453123);
/** Smooth 1D value noise in [-1, 1]. */
function vnoise(x) {
	const i = Math.floor(x);
	const f = x - i;
	const u = f * f * (3 - 2 * f);
	return lerp(h1(i), h1(i + 1), u) * 2 - 1;
}
function vnoise2(x, y) {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const fx = x - ix;
	const fy = y - iy;
	const ux = fx * fx * (3 - 2 * fx);
	const uy = fy * fy * (3 - 2 * fy);
	const a = h1(ix + iy * 57.0);
	const b = h1(ix + 1 + iy * 57.0);
	const c = h1(ix + (iy + 1) * 57.0);
	const d = h1(ix + 1 + (iy + 1) * 57.0);
	return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1;
}

function mulberry32(a) {
	return function () {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// ---------------------------------------------------------------- global frame state
const G = {
	t: 0,
	boil: 0, // integer boil frame
	boilK: 0, // cycling variant 0..2 used to seed wobble
};
function setFrameTime(t) {
	G.t = t;
	G.boil = Math.floor(t * BOIL_FPS);
	G.boilK = ((G.boil % 3) + 3) % 3;
}

// ---------------------------------------------------------------- colour helpers
function hexToRgb(hex) {
	const h = hex.replace("#", "");
	const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a = 1) {
	const [r, g, b] = hexToRgb(hex);
	return `rgba(${r},${g},${b},${a})`;
}
function shade(hex, k) {
	// k < 0 darkens, k > 0 lightens
	const [r, g, b] = hexToRgb(hex);
	const f = (c) => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
	return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// ---------------------------------------------------------------- geometry
function polyLength(pts) {
	let L = 0;
	for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
	return L;
}

/** Resample a polyline at roughly `step` spacing up to arc length `end`. Returns [x, y, s] triples. */
function resample(pts, step, end) {
	const out = [];
	if (pts.length < 2) return out;
	let s = 0;
	let next = 0;
	out.push([pts[0][0], pts[0][1], 0]);
	next = step;
	for (let i = 1; i < pts.length; i++) {
		const ax = pts[i - 1][0];
		const ay = pts[i - 1][1];
		const bx = pts[i][0];
		const by = pts[i][1];
		const seg = Math.hypot(bx - ax, by - ay);
		if (seg === 0) continue;
		while (next <= s + seg && next <= end) {
			const u = (next - s) / seg;
			out.push([ax + (bx - ax) * u, ay + (by - ay) * u, next]);
			next += step;
		}
		if (s + seg >= end) {
			const u = (end - s) / seg;
			const last = out[out.length - 1];
			if (!last || end - last[2] > 0.5) out.push([ax + (bx - ax) * u, ay + (by - ay) * u, end]);
			return out;
		}
		s += seg;
	}
	const last = out[out.length - 1];
	const lp = pts[pts.length - 1];
	if (last[2] < s - 0.5) out.push([lp[0], lp[1], s]);
	return out;
}

// ---------------------------------------------------------------- SVG path parsing
const pathCache = new Map();
/**
 * Parse an SVG path `d` string (M L H V C S Q T Z, absolute + relative) into an
 * array of polylines. Each polyline has a `.closed` flag.
 */
function parsePath(d) {
	if (pathCache.has(d)) return pathCache.get(d);
	const toks = d.match(/[MmLlHhVvCcSsQqTtZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
	const subs = [];
	let cur = null;
	let x = 0;
	let y = 0;
	let sx = 0;
	let sy = 0;
	let lcx = 0;
	let lcy = 0;
	let cmd = "";
	let prevCmd = "";
	let i = 0;
	const num = () => parseFloat(toks[i++]);
	const cubic = (x1, y1, x2, y2, x3, y3) => {
		const approx =
			Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
		const n = Math.max(4, Math.ceil(approx / 7));
		for (let k = 1; k <= n; k++) {
			const t = k / n;
			const mt = 1 - t;
			cur.push([
				mt * mt * mt * x + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3,
				mt * mt * mt * y + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3,
			]);
		}
		lcx = x2;
		lcy = y2;
		x = x3;
		y = y3;
	};
	const quad = (x1, y1, x2, y2) => {
		const approx = Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1);
		const n = Math.max(4, Math.ceil(approx / 7));
		for (let k = 1; k <= n; k++) {
			const t = k / n;
			const mt = 1 - t;
			cur.push([mt * mt * x + 2 * mt * t * x1 + t * t * x2, mt * mt * y + 2 * mt * t * y1 + t * t * y2]);
		}
		lcx = x1;
		lcy = y1;
		x = x2;
		y = y2;
	};
	while (i < toks.length) {
		if (/[a-zA-Z]/.test(toks[i])) {
			cmd = toks[i++];
		} else if (cmd === "M") cmd = "L";
		else if (cmd === "m") cmd = "l";
		const rel = cmd === cmd.toLowerCase();
		const C = cmd.toUpperCase();
		const ox = rel ? x : 0;
		const oy = rel ? y : 0;
		switch (C) {
			case "M":
				x = ox + num();
				y = oy + num();
				sx = x;
				sy = y;
				cur = [[x, y]];
				cur.closed = false;
				subs.push(cur);
				break;
			case "L":
				x = ox + num();
				y = oy + num();
				cur.push([x, y]);
				break;
			case "H":
				x = (rel ? x : 0) + num();
				cur.push([x, y]);
				break;
			case "V":
				y = (rel ? y : 0) + num();
				cur.push([x, y]);
				break;
			case "C": {
				const a = [ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num()];
				cubic(...a);
				break;
			}
			case "S": {
				const rx = /[CcSs]/.test(prevCmd) ? 2 * x - lcx : x;
				const ry = /[CcSs]/.test(prevCmd) ? 2 * y - lcy : y;
				const a = [ox + num(), oy + num(), ox + num(), oy + num()];
				cubic(rx, ry, ...a);
				break;
			}
			case "Q": {
				const a = [ox + num(), oy + num(), ox + num(), oy + num()];
				quad(...a);
				break;
			}
			case "T": {
				const rx = /[QqTt]/.test(prevCmd) ? 2 * x - lcx : x;
				const ry = /[QqTt]/.test(prevCmd) ? 2 * y - lcy : y;
				quad(rx, ry, ox + num(), oy + num());
				break;
			}
			case "Z":
				if (cur) {
					cur.push([sx, sy]);
					cur.closed = true;
				}
				x = sx;
				y = sy;
				break;
		}
		prevCmd = cmd;
	}
	pathCache.set(d, subs);
	return subs;
}

// ---------------------------------------------------------------- shape builders (return polylines)
const Shp = {
	/** Hand-drawn ellipse: starts at angle a0, overshoots past closure like a real pen. */
	ellipse(cx, cy, rx, ry, o = {}) {
		const os = o.os ?? 0.14;
		const a0 = o.a0 ?? -2.3;
		const n = o.n ?? Math.max(18, Math.ceil(((rx + ry) * Math.PI) / 8));
		const spiral = o.spiral ?? 0.035;
		const pts = [];
		const total = TAU * (1 + os);
		for (let k = 0; k <= n * (1 + os); k++) {
			const a = a0 + (k / (n * (1 + os))) * total;
			const u = k / (n * (1 + os));
			const r = 1 + spiral * (u - 0.5);
			pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
		}
		return pts;
	},
	/** Exact closed ellipse (for fills and clips). */
	ellipseFill(cx, cy, rx, ry, n = 40) {
		const pts = [];
		for (let k = 0; k <= n; k++) {
			const a = (k / n) * TAU;
			pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
		}
		return pts;
	},
	rrect(x, y, w, h, r = 12, o = {}) {
		r = Math.min(r, w / 2, h / 2);
		const pts = [];
		const arc = (cx, cy, a0) => {
			for (let k = 0; k <= 6; k++) {
				const a = a0 + (k / 6) * (Math.PI / 2);
				pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
			}
		};
		pts.push([x + r, y]);
		arc(x + w - r, y + r, -Math.PI / 2);
		arc(x + w - r, y + h - r, 0);
		arc(x + r, y + h - r, Math.PI / 2);
		arc(x + r, y + r, Math.PI);
		pts.push([x + r, y]);
		if (o.os !== 0) pts.push([x + r + Math.min(w * 0.12, 30), y + (o.osy ?? 1.5)]);
		return pts;
	},
	line(x1, y1, x2, y2) {
		return [
			[x1, y1],
			[x2, y2],
		];
	},
	poly(arr, close = false) {
		const pts = arr.map((p) => [p[0], p[1]]);
		if (close) pts.push([arr[0][0], arr[0][1]]);
		return pts;
	},
	/** Regular polygon (for dice etc). */
	ngon(cx, cy, r, n, rot = -Math.PI / 2) {
		const pts = [];
		for (let k = 0; k <= n; k++) {
			const a = rot + (k / n) * TAU;
			pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
		}
		return pts;
	},
	arc(cx, cy, r, a0, a1, n = 24) {
		const pts = [];
		for (let k = 0; k <= n; k++) {
			const a = a0 + (a1 - a0) * (k / n);
			pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
		}
		return pts;
	},
	path(d) {
		return parsePath(d);
	},
};

// ---------------------------------------------------------------- ink strokes
function taper(u, a = 0.1, b = 0.12, lo = 0.35) {
	const s = u < a ? lerp(lo, 1, Ease.outQuad(u / a)) : 1;
	const e = u > 1 - b ? lerp(lo, 1, Ease.outQuad((1 - u) / b)) : 1;
	return s * e;
}

/**
 * Tapered, wobbly ink stroke along a polyline.
 * o: { w, color, p (draw progress 0..1), seed, wob, alpha, step, taperA, taperB, lo, rough }
 */
function stroke(ctx, pts, o = {}) {
	const p = o.p ?? 1;
	if (p <= 0.001 || !pts || pts.length < 2) return;
	const w = o.w ?? 4;
	const seed = (o.seed ?? 0) * 1.618 + G.boilK * 7.31;
	const wob = o.wob ?? 1.4;
	const total = o.total ?? polyLength(pts);
	if (total < 0.5) return;
	const end = total * p;
	const step = o.step ?? Math.max(3, Math.min(8, total / 20));
	const rs = resample(pts, step, end);
	const n = rs.length;
	if (n < 2) return;
	const L = [];
	const R = [];
	const rough = o.rough ?? 0.12;
	const lo = o.lo ?? 0.35;
	const ta = o.taperA ?? Math.min(0.12, 40 / total);
	const tb = o.taperB ?? Math.min(0.14, 50 / total);
	let pnx = 0;
	let pny = 0;
	for (let k = 0; k < n; k++) {
		const a = rs[Math.max(0, k - 1)];
		const b = rs[Math.min(n - 1, k + 1)];
		let dx = b[0] - a[0];
		let dy = b[1] - a[1];
		const len = Math.hypot(dx, dy) || 1;
		let nx = -dy / len;
		let ny = dx / len;
		if (len < 1e-6) {
			nx = pnx;
			ny = pny;
		}
		pnx = nx;
		pny = ny;
		const s = rs[k][2];
		const d = wob * (vnoise(s / 90 + seed * 3.7) + 0.35 * vnoise(s / 23 + seed * 9.1));
		const x = rs[k][0] + nx * d;
		const y = rs[k][1] + ny * d;
		const u = s / total;
		const hw = (w / 2) * taper(u, ta, tb, lo) * (1 + rough * vnoise(s / 31 + seed * 5.3));
		L.push([x + nx * hw, y + ny * hw, hw, x, y]);
		R.push([x - nx * hw, y - ny * hw]);
	}
	ctx.save();
	if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
	ctx.fillStyle = o.color ?? INK;
	ctx.beginPath();
	ctx.moveTo(L[0][0], L[0][1]);
	for (let k = 1; k < n; k++) ctx.lineTo(L[k][0], L[k][1]);
	for (let k = n - 1; k >= 0; k--) ctx.lineTo(R[k][0], R[k][1]);
	ctx.closePath();
	ctx.fill();
	// round caps
	ctx.beginPath();
	ctx.arc(L[0][3], L[0][4], L[0][2], 0, TAU);
	ctx.arc(L[n - 1][3], L[n - 1][4], L[n - 1][2], 0, TAU);
	ctx.fill();
	ctx.restore();
}

/** Stroke several polylines as one continuous draw-on (progress spread across total length). */
function strokes(ctx, list, o = {}) {
	const p = o.p ?? 1;
	if (p <= 0) return;
	const lens = list.map(polyLength);
	const total = lens.reduce((a, b) => a + b, 0);
	let acc = 0;
	for (let i = 0; i < list.length; i++) {
		const start = acc / total;
		const span = lens[i] / total;
		acc += lens[i];
		const lp = clamp((p - start) / (span || 1));
		if (lp <= 0) break;
		stroke(ctx, list[i], { ...o, p: lp, seed: (o.seed ?? 0) + i * 3.3, total: lens[i] });
	}
}

/** Sketchy double stroke: main line plus a lighter, slightly offset second pass. */
function sketch(ctx, pts, o = {}) {
	stroke(ctx, pts, o);
	if (o.double !== false) {
		stroke(ctx, pts, {
			...o,
			w: (o.w ?? 4) * 0.45,
			alpha: (o.alpha ?? 1) * 0.35,
			seed: (o.seed ?? 0) + 41.7,
			wob: (o.wob ?? 1.4) * 2.2,
		});
	}
}

// ---------------------------------------------------------------- fills
function wobblePath(ctx, pts, amp, seed, step = 14) {
	const total = polyLength(pts);
	const rs = resample(pts, Math.max(4, Math.min(step, total / 12)), total);
	ctx.beginPath();
	for (let k = 0; k < rs.length; k++) {
		const s = rs[k][2];
		const dx = amp * vnoise(s / 60 + seed * 2.1);
		const dy = amp * vnoise(s / 60 + seed * 4.3 + 17);
		if (k === 0) ctx.moveTo(rs[k][0] + dx, rs[k][1] + dy);
		else ctx.lineTo(rs[k][0] + dx, rs[k][1] + dy);
	}
	ctx.closePath();
}

/**
 * Watercolor-ish wash: slightly misregistered fill with a darker pigment edge.
 * o: { alpha, seed, off:[dx,dy], wob, edge, grad (lighter highlight) }
 */
function wash(ctx, pts, color, o = {}) {
	if (!pts || pts.length < 3) return;
	const seed = (o.seed ?? 0) + G.boilK * 2.9;
	const off = o.off ?? [3, 2];
	ctx.save();
	ctx.globalAlpha *= o.alpha ?? 1;
	ctx.translate(off[0], off[1]);
	wobblePath(ctx, pts, o.wob ?? 2.2, seed);
	if (o.grad !== false) {
		// soft top-left highlight to fake pigment pooling
		let minx = Infinity;
		let miny = Infinity;
		let maxx = -Infinity;
		let maxy = -Infinity;
		for (const p of pts) {
			if (p[0] < minx) minx = p[0];
			if (p[1] < miny) miny = p[1];
			if (p[0] > maxx) maxx = p[0];
			if (p[1] > maxy) maxy = p[1];
		}
		const g = ctx.createLinearGradient(minx, miny, maxx, maxy);
		g.addColorStop(0, shade(color, o.hl ?? 0.22));
		g.addColorStop(0.55, color);
		g.addColorStop(1, shade(color, -(o.lo ?? 0.08)));
		ctx.fillStyle = g;
	} else ctx.fillStyle = color;
	ctx.fill();
	if (o.edge !== false) {
		ctx.lineWidth = o.edgeW ?? 2.5;
		ctx.strokeStyle = shade(color, -0.28);
		ctx.globalAlpha *= 0.45;
		ctx.lineJoin = "round";
		ctx.stroke();
	}
	ctx.restore();
}

/** Plain solid fill following a polyline (no wobble) — for UI panels. */
function solid(ctx, pts, color, alpha = 1) {
	ctx.save();
	ctx.globalAlpha *= alpha;
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(pts[0][0], pts[0][1]);
	for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
	ctx.closePath();
	ctx.fill();
	ctx.restore();
}

/** Pen hatching clipped to a shape. */
function hatch(ctx, pts, o = {}) {
	const gap = o.gap ?? 11;
	const ang = o.angle ?? -0.8;
	let minx = Infinity;
	let miny = Infinity;
	let maxx = -Infinity;
	let maxy = -Infinity;
	for (const p of pts) {
		minx = Math.min(minx, p[0]);
		miny = Math.min(miny, p[1]);
		maxx = Math.max(maxx, p[0]);
		maxy = Math.max(maxy, p[1]);
	}
	ctx.save();
	ctx.beginPath();
	ctx.moveTo(pts[0][0], pts[0][1]);
	for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
	ctx.closePath();
	ctx.clip();
	const cx = (minx + maxx) / 2;
	const cy = (miny + maxy) / 2;
	const R = Math.hypot(maxx - minx, maxy - miny) / 2 + 10;
	const ca = Math.cos(ang);
	const sa = Math.sin(ang);
	let i = 0;
	for (let d = -R; d <= R; d += gap, i++) {
		const x1 = cx + ca * -R - sa * d;
		const y1 = cy + sa * -R + ca * d;
		const x2 = cx + ca * R - sa * d;
		const y2 = cy + sa * R + ca * d;
		stroke(ctx, Shp.line(x1, y1, x2, y2), {
			w: o.w ?? 1.6,
			color: o.color ?? INK,
			alpha: o.alpha ?? 0.5,
			seed: (o.seed ?? 0) + i * 1.7,
			wob: 1.2,
			p: o.p ?? 1,
			lo: 0.6,
		});
	}
	ctx.restore();
}

// ---------------------------------------------------------------- text
const FONT_HAND = "'Shantell Sans', 'Comic Sans MS', cursive";
const FONT_SCRIPT = "'Caveat', 'Comic Sans MS', cursive";

/**
 * Handwritten text. Modes:
 *  - "pop": each glyph pops in with an overshoot, staggered by `stagger` of the p range
 *  - "write": left-to-right reveal (like being written)
 *  - "none": static
 * o: { size, weight, font, color, align, p, mode, seed, jitter, stroke, strokeW, spacing }
 */
function htext(ctx, str, x, y, o = {}) {
	const size = o.size ?? 48;
	const weight = o.weight ?? 700;
	const font = o.font ?? FONT_HAND;
	const p = o.p ?? 1;
	if (p <= 0) return 0;
	ctx.save();
	ctx.font = `${weight} ${size}px ${font}`;
	ctx.textBaseline = o.baseline ?? "alphabetic";
	const chars = [...str];
	const spacing = o.spacing ?? 0;
	const widths = chars.map((c) => ctx.measureText(c).width + spacing);
	const full = ctx.measureText(str).width + spacing * chars.length;
	// distribute kerning difference across glyphs
	const sumw = widths.reduce((a, b) => a + b, 0);
	const kf = full / sumw;
	const total = full;
	let x0 = x;
	const align = o.align ?? "left";
	if (align === "center") x0 = x - total / 2;
	else if (align === "right") x0 = x - total;
	const mode = o.mode ?? "pop";
	const jitter = o.jitter ?? 1;
	const seed = o.seed ?? 0;
	ctx.fillStyle = o.color ?? INK;
	if (mode === "write" && p < 1) {
		ctx.beginPath();
		ctx.rect(x0 - size, y - size * 1.4, (total + size * 0.2) * p + size, size * 2.2);
		ctx.clip();
	}
	let cx = x0;
	const n = chars.length;
	for (let i = 0; i < n; i++) {
		const c = chars[i];
		const cw = widths[i] * kf;
		let sc = 1;
		if (mode === "pop") {
			const st = o.stagger ?? 0.6;
			const t0 = (i / Math.max(1, n - 1)) * st;
			const lp = clamp((p - t0) / (1 - st));
			sc = lp <= 0 ? 0 : Ease.outBack(lp, 2.2);
		}
		if (sc > 0.001 && c !== " ") {
			const bj = G.boilK * 3.7 + seed + i * 1.31;
			const rot = jitter * 0.035 * vnoise(bj * 2.3);
			const dy = jitter * 1.6 * vnoise(bj * 1.7 + 5);
			ctx.save();
			ctx.translate(cx + cw / 2, y + dy - size * 0.32);
			ctx.rotate(rot);
			ctx.scale(sc, sc);
			if (o.stroke) {
				ctx.lineJoin = "round";
				ctx.lineWidth = o.strokeW ?? size * 0.12;
				ctx.strokeStyle = o.stroke;
				ctx.strokeText(c, -cw / 2 + spacing / 2, size * 0.32);
			}
			ctx.fillText(c, -cw / 2 + spacing / 2, size * 0.32);
			ctx.restore();
		}
		cx += cw;
	}
	ctx.restore();
	return total;
}

function measureText(ctx, str, size, weight = 700, font = FONT_HAND) {
	ctx.save();
	ctx.font = `${weight} ${size}px ${font}`;
	const w = ctx.measureText(str).width;
	ctx.restore();
	return w;
}

// ---------------------------------------------------------------- paper
let paperGrain = null;
function buildPaper() {
	// A multiply overlay: near-white with mottled watercolor-paper blotches, grain and fibres.
	const c = document.createElement("canvas");
	c.width = W;
	c.height = H;
	const x = c.getContext("2d");
	const img = x.createImageData(W, H);
	const d = img.data;
	const rnd = mulberry32(1234);
	for (let py = 0; py < H; py++) {
		for (let px = 0; px < W; px++) {
			const i = (py * W + px) * 4;
			const m =
				0.55 * vnoise2(px / 180, py / 180) +
				0.3 * vnoise2(px / 60 + 11, py / 60 + 3) +
				0.15 * vnoise2(px / 17 + 40, py / 17 + 9);
			const grain = rnd() - 0.5;
			let v = 244 + m * 7 + grain * 12;
			// tooth: occasional darker specks
			if (rnd() < 0.0035) v -= 22 * rnd();
			v = Math.max(200, Math.min(255, v));
			d[i] = v;
			d[i + 1] = v - 1.5;
			d[i + 2] = v - 5;
			d[i + 3] = 255;
		}
	}
	x.putImageData(img, 0, 0);
	// faint fibres
	x.globalAlpha = 0.05;
	x.strokeStyle = "#6b5a40";
	x.lineWidth = 1;
	for (let k = 0; k < 260; k++) {
		const sx = rnd() * W;
		const sy = rnd() * H;
		const a = rnd() * TAU;
		const l = 8 + rnd() * 30;
		x.beginPath();
		x.moveTo(sx, sy);
		x.quadraticCurveTo(
			sx + Math.cos(a) * l * 0.5 + (rnd() - 0.5) * 8,
			sy + Math.sin(a) * l * 0.5 + (rnd() - 0.5) * 8,
			sx + Math.cos(a) * l,
			sy + Math.sin(a) * l,
		);
		x.stroke();
	}
	paperGrain = c;
}

function drawPaperBase(ctx) {
	ctx.fillStyle = PAPER;
	ctx.fillRect(0, 0, W, H);
}

function drawPaperOverlay(ctx) {
	ctx.save();
	ctx.globalCompositeOperation = "multiply";
	const jx = (G.boilK - 1) * 1.5;
	const jy = ((G.boil * 7) % 3) - 1;
	ctx.drawImage(paperGrain, jx - 3, jy - 3, W + 6, H + 6);
	// warm vignette
	const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
	g.addColorStop(0, "rgba(255,255,255,0)");
	g.addColorStop(1, "rgba(150,120,90,0.30)");
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, W, H);
	ctx.restore();
}
