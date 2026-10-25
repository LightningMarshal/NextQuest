/*
 * NextQuest — 15-second motion reel.
 *
 * Everything on screen is DOM + CSS 3D, positioned by render(t), a pure
 * function of time. No CSS transitions or animations, so realtime playback
 * and the frame-by-frame export are identical.
 *
 * Grid: 120 BPM (0.5 s per beat). Cuts and hits land on beats.
 */
"use strict";

const REEL_DUR = 15.0;
const RB = 0.5; // seconds per beat

// ------------------------------------------------------------------ math
const cl = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const mix = (a, b, t) => a + (b - a) * t;
const Ez = {
	lin: (t) => t,
	oc: (t) => 1 - Math.pow(1 - t, 3),
	ic: (t) => t * t * t,
	ioc: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
	oq: (t) => 1 - Math.pow(1 - t, 5),
	oe: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
	ie: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
	ioe: (t) => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
	ob: (t, s = 1.7) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
	ib: (t, s = 1.7) => (s + 1) * t * t * t - s * t * t,
};
const pr = (t, t0, d, e = Ez.ioc) => (d <= 0 ? (t >= t0 ? 1 : 0) : e(cl((t - t0) / d)));
const spr = (t, t0, f = 3, damp = 7) => (t < t0 ? 0 : Math.exp(-damp * (t - t0)) * Math.sin(2 * Math.PI * f * (t - t0)));
const decay = (t, t0, k = 8) => (t < t0 ? 0 : Math.exp(-k * (t - t0)));
const hsh = (n) => {
	const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
	return x - Math.floor(x);
};
const noise1 = (x) => {
	const i = Math.floor(x);
	const f = x - i;
	const u = f * f * (3 - 2 * f);
	return mix(hsh(i), hsh(i + 1), u) * 2 - 1;
};

// ------------------------------------------------------------------ timeline
const TL = {
	laser: 0.0,
	wall: 0.12,
	count: 0.45,
	words: [1.5, 2.0, 2.5, 3.0],
	hit: 3.5,
	zoom: 4.22,
	feats: [4.5, 6.5, 8.5, 10.5],
	kinds: [12.5, 12.75, 13.0, 13.25],
	fanIn: 12.38,
	collapse: 13.32,
	final: 13.5,
};
const WORDS = ["WHAT", "DO WE", "PLAY", "NEXT?"];
const KINDS = [
	["VIDEO GAMES", "#34d1e6"],
	["TTRPGS", "#8b7cff"],
	["BOARD GAMES", "#3fcf8e"],
	["ONE BACKLOG.", "#ffffff"],
];

// panel 1: typing
const P1_QUERY = "Dragon's Peak";
const P1_TYPE = (i) => 0.2 + i * 0.034;
// panel 2: vote allocations (local times)
const VOTE_ROWS = [
	{ id: "gloom", t: "Gloomkeep", k: "TTRPG", c: "#8b7cff", base: 0.62 },
	{ id: "dragon", t: "Dragon's Peak", k: "VIDEO", c: "#34d1e6", base: 0.48 },
	{ id: "meeple", t: "Meeple Mayhem", k: "BOARD GAME", c: "#3fcf8e", base: 0.36 },
	{ id: "star", t: "Starfall Salvage", k: "VIDEO", c: "#34d1e6", base: 0.2 },
];
const VOTE_STEPS = [0, 0, 1, 2, 0, 1, 3, 0, 1, 2].map((row, i) => ({ row, u: 0.32 + i * 0.105 }));
// panel 3: picker scores (cumulative after interest, time fit, party fit)
const PICK = [
	{ id: "dragon", t: "Dragon's Peak", k: "VIDEO", c: "#34d1e6", s: [0.4, 0.5, 0.54] },
	{ id: "gloom", t: "Gloomkeep", k: "TTRPG", c: "#8b7cff", s: [0.34, 0.56, 0.84] },
	{ id: "star", t: "Starfall Salvage", k: "VIDEO", c: "#34d1e6", s: [0.3, 0.4, 0.47] },
	{ id: "meeple", t: "Meeple Mayhem", k: "BOARD GAME", c: "#3fcf8e", s: [0.26, 0.52, 0.72] },
];
const PICK_STAGE = [0.25, 0.55, 0.85]; // when each factor starts filling (local)
const PICK_WIN = 1.32;
// panel 4: availability heat (Mon..Fri x 5pm..9pm), 0..4 people free
const HEAT = [
	[0, 1, 1, 0, 1],
	[1, 2, 1, 2, 3],
	[1, 3, 2, 3, 4],
	[0, 2, 3, 2, 3],
	[0, 1, 1, 1, 2],
];

// ------------------------------------------------------------------ art
const ICONS = {
	ctrl: '<path d="M-50,-20 C-40,-38 40,-38 50,-20 C62,0 68,34 48,38 C34,41 28,20 16,16 L-16,16 C-28,20 -34,41 -48,38 C-68,34 -62,0 -50,-20 Z"/>',
	d20: '<path d="M0,-44 L38,-22 L38,22 L0,44 L-38,22 L-38,-22 Z M0,-26 L22,14 L-22,14 Z"/>',
	meeple: '<path d="M0,-38 C12,-38 16,-28 13,-19 C26,-17 40,-11 40,-2 C40,6 30,6 22,4 L32,34 L8,34 L0,20 L-8,34 L-32,34 L-22,4 C-30,6 -40,6 -40,-2 C-40,-11 -26,-17 -13,-19 C-16,-28 -12,-38 0,-38 Z"/>',
	star: '<path d="M0,-40 L11,-12 L40,-12 L17,6 L25,36 L0,18 L-25,36 L-17,6 L-40,-12 L-11,-12 Z"/>',
	sword: '<path d="M-4,-44 L4,-44 L5,16 L18,16 L18,22 L5,22 L5,40 L-5,40 L-5,22 L-18,22 L-18,16 L-5,16 Z"/>',
	planet: '<circle r="22"/><ellipse rx="44" ry="10" fill="none" stroke-width="5" transform="rotate(-20)"/>',
};
const SVGI = (k, fill, size = 120, extra = "") =>
	`<svg viewBox="-50 -50 100 100" width="${size}" height="${size}" style="${extra}" fill="${fill}" stroke="${fill}">${ICONS[k]}</svg>`;

const PALETTES = [
	["#ff8a5c", "#6d3bd1"],
	["#2fd6c3", "#1c3d8f"],
	["#ffcf5a", "#e8456b"],
	["#8b7cff", "#0e1a40"],
	["#3fcf8e", "#0c4b55"],
	["#ff6b9a", "#3a1d6e"],
	["#5aa8ff", "#121c3a"],
	["#f2994a", "#4b1e1e"],
	["#a3e635", "#14532d"],
	["#38bdf8", "#312e81"],
];
const WALL_TITLES = [
	"Dragon's Peak", "Gloomkeep", "Meeple Mayhem", "Starfall Salvage", "Hollow Crown", "Neon Drift", "Tidebound", "Ashen Vale",
	"Cosmic Caravan", "Lantern Keep", "Pixel Rogue", "Frostline", "Wyrm Hunt", "Moonrise Market", "Clockwork Isles", "Sky Sail",
	"Deep Delve", "Ember & Oak", "Verdant", "Night Shift", "Quarry Kings", "Spellbound Inn", "Rustbelt Racers", "Sunken Choir",
];

function coverArt(kind, seed = 0) {
	switch (kind) {
		case "dragon":
			return `<div class="art" style="background:linear-gradient(180deg,#ffb38a,#ff7d6b 50%,#6d4bb8)"></div>
<div class="art" style="background:radial-gradient(circle at 70% 28%,#ffe9a8 0 11%,transparent 12%)"></div>
<div class="art" style="background:#2b1f5c;clip-path:polygon(0 100%,0 66%,14% 58%,30% 68%,52% 30%,68% 56%,82% 46%,100% 66%,100% 100%)"></div>
<div class="art" style="background:#efe6ff;clip-path:polygon(45% 41%,52% 30%,59% 41%,55% 39%,52% 42%,49% 39%)"></div>
<div class="art" style="background:#1d1440;clip-path:polygon(22% 26%,30% 22%,38% 14%,36% 22%,46% 20%,38% 27%,28% 30%)"></div>`;
		case "gloom":
			return `<div class="art" style="background:linear-gradient(180deg,#2a3b63,#0f1a2b)"></div>
<div class="art" style="background:radial-gradient(circle at 26% 24%,#eef4ff 0 9%,rgba(238,244,255,.15) 10% 16%,transparent 17%)"></div>
<div class="art" style="background:#070b14;clip-path:polygon(18% 100%,18% 62%,26% 62%,26% 68%,34% 68%,34% 40%,44% 26%,54% 40%,54% 58%,62% 58%,62% 64%,70% 64%,70% 56%,80% 56%,80% 100%)"></div>
<div class="art" style="background:radial-gradient(circle at 42% 48%,#ffc94a 0 1.6%,transparent 2%),radial-gradient(circle at 66% 70%,#ffc94a 0 1.6%,transparent 2%)"></div>
<div class="art" style="background:linear-gradient(0deg,rgba(139,124,255,.45),transparent 30%)"></div>`;
		case "meeple":
			return `<div class="art" style="background:repeating-conic-gradient(#2fae76 0 25%,#46d494 0 50%) 0 0/25% 20%"></div>
<div class="art" style="display:grid;place-items:center">${SVGI("meeple", "#ff6b6b", 150, "filter:drop-shadow(0 8px 10px rgba(0,0,0,.35))")}</div>`;
		case "star":
			return `<div class="art" style="background:radial-gradient(circle at 30% 20%,#3b2a7a,#0a0a1f 70%)"></div>
<div class="art" style="background-image:radial-gradient(#fff 1px,transparent 1.5px);background-size:23px 29px;opacity:.6"></div>
<div class="art" style="display:grid;place-items:center">${SVGI("planet", "#ffb86b", 150)}</div>`;
		default: {
			const p = PALETTES[seed % PALETTES.length];
			const icon = ["ctrl", "d20", "meeple", "star", "sword", "planet"][Math.floor(hsh(seed * 3.1) * 6)];
			const ang = Math.floor(hsh(seed * 1.7) * 360);
			return `<div class="art" style="background:linear-gradient(${ang}deg,${p[0]},${p[1]})"></div>
<div class="art" style="background:radial-gradient(circle at ${20 + hsh(seed) * 60}% ${15 + hsh(seed + 4) * 40}%,rgba(255,255,255,.35),transparent 45%)"></div>
<div class="art" style="display:grid;place-items:center;opacity:.55">${SVGI(icon, "rgba(0,0,0,.45)", 120)}</div>`;
		}
	}
}
const KIND_OF = (title) =>
	title === "Gloomkeep" ? "TTRPG" : title === "Meeple Mayhem" ? "BOARD GAME" : title === "Dragon's Peak" || title === "Starfall Salvage" ? "VIDEO" : null;
const ART_OF = (title) => ({ "Dragon's Peak": "dragon", Gloomkeep: "gloom", "Meeple Mayhem": "meeple", "Starfall Salvage": "star" })[title];

const SVG_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="#8a93a3" stroke-width="2.4" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>';
const SVG_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
const CHEV_SVG = (sw = 6) =>
	`<svg viewBox="0 0 58 58"><polyline class="c1" points="14,16 26,29 14,42" fill="none" stroke="#e7ebf1" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="36" stroke-dashoffset="0"/><polyline class="c2" points="28,16 40,29 28,42" fill="none" stroke="#34d1e6" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="36" stroke-dashoffset="0"/></svg>`;

// ------------------------------------------------------------------ DOM
const R = {}; // element registry
function h(html) {
	const d = document.createElement("div");
	d.innerHTML = html.trim();
	return d.firstElementChild;
}
function add(parent, html, id) {
	const el = h(html);
	parent.appendChild(el);
	if (id) R[id] = el;
	return el;
}
function letters(text, cls) {
	return [...text].map((c) => `<span class="mask"><span class="${cls}">${c === " " ? "&nbsp;" : c}</span></span>`).join("");
}

function buildReel() {
	const world = document.getElementById("world");
	R.world = world;

	// --- act 1
	const wallWrap = add(world, '<div id="wallWrap" class="abs"></div>', "wallWrap");
	const wall = add(wallWrap, '<div id="wall" class="abs"></div>', "wall");
	for (let r = 0; r < 13; r++)
		for (let c = 0; c < 12; c++) {
			const i = r * 12 + c;
			const title = WALL_TITLES[(i * 7 + r) % WALL_TITLES.length];
			const art = ART_OF(title);
			const kind = KIND_OF(title) ?? ["VIDEO", "TTRPG", "BOARD GAME"][Math.floor(hsh(i * 5.3) * 3)];
			wall.insertAdjacentHTML("beforeend", `<div class="tile">${coverArt(art, i)}<div class="t">${title}</div><div class="k">${kind}</div></div>`);
		}
	add(world, '<div id="laser" class="abs"></div>', "laser");
	const count = add(world, '<div id="count" class="abs"><div id="countNum">0</div><div id="countLbl"></div></div>', "count");
	R.countNum = count.querySelector("#countNum");
	R.countLbl = count.querySelector("#countLbl");
	const words = add(world, '<div id="words" class="abs"></div>', "words");
	R.kw = WORDS.map((w, i) => add(words, `<div class="kw${i === 3 ? " cy" : ""}">${w}</div>`));

	// --- logo (act 2) and lockup (act 4) share a builder
	R.ring = add(world, '<div id="ring" class="abs"><i></i><i></i></div>', "ring");
	R.logo = buildLogo(world, "logo", 540, 200, 150, "THE BACKLOG APP FOR YOUR GAMING GROUP");
	R.logo.sub.style.fontSize = "30px";
	R.logo.sub.style.top = "160px";
	R.logo.sub.style.color = "#aab3c2";

	// --- act 3
	const heads = add(world, '<div id="heads" class="abs"></div>', "heads");
	const HEADS = [
		["PROPOSE", ["Drop in", "<em>any</em> game."], "Steam, BoardGameGeek and HowLongToBeat fill in the rest. Effort is sized for you."],
		["VOTE", ["Ten secret", "votes <em>each.</em>"], "Spend them on what you actually want to play. Only the group totals are ever shown."],
		["PICK", ["The picker", "<em>calls it.</em>"], "Interest, time fit and who's around tonight, blended into one ranked answer."],
		["PLAY", ["Schedule it.", "<em>Finish</em> it."], "Paint when you're free, RSVP, and watch the burn-up chart close in on the finish."],
	];
	R.hl = HEADS.map(([idx, lines, sub], i) =>
		add(
			heads,
			`<div class="hl"><div class="idx"><b>0${i + 1}</b><span class="idxt">${idx}</span></div><div class="big">${lines
				.map((l) => `<span class="ln"><span>${l}</span></span>`)
				.join("")}</div><div class="sub">${sub}</div></div>`,
		),
	);
	R.panels = add(world, '<div id="panels" class="abs"></div>', "panels");
	R.p = [buildP1(R.panels), buildP2(R.panels), buildP3(R.panels), buildP4(R.panels)];
	const rail = add(world, '<div id="rail" class="abs"></div>', "rail");
	R.seg = ["PROPOSE", "VOTE", "PICK", "PLAY"].map((n, i) =>
		add(rail, `<div class="seg"><div class="lb">0${i + 1} ${n}</div><div class="tr"><i></i></div></div>`),
	);

	// --- act 4
	const kinds = add(world, '<div id="kinds" class="abs"></div>', "kinds");
	R.kd = KINDS.map(([w, c]) => add(kinds, `<div class="kd" style="color:${c}">${w}</div>`));
	R.lock = buildLogo(world, "lock", 430, 230, 170, "");
	const lk = R.lock.root;
	R.tag1 = add(lk, `<div class="tag" style="top:200px;color:#e7ebf1">${wordsMasked("Stop scrolling the backlog.")}</div>`);
	R.tag2 = add(lk, `<div class="tag" style="top:272px;color:#34d1e6">${wordsMasked("Start playing it.")}</div>`);
	R.meta = add(lk, '<div class="meta" style="top:390px"></div>');
	R.meta2 = add(lk, '<div class="meta" style="top:430px;color:#34d1e6"></div>');
}

function wordsMasked(s) {
	return s
		.split(" ")
		.map((w) => `<span class="mask"><span class="wd">${w}</span></span>`)
		.join('<span style="display:inline-block;width:0.28em"></span>');
}

function buildLogo(world, id, y, markSize, fontSize, subText) {
	const root = add(world, `<div id="${id}" class="abs" style="left:960px;top:${y}px;width:0;height:0"></div>`);
	const group = add(root, '<div class="abs"></div>');
	const mark = add(group, `<div class="mark" style="width:${markSize}px;height:${markSize}px">${CHEV_SVG(6)}</div>`);
	const wm = add(group, `<div class="wm" style="font-size:${fontSize}px">${letters("Next", "n")}${letters("Quest", "q")}</div>`);
	const sub = subText ? add(root, '<div class="meta" style="top:150px;color:#8a93a3"></div>') : null;
	return { root, group, mark, wm, sub, subText, markSize, fontSize, chars: [...wm.querySelectorAll(".n,.q")] };
}

function layoutLogo(L) {
	// centre mark + wordmark as a group once fonts have loaded
	const gap = L.markSize * 0.22;
	const ww = L.wm.offsetWidth;
	const total = L.markSize + gap + ww;
	L.mark.style.left = `${-total / 2}px`;
	L.mark.style.top = `${-L.markSize / 2}px`;
	L.wm.style.left = `${-total / 2 + L.markSize + gap}px`;
	L.wm.style.top = `${-L.fontSize * 0.62}px`;
	L.markX = -total / 2 + L.markSize / 2;
}

function panelShell(parent, crumb) {
	return add(
		parent,
		`<div class="panel"><div class="pbar"><span class="dots"><i></i><i></i><i></i></span><span class="chev">${CHEV_SVG(7)}</span><span>NextQuest</span><span>/</span><span class="crumb">${crumb}</span></div><div class="pb"></div></div>`,
	);
}

function buildP1(parent) {
	const el = panelShell(parent, "Backlog");
	const pb = el.querySelector(".pb");
	const o = { el };
	o.search = add(pb, `<div class="search">${SVG_SEARCH}<span class="q"></span><span class="caret"></span><span class="ph" style="color:#5d6676">Paste a Steam or BGG link, or type a title</span><span class="kbd">/</span></div>`);
	o.q = o.search.querySelector(".q");
	o.caret = o.search.querySelector(".caret");
	o.ph = o.search.querySelector(".ph");
	o.chips = add(pb, '<div class="chips"><span class="chip">VIDEO</span><span class="chip">TTRPG</span><span class="chip">BOARD GAME</span><span class="chip" style="margin-left:auto;border-color:transparent">STEAM · BGG · HLTB</span></div>');
	o.chipEls = [...o.chips.children];
	o.card = add(
		pb,
		`<div class="gcard"><div class="cover">${coverArt("dragon")}</div><div class="ginfo"><div class="gtitle">Dragon's Peak</div><div class="gmeta">Action RPG · Open world · Single-player</div><div class="stats"><div class="stat"><b>~100 h</b><i>Length</i></div><div class="stat"><b class="pips">●●●●●</b><i>Difficulty</i></div><div class="stat"><b>94%</b><i>Acclaim</i></div></div></div><div class="form"></div><div class="effort"><div class="effn">0</div><div class="effl">EFFORT</div></div></div>`,
	);
	o.stats = [...o.card.querySelectorAll(".stat")];
	o.effort = o.card.querySelector(".effort");
	o.effn = o.card.querySelector(".effn");
	o.form = o.card.querySelector(".form");
	return o;
}

function buildP2(parent) {
	const el = panelShell(parent, "What's next? · Ballot");
	const pb = el.querySelector(".pb");
	const o = { el };
	o.head = add(pb, `<div class="vhead"><div class="vleft"><span class="vn">10</span><small>VOTES LEFT</small></div><div class="lock">${SVG_LOCK}ANONYMOUS</div></div>`);
	o.vn = o.head.querySelector(".vn");
	o.lock = o.head.querySelector(".lock");
	o.rows = VOTE_ROWS.map((r) => {
		const row = add(pb, `<div class="vrow"><div class="thumb">${coverArt(r.id === "star" ? "star" : r.id)}</div><div class="vt">${r.t}<small style="color:${r.c}">${r.k}</small></div><div class="step"><i class="m">−</i><b>0</b><i class="p">+</i></div><div><div class="mono" style="font-size:13px;letter-spacing:.12em;color:#8a93a3;margin-bottom:8px">GROUP TOTAL</div><div class="tot"><i></i></div></div></div>`);
		return { row, n: row.querySelector(".step b"), plus: row.querySelector(".p"), bar: row.querySelector(".tot i") };
	});
	return o;
}

function buildP3(parent) {
	const el = panelShell(parent, "What's next?");
	const pb = el.querySelector(".pb");
	const o = { el };
	o.ctx = add(pb, '<div class="ctx">Tonight <span class="chip">3 HRS</span><span class="chip">4 PLAYERS</span><span class="chip">ANY KIND</span><div class="legend"><span><i style="background:#ff6b6b"></i>INTEREST</span><span><i style="background:#34d1e6"></i>TIME FIT</span><span><i style="background:#8b7cff"></i>PARTY FIT</span></div></div>');
	o.legend = [...o.ctx.querySelectorAll(".legend span")];
	o.rows = PICK.map((g) => {
		const row = add(el, `<div class="prow"><div class="thumb">${coverArt(g.id)}</div><div class="vt">${g.t}<small style="color:${g.c}">${g.k}</small></div><div class="bar"><i style="background:#ff6b6b"></i><i style="background:#34d1e6"></i><i style="background:#8b7cff"></i></div><div class="score">0</div></div>`);
		const badge = g.id === "gloom" ? add(row, '<div class="nextup">NEXT UP</div>') : null;
		return { g, row, segs: [...row.querySelectorAll(".bar i")], score: row.querySelector(".score"), badge };
	});
	return o;
}

function buildP4(parent) {
	const el = panelShell(parent, "Events · Dashboard");
	const pb = el.querySelector(".pb");
	const o = { el };
	const split = add(pb, '<div class="split"></div>');
	const heat = add(split, '<div class="card"><h4>When can everyone play? <span>FREE / 4</span></h4><div class="heat"></div><div class="toast"><div><div class="when">FRI · 7:00 PM</div><div style="font:500 16px Geist;color:#8a93a3">Gloomkeep · session 1</div></div><div class="who"></div></div></div>');
	const grid = heat.querySelector(".heat");
	grid.insertAdjacentHTML("beforeend", "<div></div>" + ["MON", "TUE", "WED", "THU", "FRI"].map((d) => `<div class="d">${d}</div>`).join(""));
	o.cells = [];
	["5 PM", "6 PM", "7 PM", "8 PM", "9 PM"].forEach((hr, r) => {
		grid.insertAdjacentHTML("beforeend", `<div class="h">${hr}</div>`);
		for (let c = 0; c < 5; c++) {
			const cell = h('<div class="c"></div>');
			grid.appendChild(cell);
			o.cells.push({ cell, r, c, v: HEAT[r][c] });
		}
	});
	o.toast = heat.querySelector(".toast");
	const who = heat.querySelector(".who");
	o.who = ["#34d1e6", "#8b7cff", "#ffc94a", "#3fcf8e"].map((c) => {
		const i = h(`<i style="background:${c}"></i>`);
		who.appendChild(i);
		return i;
	});
	const chart = add(split, '<div class="card chart"><h4>Burn-up <span>EFFORT · WEEKLY</span></h4></div>');
	// chart geometry
	const Wc = 480;
	const Hc = 300;
	const vals = [0, 0.05, 0.09, 0.15, 0.19, 0.26, 0.31, 0.37, 0.42];
	const xs = (i) => 20 + (i / 15) * (Wc - 40);
	const ys = (v) => Hc - 20 - v * (Hc - 60);
	const pts = vals.map((v, i) => [xs(i), ys(v)]);
	const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
	const last = pts[pts.length - 1];
	const fin = [xs(14.6), ys(0.92)];
	const area = `${d} L${last[0]},${ys(0)} L${pts[0][0]},${ys(0)} Z`;
	chart.insertAdjacentHTML(
		"beforeend",
		`<svg viewBox="0 0 ${Wc} ${Hc}" preserveAspectRatio="none">
<defs><linearGradient id="ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34d1e6" stop-opacity=".35"/><stop offset="1" stop-color="#34d1e6" stop-opacity="0"/></linearGradient></defs>
${[0.25, 0.5, 0.75].map((g) => `<line x1="20" x2="${Wc - 20}" y1="${ys(g)}" y2="${ys(g)}" stroke="#262d38" stroke-width="1"/>`).join("")}
<line x1="20" x2="${Wc - 20}" y1="${ys(0.92)}" y2="${ys(0.92)}" stroke="#ff6b6b" stroke-width="2" stroke-dasharray="6 6" class="tot"/>
<text x="${Wc - 20}" y="${ys(0.92) - 10}" fill="#ff6b6b" font-family="Geist Mono" font-size="13" text-anchor="end" letter-spacing="1.5" class="totl">BACKLOG TOTAL</text>
<path d="${area}" fill="url(#ar)" class="area"/>
<path d="${d}" fill="none" stroke="#34d1e6" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" class="line"/>
<path d="M${last[0]},${last[1]} L${fin[0]},${fin[1]}" fill="none" stroke="#8b7cff" stroke-width="3" stroke-dasharray="8 8" class="proj"/>
<g class="flag" transform="translate(${fin[0]},${fin[1]})"><line x1="0" y1="0" x2="0" y2="-44" stroke="#e7ebf1" stroke-width="3"/><path d="M0,-44 L30,-36 L0,-27 Z" fill="#ffc94a"/></g>
<circle cx="${last[0]}" cy="${last[1]}" r="7" fill="#34d1e6" class="dot"/>
</svg>`,
	);
	o.svg = chart.querySelector("svg");
	o.line = o.svg.querySelector(".line");
	o.lineLen = 0;
	o.area = o.svg.querySelector(".area");
	o.proj = o.svg.querySelector(".proj");
	o.flag = o.svg.querySelector(".flag");
	o.dot = o.svg.querySelector(".dot");
	o.tot = o.svg.querySelector(".tot");
	o.totl = o.svg.querySelector(".totl");
	o.kpis = add(chart, '<div class="kpis"><div class="kpi"><b class="k1">0%</b><i>complete</i></div><div class="kpi"><b class="k2" style="color:#34d1e6">0.0</b><i>effort / week</i></div><div class="kpi"><b class="k3">—</b><i>projected finish</i></div></div>');
	o.k = [...o.kpis.querySelectorAll("b")];
	o.fin = fin;
	return o;
}

function layoutReel() {
	layoutLogo(R.logo);
	layoutLogo(R.lock);
	R.p[3].lineLen = R.p[3].line.getTotalLength();
	R.p[3].projLen = R.p[3].proj.getTotalLength();
}

// ------------------------------------------------------------------ style helpers
function T(el, o) {
	const s = el.style;
	const op = o.o ?? 1;
	if (op <= 0.001) {
		if (s.display !== "none") s.display = "none";
		return;
	}
	if (s.display === "none") s.display = "";
	s.opacity = op >= 0.999 ? "" : op.toFixed(3);
	s.transform = `translate3d(${(o.x ?? 0).toFixed(2)}px,${(o.y ?? 0).toFixed(2)}px,${(o.z ?? 0).toFixed(2)}px) rotateX(${(o.rx ?? 0).toFixed(3)}deg) rotateY(${(o.ry ?? 0).toFixed(3)}deg) rotateZ(${(o.rz ?? 0).toFixed(3)}deg) scale(${(o.sx ?? o.s ?? 1).toFixed(4)},${(o.sy ?? o.s ?? 1).toFixed(4)})`;
	const f = [];
	if (o.blur && o.blur > 0.05) f.push(`blur(${o.blur.toFixed(2)}px)`);
	if (o.bright !== undefined) f.push(`brightness(${o.bright.toFixed(3)})`);
	s.filter = f.join(" ");
}
const hide = (el) => {
	if (el.style.display !== "none") el.style.display = "none";
};
function rgbSplit(el, amt) {
	el.style.textShadow =
		amt > 0.2 ? `${amt.toFixed(1)}px 0 rgba(255,60,110,.85), ${(-amt).toFixed(1)}px 0 rgba(52,209,230,.85)` : "";
}
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+/<>";
function decode(str, p, t, seed = 0) {
	const n = str.length;
	const shown = Math.floor(p * n);
	const tick = Math.floor(t * 30);
	let out = "";
	for (let i = 0; i < n; i++) {
		const c = str[i];
		if (i < shown || c === " " || c === "·") out += c;
		else if (i < shown + 6) out += GLYPHS[Math.floor(hsh(tick * 13.1 + i * 7.7 + seed) * GLYPHS.length)];
		else out += " ";
	}
	return out;
}
function setText(el, s) {
	if (el.textContent !== s) el.textContent = s;
}

// ------------------------------------------------------------------ render
function render(t) {
	renderBG(t);
	renderCamera(t);
	renderAct1(t);
	renderLogo(R.logo, t, TL.hit, true);
	renderAct3(t);
	renderAct4(t);
	renderFX(t);
}

function renderCamera(t) {
	let punch = 0;
	for (const w of TL.words) punch += spr(t, w, 2.2, 9) * 0.035;
	punch += spr(t, TL.hit, 2, 6) * 0.06 + spr(t, TL.final, 2, 6) * 0.06;
	for (const f of TL.feats.slice(1)) punch += spr(t, f, 2.4, 8) * 0.02;
	let sx = 0;
	let sy = 0;
	for (const [t0, a] of [
		[TL.hit, 22],
		[TL.final, 18],
	]) {
		const k = decay(t, t0, 7) * a;
		sx += k * noise1(t * 40 + t0);
		sy += k * noise1(t * 43 + t0 + 9);
	}
	const drift = noise1(t * 0.35) * 0.6;
	T(R.world, { x: sx, y: sy, s: 1 + punch, ry: drift, rx: noise1(t * 0.3 + 5) * 0.4 });
}

function renderAct1(t) {
	// laser
	if (t < 1.0) T(R.laser, { sx: pr(t, TL.laser, 0.45, Ez.oe), sy: 1 + 2 * decay(t, 0.1, 6), o: 1 - pr(t, 0.6, 0.35, Ez.ic) });
	else hide(R.laser);

	// wall of games
	if (t < TL.hit + 0.05) {
		const appear = pr(t, TL.wall, 0.9, Ez.oc);
		const scroll = 260 * t + 2200 * Math.pow(Math.max(0, t - 1.4), 2);
		const rowH = 264;
		const off = -(scroll % rowH);
		let snap = 0;
		TL.words.forEach((w, i) => {
			snap += (i % 2 ? -1 : 1) * 7 * pr(t, w, 0.25, Ez.oe);
		});
		const imp = pr(t, 3.12, 0.38, Ez.ie);
		T(R.wallWrap, {
			z: mix(-700, -150, appear) - imp * 1800,
			rx: mix(64, 52, appear),
			rz: -26 + snap + imp * 70,
			s: mix(1.1, 1, appear) * (1 - imp * 0.6),
			o: appear * 0.62 * (1 - imp),
		});
		T(R.wall, { y: off - 132, blur: Math.min(6, Math.max(0, t - 1.4) * 4) });
	} else hide(R.wallWrap);

	// counter
	if (t > TL.count - 0.05 && t < 1.55) {
		const p = pr(t, TL.count, 0.85, Ez.oq);
		const out = pr(t, 1.32, 0.18, Ez.ic);
		setText(R.countNum, String(Math.round(247 * p)));
		setText(R.countLbl, decode("GAMES IN YOUR GROUP'S BACKLOG", pr(t, 0.62, 0.55, Ez.lin), t, 3));
		T(R.count, { s: mix(1.25, 1, pr(t, TL.count, 0.5, Ez.oe)) * (1 + out * 0.15), blur: (1 - pr(t, TL.count, 0.35, Ez.oc)) * 14 + out * 14, o: pr(t, TL.count, 0.15, Ez.lin) * (1 - out), y: -out * 40 });
	} else hide(R.count);

	// kinetic words, hard cuts on the beat
	R.kw.forEach((el, i) => {
		const t0 = TL.words[i];
		const t1 = i < 3 ? TL.words[i + 1] : TL.hit;
		if (t < t0 || t >= t1) return hide(el);
		const u = pr(t, t0, 0.2, Ez.oe);
		const tilt = (i % 2 ? 1 : -1) * 2;
		let s = mix(1.55, 1, u);
		let o = 1;
		let blur = (1 - u) * 16;
		if (i === 3) {
			const fly = pr(t, 3.22, 0.28, Ez.ie);
			s *= 1 + fly * 4;
			o = 1 - fly;
			blur += fly * 20;
		}
		T(el, { s, rz: tilt * (1 - u * 0.6), o, blur });
		rgbSplit(el, 18 * decay(t, t0, 9));
	});
}

function renderLogo(L, t, t0, isIntro) {
	const end = isIntro ? 4.62 : 99;
	if (t < t0 - 0.02 || t > end) {
		hide(L.root);
		if (L === R.logo) hide(R.ring);
		return;
	}
	const zoom = isIntro ? pr(t, TL.zoom, 0.36, Ez.ie) : 0;
	T(L.root, { o: 1 - pr(t, end - 0.12, 0.12, Ez.lin) });
	// zoom-through: scale around the mark
	T(L.group, { x: -L.markX * zoom * 0, s: 1 + zoom * 14, o: 1 });
	L.group.style.transformOrigin = `${L.markX}px 0px`;
	const mp = pr(t, t0, 0.5, (x) => Ez.ob(x, 1.9));
	T(L.mark, { s: mix(0.15, 1, mp), rz: (1 - mp) * -120, o: pr(t, t0, 0.08, Ez.lin) });
	const c1 = L.mark.querySelector(".c1");
	const c2 = L.mark.querySelector(".c2");
	c1.setAttribute("stroke-dashoffset", (36 * (1 - pr(t, t0 + 0.08, 0.28, Ez.oc))).toFixed(2));
	c2.setAttribute("stroke-dashoffset", (36 * (1 - pr(t, t0 + 0.16, 0.28, Ez.oc))).toFixed(2));
	L.chars.forEach((c, i) => {
		const u = pr(t, t0 + 0.1 + i * 0.028, 0.45, Ez.oe);
		c.style.transform = `translate3d(0,${((1 - u) * 110).toFixed(1)}%,0)`;
	});
	// light sweep
	const sw = pr(t, t0 + 0.45, 0.8, Ez.ioc);
	const pos = `${mix(100, 0, sw).toFixed(1)}% 0`;
	L.chars.forEach((c) => (c.style.backgroundPosition = pos));
	if (L.sub) {
		setText(L.sub, decode(L.subText, pr(t, t0 + 0.32, 0.42, Ez.lin), t, 11));
		T(L.sub, { o: pr(t, t0 + 0.3, 0.1, Ez.lin) * (1 - zoom) });
	}
	// ring shockwave
	if (L === R.logo || L === R.lock) {
		const ring = R.ring;
		const rp = cl((t - t0) / 0.7);
		if (rp > 0 && rp < 1) {
			ring.style.top = `${L === R.lock ? 430 : 540}px`;
			T(ring, { o: 1 });
			[...ring.children].forEach((r, k) => {
				const u = Ez.oc(cl(rp * (1 + k * 0.3) - k * 0.15));
				const rad = 60 + u * (700 + k * 300);
				Object.assign(r.style, {
					left: `${-rad + L.markX}px`,
					top: `${-rad}px`,
					width: `${rad * 2}px`,
					height: `${rad * 2}px`,
					opacity: ((1 - u) * 0.9).toFixed(3),
					borderWidth: `${(1 - u) * 6 + 1}px`,
					borderColor: k ? "#8b7cff" : "#34d1e6",
				});
			});
		} else if (t > t0 + 0.7) hide(ring);
	}
}

function renderAct3(t) {
	const f = TL.feats;
	const vis = t > f[0] - 0.1 && t < 13.6;
	if (!vis) {
		hide(R.heads);
		hide(R.panels);
		hide(R.rail);
		return;
	}
	const fadeAll = pr(t, 12.3, 0.25, Ez.ic);
	T(R.heads, { o: 1 - fadeAll, x: -fadeAll * 80 });
	T(R.rail, { o: pr(t, f[0] + 0.2, 0.3, Ez.lin) * (1 - fadeAll) });
	T(R.panels, {});
	// rail fill
	R.seg.forEach((s, i) => {
		const fill = cl((t - f[i]) / 2);
		s.querySelector("i").style.width = `${(fill * 100).toFixed(2)}%`;
		s.querySelector(".lb").style.color = t >= f[i] && t < f[i] + 2 ? "#e7ebf1" : "#5d6676";
	});
	// headlines
	R.hl.forEach((hl, i) => {
		const t0 = i === 0 ? f[0] + 0.05 : f[i];
		const tOut = i < 3 ? f[i] + 1.74 : 99;
		if (t < t0 - 0.01 || t > tOut + 0.36) return hide(hl);
		T(hl, {});
		const lines = hl.querySelectorAll(".ln > span");
		lines.forEach((ln, k) => {
			const uin = pr(t, t0 + 0.1 + k * 0.07, 0.5, Ez.oe);
			const uout = pr(t, tOut + k * 0.04, 0.22, Ez.ic);
			ln.style.transform = `translate3d(0,${((1 - uin) * 112 - uout * 112).toFixed(1)}%,0)`;
		});
		const idx = hl.querySelector(".idxt");
		setText(idx, decode(["PROPOSE", "VOTE", "PICK", "PLAY"][i], pr(t, t0, 0.3, Ez.lin), t, i));
		const sub = hl.querySelector(".sub");
		T(sub, { o: pr(t, t0 + 0.3, 0.35, Ez.oc) * (1 - pr(t, tOut - 0.05, 0.15, Ez.lin)), y: (1 - pr(t, t0 + 0.3, 0.5, Ez.oe)) * 24 });
		T(hl.querySelector(".idx"), { o: 1 - pr(t, tOut, 0.25, Ez.lin) });
	});
	// panels
	R.p.forEach((P, i) => {
		const t0 = f[i] - 0.05;
		const tOut = i < 3 ? f[i] + 1.84 : 99;
		const inU = pr(t, t0, 0.62, Ez.oe);
		const outU = pr(t, tOut, 0.42, Ez.ie);
		const local = t - f[i];
		// fan arrangement in act 4
		const fanIn = pr(t, TL.fanIn + i * 0.035, 0.5, Ez.oe);
		const coll = pr(t, TL.collapse, 0.2, Ez.ie);
		if (fanIn > 0) {
			const k = i - 1.5;
			const base = { x: 0, y: 0, z: 0, ry: -16, rx: 6, s: 1 };
			const fan = { x: -410 + k * 420, y: 60, z: -260 - Math.abs(k) * 150, ry: k * -22, rx: 4, s: 0.6 };
			const from = i === 3 ? base : { ...fan, x: fan.x + 600, z: fan.z - 900, ry: fan.ry - 40 };
			const u = fanIn;
			const spin = (t - TL.fanIn) * 6;
			renderPanel(i, P, 3);
			return T(P.el, {
				x: mix(from.x, fan.x, u) * (1 - coll),
				y: mix(from.y, fan.y, u) * (1 - coll),
				z: mix(from.z, fan.z, u) - coll * 1200,
				ry: mix(from.ry, fan.ry, u) + spin,
				rx: mix(from.rx, fan.rx, u),
				s: mix(from.s, fan.s, u) * (1 - coll * 0.7),
				o: (i === 3 ? 1 : cl(u * 2)) * (1 - coll),
				blur: coll * 10,
			});
		}
		if (t < t0 || outU >= 1) return hide(P.el);
		const float = Math.sin((t + i) * 1.3) * 8;
		T(P.el, {
			x: mix(560, 0, inU) - outU * 160,
			y: float - outU * 140,
			z: mix(-420, 0, inU) - outU * 1100,
			ry: mix(-58, -16, inU) - outU * 24 + noise1(t * 0.5 + i) * 2,
			rx: 6 + outU * 22 + noise1(t * 0.4 + 3 + i) * 1.5,
			o: cl(inU * 1.6) * (1 - outU),
			blur: (1 - inU) * 10 + outU * 8,
		});
		renderPanel(i, P, local);
	});
}

function renderPanel(i, P, u) {
	[renderP1, renderP2, renderP3, renderP4][i](P, u);
}

function renderP1(P, u) {
	const n = P1_QUERY.length;
	let typed = 0;
	for (let i = 0; i < n; i++) if (u >= P1_TYPE(i)) typed = i + 1;
	setText(P.q, P1_QUERY.slice(0, typed));
	P.ph.style.display = typed ? "none" : "";
	P.search.classList.toggle("focus", u > 0.12);
	P.caret.style.opacity = u > 0.12 && (u > 0.7 ? Math.floor(u * 4) % 2 === 0 : true) ? "1" : "0";
	P.chipEls.slice(0, 3).forEach((c, k) => {
		const on = u > 0.05 + k * 0.12;
		c.className = "chip" + (on ? [" on-v", " on-t", " on-b"][k] : "");
	});
	const cu = pr(u, 0.7, 0.45, Ez.oe);
	T(P.card, { o: cu, y: (1 - cu) * 40, s: mix(0.96, 1, cu) });
	P.stats.forEach((s, k) => {
		const su = pr(u, 0.9 + k * 0.1, 0.35, (x) => Ez.ob(x, 2));
		T(s, { s: mix(0.6, 1, su), o: cl(su * 2) });
	});
	const eu = pr(u, 1.18, 0.38, (x) => Ez.ob(x, 2.2));
	T(P.effort, { s: mix(0.2, 1, eu), o: cl(eu * 2), rz: (1 - eu) * -40 });
	setText(P.effn, String(Math.round(29 * pr(u, 1.2, 0.42, Ez.oq))));
	setText(P.form, decode("13 × 2.0 × 1.12 =", pr(u, 1.3, 0.35, Ez.lin), u + 7, 5));
}

function renderP2(P, u) {
	const done = VOTE_STEPS.filter((s) => u >= s.u);
	setText(P.vn, String(10 - done.length));
	P.rows.forEach((r, k) => {
		const mine = done.filter((s) => s.row === k).length;
		setText(r.n, String(mine));
		const hot = VOTE_STEPS.some((s) => s.row === k && u >= s.u && u < s.u + 0.08);
		r.plus.className = "p" + (hot ? " hot" : "");
		const ru = pr(u, 0.1 + k * 0.05, 0.4, Ez.oe);
		T(r.row, { o: ru, x: (1 - ru) * 60 });
		const w = r.row.querySelector(".tot i");
		w.style.width = `${((VOTE_ROWS[k].base + mine * 0.05) * 100 * pr(u, 0.15, 0.6, Ez.oc)).toFixed(2)}%`;
	});
	const lu = pr(u, 1.45, 0.3, (x) => Ez.ob(x, 2.4));
	T(P.lock, { s: mix(1.8, 1, lu), o: cl(lu * 3), rz: (1 - lu) * 10 });
}

function pickScore(g, u) {
	let s = 0;
	const prev = [0, ...g.s];
	for (let k = 0; k < 3; k++) s += (prev[k + 1] - prev[k]) * pr(u, PICK_STAGE[k], 0.3, Ez.oc);
	return s;
}
function pickRank(u) {
	// rank positions with smooth swaps after each factor lands
	const ord = (cut) =>
		PICK.map((g, i) => ({ i, v: cut < 0 ? g.s[0] : g.s[cut] }))
			.sort((a, b) => b.v - a.v)
			.map((x) => x.i);
	const stages = [
		[-1, 0],
		[1, PICK_STAGE[1] + 0.25],
		[2, PICK_STAGE[2] + 0.25],
	];
	const pos = new Array(PICK.length).fill(0);
	let base = ord(-1);
	base.forEach((gi, r) => (pos[gi] = r));
	for (let s = 1; s < stages.length; s++) {
		const next = ord(stages[s][0]);
		const w = pr(u, stages[s][1], 0.35, Ez.ioc);
		next.forEach((gi, r) => (pos[gi] = mix(pos[gi], r, w)));
	}
	return pos;
}
function renderP3(P, u) {
	const cu = pr(u, 0.05, 0.35, Ez.oe);
	T(P.ctx, { o: cu, y: (1 - cu) * 20 });
	P.legend.forEach((l, k) => (l.style.color = u > PICK_STAGE[k] ? "#e7ebf1" : "#5d6676"));
	const pos = pickRank(u);
	const win = pr(u, PICK_WIN, 0.35, (x) => Ez.ob(x, 2.2));
	P.rows.forEach((r, k) => {
		const s = pickScore(r.g, u);
		const prev = [0, ...r.g.s];
		r.segs.forEach((seg, j) => {
			const a = prev[j];
			const b = Math.min(prev[j + 1], Math.max(a, s));
			seg.style.left = `${a * 100}%`;
			seg.style.width = `${Math.max(0, b - a) * 100}%`;
		});
		setText(r.score, String(Math.round(s * 100)));
		const isWin = r.g.id === "gloom";
		const ru = pr(u, 0.12 + k * 0.05, 0.4, Ez.oe);
		T(r.row, {
			y: 150 + pos[k] * 122,
			x: (1 - ru) * 80,
			o: ru * (isWin ? 1 : 1 - 0.55 * pr(u, PICK_WIN, 0.3, Ez.lin)),
			s: isWin ? 1 + 0.035 * win : 1,
			z: isWin ? 30 * win : 0,
		});
		r.row.style.borderColor = isWin && u > PICK_WIN ? "#ffc94a" : "";
		r.row.style.boxShadow = isWin && u > PICK_WIN ? `0 0 ${(40 * win).toFixed(0)}px rgba(255,201,74,.35)` : "";
		if (r.badge) T(r.badge, { s: mix(2, 1, win), o: cl(win * 3), rz: (1 - win) * -12 });
	});
}

function renderP4(P, u) {
	P.cells.forEach((c) => {
		const cu = pr(u, 0.05 + (c.r + c.c) * 0.035, 0.3, (x) => Ez.ob(x, 2));
		const a = (c.v / 4) * 0.95;
		const best = c.v === 4 && u > 0.62;
		c.cell.style.background = `rgba(52,209,230,${(a * cl(cu)).toFixed(3)})`;
		c.cell.style.transform = `scale(${mix(0.4, 1, cu).toFixed(3)})`;
		c.cell.style.boxShadow = best ? "0 0 0 3px #ffc94a, 0 0 24px rgba(255,201,74,.55)" : "";
	});
	const tu = pr(u, 0.72, 0.45, Ez.oe);
	T(P.toast, { y: (1 - tu) * 120, o: tu });
	P.who.forEach((w, k) => T(w, { s: pr(u, 0.85 + k * 0.06, 0.25, (x) => Ez.ob(x, 2.5)) }));
	const lu = pr(u, 0.45, 0.7, Ez.ioc);
	P.line.style.strokeDasharray = `${P.lineLen}`;
	P.line.style.strokeDashoffset = `${(P.lineLen * (1 - lu)).toFixed(2)}`;
	P.area.style.opacity = (lu * 0.9).toFixed(3);
	P.dot.style.opacity = lu > 0.98 ? "1" : "0";
	P.tot.style.opacity = P.totl.style.opacity = pr(u, 0.3, 0.3, Ez.lin).toFixed(3);
	const pu = pr(u, 1.05, 0.4, Ez.oc);
	P.proj.style.strokeDasharray = `8 8`;
	P.proj.style.opacity = pu > 0 ? "1" : "0";
	P.proj.setAttribute("stroke-dasharray", `${(P.projLen * pu).toFixed(1)} 9999`);
	P.proj.style.strokeDasharray = "";
	const fu = pr(u, 1.4, 0.3, (x) => Ez.ob(x, 2.5));
	P.flag.setAttribute("transform", `translate(${P.fin[0]},${P.fin[1]}) scale(${fu.toFixed(3)})`);
	const ku = pr(u, 0.55, 0.7, Ez.oq);
	setText(P.k[0], `${Math.round(42 * ku)}%`);
	setText(P.k[1], (6.5 * ku).toFixed(1));
	setText(P.k[2], u > 1.4 ? "Mar 14" : decode("Mar 14", pr(u, 1.1, 0.3, Ez.lin), u, 2));
}

function renderAct4(t) {
	// kinds, hard cuts on 8th notes
	R.kd.forEach((el, i) => {
		const t0 = TL.kinds[i];
		const t1 = i < 3 ? TL.kinds[i + 1] : TL.final;
		if (t < t0 || t >= t1) return hide(el);
		const u = pr(t, t0, 0.14, Ez.oe);
		T(el, { s: mix(1.35, 1, u), blur: (1 - u) * 10, o: 1 });
		rgbSplit(el, 10 * decay(t, t0, 12));
	});
	renderLogo(R.lock, t, TL.final, false);
	if (t < TL.final - 0.02) {
		hide(R.tag1);
		hide(R.tag2);
		hide(R.meta);
		hide(R.meta2);
		return;
	}
	[R.tag1, R.tag2].forEach((tg, k) => {
		T(tg, {});
		[...tg.querySelectorAll(".wd")].forEach((w, j) => {
			const u = pr(t, TL.final + 0.42 + k * 0.32 + j * 0.06, 0.5, Ez.oe);
			w.style.transform = `translate3d(0,${((1 - u) * 112).toFixed(1)}%,0)`;
		});
	});
	setText(R.meta, decode("OPEN SOURCE · VIDEO GAMES · TTRPGS · BOARD GAMES", pr(t, 14.15, 0.45, Ez.lin), t, 21));
	setText(R.meta2, decode("GITHUB.COM/LIGHTNINGMARSHAL/NEXTQUEST", pr(t, 14.35, 0.4, Ez.lin), t, 29));
	T(R.meta, { o: pr(t, 14.1, 0.1, Ez.lin) });
	T(R.meta2, { o: pr(t, 14.3, 0.1, Ez.lin) });
}

// ------------------------------------------------------------------ background + fx canvases
let BGX = null;
let FXX = null;
let GRAIN = [];
const PARTS = Array.from({ length: 140 }, (_, i) => ({
	x: hsh(i * 1.3) * 1920,
	y: hsh(i * 2.7) * 1080,
	z: 0.3 + hsh(i * 4.1) * 1.4,
	r: 0.6 + hsh(i * 5.9) * 1.8,
	c: hsh(i * 7.3) < 0.7 ? "52,209,230" : "139,124,255",
}));

function initCanvases() {
	BGX = document.getElementById("bg").getContext("2d");
	FXX = document.getElementById("fx").getContext("2d");
	for (let k = 0; k < 4; k++) {
		const c = document.createElement("canvas");
		c.width = c.height = 256;
		const x = c.getContext("2d");
		const img = x.createImageData(256, 256);
		let s = 1234 + k * 999;
		for (let i = 0; i < img.data.length; i += 4) {
			s = (s * 1664525 + 1013904223) >>> 0;
			const v = s >>> 24;
			img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
			img.data[i + 3] = 255;
		}
		x.putImageData(img, 0, 0);
		GRAIN.push(x.createPattern(c, "repeat"));
	}
}

function beatPulse(t) {
	if (t < TL.feats[0] || t > 12.5) return 0;
	const b = Math.floor((t - TL.feats[0]) / RB);
	return decay(t, TL.feats[0] + b * RB, 7);
}

function renderBG(t) {
	const x = BGX;
	x.globalCompositeOperation = "source-over";
	x.fillStyle = "#05070a";
	x.fillRect(0, 0, 1920, 1080);
	const pulse = beatPulse(t);
	const act3 = pr(t, 4.4, 0.6, Ez.oc);
	const glow = (cx, cy, r, rgb, a) => {
		const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
		g.addColorStop(0, `rgba(${rgb},${a})`);
		g.addColorStop(1, `rgba(${rgb},0)`);
		x.fillStyle = g;
		x.fillRect(0, 0, 1920, 1080);
	};
	x.globalCompositeOperation = "lighter";
	glow(mix(960, 1380, act3) + Math.sin(t * 0.7) * 60, mix(520, 480, act3), 900, "52,209,230", 0.13 + 0.06 * pulse + 0.25 * decay(t, TL.hit, 3) + 0.25 * decay(t, TL.final, 3));
	glow(mix(300, 260, act3) + Math.cos(t * 0.5) * 80, 960, 1000, "139,124,255", 0.12 + 0.04 * pulse);
	glow(1700, 120, 700, "255,107,107", 0.03 * act3);
	// perspective floor grid
	const ga = 0.12 * act3 * (1 - pr(t, 13.3, 0.3, Ez.lin)) + 0.08 * pr(t, 13.6, 0.6, Ez.lin);
	if (ga > 0.005) {
		const hy = 640;
		x.strokeStyle = `rgba(52,209,230,${ga})`;
		x.lineWidth = 1;
		for (let k = -16; k <= 16; k++) {
			x.beginPath();
			x.moveTo(960 + k * 40, hy);
			x.lineTo(960 + k * 400, 1080);
			x.stroke();
		}
		const scroll = (t * 0.9) % 1;
		for (let k = 0; k < 14; k++) {
			const z = (k + 1 - scroll) / 14;
			const y = hy + Math.pow(z, 2.2) * (1080 - hy);
			x.globalAlpha = Math.pow(z, 0.8);
			x.beginPath();
			x.moveTo(0, y);
			x.lineTo(1920, y);
			x.stroke();
		}
		x.globalAlpha = 1;
	}
	// particles
	for (const p of PARTS) {
		const y = (((p.y - t * 40 * p.z) % 1080) + 1080) % 1080;
		const xx = p.x + Math.sin(t * 0.6 + p.y) * 20 * p.z;
		x.fillStyle = `rgba(${p.c},${(0.18 + 0.25 * pulse) * p.z * 0.6})`;
		x.beginPath();
		x.arc(xx, y, p.r * p.z, 0, Math.PI * 2);
		x.fill();
	}
	x.globalCompositeOperation = "source-over";
}

function renderFX(t) {
	const x = FXX;
	x.clearRect(0, 0, 1920, 1080);
	// vignette
	const v = x.createRadialGradient(960, 540, 420, 960, 540, 1150);
	v.addColorStop(0, "rgba(0,0,0,0)");
	v.addColorStop(1, "rgba(0,0,0,0.5)");
	x.fillStyle = v;
	x.fillRect(0, 0, 1920, 1080);
	// flashes on the two big hits
	const fl = Math.max(decay(t, TL.hit, 14) * 0.9, decay(t, TL.final, 14) * 0.75, decay(t, 0.02, 20) * 0.25);
	if (fl > 0.01) {
		x.fillStyle = `rgba(220,250,255,${fl})`;
		x.fillRect(0, 0, 1920, 1080);
	}
	// zoom-through dip to black between logo and features
	const dip = Math.min(pr(t, 4.4, 0.12, Ez.lin), 1 - pr(t, 4.52, 0.2, Ez.lin));
	if (dip > 0.01) {
		x.fillStyle = `rgba(5,7,10,${dip})`;
		x.fillRect(0, 0, 1920, 1080);
	}
	// film grain
	x.globalAlpha = 0.04;
	x.globalCompositeOperation = "overlay";
	x.fillStyle = GRAIN[Math.floor(t * 30) % 4];
	x.save();
	x.translate(Math.floor(hsh(Math.floor(t * 30)) * 256), Math.floor(hsh(Math.floor(t * 30) + 7) * 256));
	x.fillRect(-256, -256, 1920 + 512, 1080 + 512);
	x.restore();
	x.globalAlpha = 1;
	x.globalCompositeOperation = "source-over";
}
