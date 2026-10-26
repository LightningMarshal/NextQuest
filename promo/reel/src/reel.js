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
const WORDS = ["ANYONE", "UP FOR", "A GAME", "TONIGHT?"];
const KINDS = [
	["VIDEO GAMES", "#34d1e6"],
	["TTRPGS", "#8b7cff"],
	["BOARD GAMES", "#3fcf8e"],
	["ANY NIGHT.", "#ffffff"],
];

// act 1: the group chat NextQuest replaces
const PEOPLE = { Casey: "#34d1e6", Drew: "#8b7cff", Sam: "#ffc94a", Riley: "#3fcf8e", Jordan: "#ff6b6b", Alex: "#5aa8ff", Morgan: "#ff8fb1", Taylor: "#f2994a" };
const CHAT = [
	["Casey", "anyone on tonight?"],
	["Drew", "who's up for Starfall?"],
	["Sam", "I'm free after 9"],
	["Riley", "maybe saturday?"],
	["Jordan", "did we ever finish the campaign"],
	["Alex", "is it still on??"],
	["Morgan", "what time again"],
	["Casey", "link?"],
	["Taylor", "I thought it was tomorrow"],
	["Sam", "can my friend join?"],
	["Drew", "who's hosting"],
	["Riley", "sorry just saw this"],
	["Jordan", "next week then"],
	["Alex", "ok who's in"],
	["Morgan", "+1"],
	["Taylor", "still need a 4th"],
	["Casey", "scroll up, it's in there somewhere"],
	["Drew", "wait which game"],
];

// panel 1: post a session (local times within the 2 s feature)
const P1_QUERY = "Starfall Salvage";
const P1_TYPE = (i) => 0.12 + i * 0.026;
const P1_WHEN = ["Now", "Tonight 8pm", "Tomorrow 8pm", "Saturday 2pm"];
const P1_WHEN_T = 0.66;
const P1_VIS_T = 0.9;
const P1_POST_T = 1.2;
// panel 2: the Discord card, edited in place as people join
const P2_JOIN = [
	{ u: 0.62, name: "Drew" },
	{ u: 0.98, name: "Sam" },
	{ u: 1.34, name: "Riley" },
];
const P2_REMIND_T = 1.45;
// panel 3: This week — a guest arrives via invite, then you tap I'm in
const P3_GUEST_T = 0.45;
const P3_IN_T = 1.05;
// panel 4: wrap-up
const P4_WHO = [
	["Casey", false],
	["Drew", false],
	["Sam", false],
	["Riley", true],
	["You", false],
];
const P4_STARS = [0.62, 0.7, 0.78, 0.86];
const P4_RECAP = "Finally beat the raid boss. Casey carried.";
const P4_RECAP_T = (i) => 0.9 + i * 0.0085;
const P4_REPEAT_T = 1.36;
const P4_STATS_T = 1.48;

// ------------------------------------------------------------------ art
const ICONS = {
	planet: '<circle r="22"/><ellipse rx="44" ry="10" fill="none" stroke-width="5" transform="rotate(-20)"/>',
};
const SVGI = (k, fill, size = 120, extra = "") =>
	`<svg viewBox="-50 -50 100 100" width="${size}" height="${size}" style="${extra}" fill="${fill}" stroke="${fill}">${ICONS[k]}</svg>`;

/** Cover art for the two fictional games: "gloom" (a TTRPG campaign) and the default (Starfall Salvage). */
function coverArt(kind) {
	switch (kind) {
		case "gloom":
			return `<div class="art" style="background:linear-gradient(180deg,#2a3b63,#0f1a2b)"></div>
<div class="art" style="background:radial-gradient(circle at 26% 24%,#eef4ff 0 9%,rgba(238,244,255,.15) 10% 16%,transparent 17%)"></div>
<div class="art" style="background:#070b14;clip-path:polygon(18% 100%,18% 62%,26% 62%,26% 68%,34% 68%,34% 40%,44% 26%,54% 40%,54% 58%,62% 58%,62% 64%,70% 64%,70% 56%,80% 56%,80% 100%)"></div>
<div class="art" style="background:radial-gradient(circle at 42% 48%,#ffc94a 0 1.6%,transparent 2%),radial-gradient(circle at 66% 70%,#ffc94a 0 1.6%,transparent 2%)"></div>
<div class="art" style="background:linear-gradient(0deg,rgba(139,124,255,.45),transparent 30%)"></div>`;
		default:
			return `<div class="art" style="background:radial-gradient(circle at 30% 20%,#3b2a7a,#0a0a1f 70%)"></div>
<div class="art" style="background-image:radial-gradient(#fff 1px,transparent 1.5px);background-size:23px 29px;opacity:.6"></div>
<div class="art" style="display:grid;place-items:center">${SVGI("planet", "#ffb86b", 150)}</div>`;
	}
}
const SVG_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="#8a93a3" stroke-width="2.4" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>';
const SVG_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
const SVG_GLOBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/></svg>';
const SVG_PAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><path d="M17.3 5H6.7a4 4 0 0 0-3.96 3.4L2 15.6A3 3 0 0 0 7.2 18l1.6-2h6.4l1.6 2a3 3 0 0 0 5.2-2.4l-.74-7.2A4 4 0 0 0 17.3 5Z"/></svg>';
const SVG_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17 19 7"/></svg>';
const SVG_STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8Z"/></svg>';
const SVG_HASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 9h15M4 15h15M10 3 8 21M16 3l-2 18"/></svg>';
const SVG_REPEAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>';
const face = (name, size = 40, extra = "") =>
	`<i class="face" style="width:${size}px;height:${size}px;background:${PEOPLE[name] ?? "#e7ebf1"};font-size:${Math.round(size * 0.42)}px;${extra}">${name === "You" ? "Y" : name[0]}</i>`;
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
	for (let r = 0; r < 28; r++)
		for (let c = 0; c < 8; c++) {
			const i = r * 8 + c;
			const [who, text] = CHAT[(i * 5 + r * 3) % CHAT.length];
			const unread = hsh(i * 2.3) < 0.18 ? `<em>${2 + Math.floor(hsh(i) * 9)}</em>` : "";
			wall.insertAdjacentHTML("beforeend", `<div class="msg">${face(who, 44)}<div><b style="color:${PEOPLE[who]}">${who}</b><span>${text}</span></div>${unread}</div>`);
		}
	add(world, '<div id="laser" class="abs"></div>', "laser");
	const count = add(world, '<div id="count" class="abs"><div id="countNum">0</div><div id="countLbl"></div></div>', "count");
	R.countNum = count.querySelector("#countNum");
	R.countLbl = count.querySelector("#countLbl");
	const words = add(world, '<div id="words" class="abs"></div>', "words");
	R.kw = WORDS.map((w, i) => add(words, `<div class="kw${i === 3 ? " cy" : ""}">${w}</div>`));

	// --- logo (act 2) and lockup (act 4) share a builder
	R.ring = add(world, '<div id="ring" class="abs"><i></i><i></i></div>', "ring");
	R.logo = buildLogo(world, "logo", 540, 200, 150, "PLAY MORE GAMES WITH MORE PEOPLE");
	R.logo.sub.style.fontSize = "30px";
	R.logo.sub.style.top = "160px";
	R.logo.sub.style.color = "#aab3c2";

	// --- act 3
	const heads = add(world, '<div id="heads" class="abs"></div>', "heads");
	const HEADS = [
		["POST", ["Post it in", "<em>three taps.</em>"], "Pick a game, tap a time, and open it to the whole circle or keep it to the group."],
		["DISCORD", ["Discord", "<em>keeps up.</em>"], "One card per session, edited in place as people join. Nobody scrolls for the link."],
		["JOIN", ["Friends", "<em>hop in.</em>"], "Invite links and Discord sign-in bring friends-of-friends into open sessions."],
		["WRAP UP", ["Wrap up in", "<em>ten seconds.</em>"], "Who came, how it went, same time next week. Forgotten nights close themselves."],
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
	R.seg = ["POST", "DISCORD", "JOIN", "WRAP UP"].map((n, i) =>
		add(rail, `<div class="seg"><div class="lb">0${i + 1} ${n}</div><div class="tr"><i></i></div></div>`),
	);

	// --- act 4
	const kinds = add(world, '<div id="kinds" class="abs"></div>', "kinds");
	R.kd = KINDS.map(([w, c]) => add(kinds, `<div class="kd" style="color:${c}">${w}</div>`));
	R.lock = buildLogo(world, "lock", 430, 230, 170, "");
	const lk = R.lock.root;
	R.tag1 = add(lk, `<div class="tag" style="top:200px;color:#e7ebf1">${wordsMasked("Play more games")}</div>`);
	R.tag2 = add(lk, `<div class="tag" style="top:272px;color:#34d1e6">${wordsMasked("with more people.")}</div>`);
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

function fld(label, inner) {
	return `<div class="fld"><div class="flab">${label}</div>${inner}</div>`;
}

function buildP1(parent) {
	const el = panelShell(parent, "Post a session");
	const pb = el.querySelector(".pb");
	const o = { el };
	o.game = add(pb, fld("Game", `<div class="search">${SVG_SEARCH}<span class="q"></span><span class="caret"></span><span class="ph" style="color:#5d6676">Search the library or type a new one</span><span class="gpick"><span class="thumb">${coverArt("star")}</span>Video · Co-op</span></div>`));
	o.search = o.game.querySelector(".search");
	o.q = o.search.querySelector(".q");
	o.caret = o.search.querySelector(".caret");
	o.ph = o.search.querySelector(".ph");
	o.gpick = o.search.querySelector(".gpick");
	o.when = add(pb, fld("When", `<div class="chips">${P1_WHEN.map((w) => `<span class="chip wc">${w}</span>`).join("")}<span class="chip wc" style="border-style:dashed">Pick a date…</span></div>`));
	o.whenEls = [...o.when.querySelectorAll(".wc")];
	o.vis = add(pb, fld("Who can join", `<div class="vis"><div class="opt"><span class="oi">${SVG_GLOBE}</span><b>Open to the circle</b><span>Members plus invited friends and Discord-server guests.</span></div><div class="opt"><span class="oi">${SVG_LOCK}</span><b>Members only</b><span>Just the group.</span></div></div>`));
	o.opts = [...o.vis.querySelectorAll(".opt")];
	o.more = add(pb, `<div class="more"><span class="mono">▸</span>Length, seats, where, join link, notes<span class="mv">3 hrs · 6 seats · Discord voice</span></div>`);
	o.post = add(pb, `<div class="postrow"><span class="btn">+ Post session</span><span class="note"><span class="ok">${SVG_CHECK}</span>You're in. Announced to every connected Discord.</span></div>`);
	o.btn = o.post.querySelector(".btn");
	o.note = o.post.querySelector(".note");
	return o;
}

function buildP2(parent) {
	const el = add(parent, `<div class="panel discord"><div class="dbar"><span class="dh">${SVG_HASH}</span><b>game-night</b><span class="dtopic">Sessions from NextQuest</span></div><div class="dchat"></div></div>`);
	const chat = el.querySelector(".dchat");
	const o = { el };
	o.old = add(chat, `<div class="dline">${face("Morgan", 40)}<div><div class="dhead"><b style="color:${PEOPLE.Morgan}">Morgan</b><span class="dtime">Today at 5:58 PM</span></div><div class="dtext">anyone on tonight?</div></div></div>`);
	o.msg = add(chat, `<div class="dline"><span class="dav">${CHEV_SVG(7)}</span><div class="dbody"><div class="dhead"><b>NextQuest</b><span class="app">APP</span><span class="dtime">Today at 6:12 PM</span></div>
<div class="embed"><div class="ebar"></div><div class="ein"><div class="etitle"><span class="pad">${SVG_PAD}</span>Starfall Salvage</div><div class="edesc">New season tonight. Bring snacks.</div>
<div class="efields"><div class="ef"><b>When</b><span>Tonight 8:00 PM (in 2 hours)</span></div><div class="ef"><b>Game</b><span>Starfall Salvage</span></div><div class="ef"><b>Host</b><span>Casey</span></div><div class="ef wide in"><b class="incount">In (1/6)</b><span class="innames">Casey</span></div></div>
<div class="efoot">Open session — anyone in the circle can join. Tap the title to hop in.</div></div></div>
<div class="edited">(edited)</div></div></div>`);
	o.remind = add(chat, `<div class="dline"><span class="dav">${CHEV_SVG(7)}</span><div class="dbody"><div class="dhead"><b>NextQuest</b><span class="app">APP</span><span class="dtime">Today at 7:00 PM</span></div><div class="dtext"><b style="color:#f2f3f5">Starting in 1 hour:</b> Starfall Salvage. In: Casey, Drew, Sam, Riley.</div></div></div>`);
	o.embed = o.msg.querySelector(".embed");
	o.inField = o.msg.querySelector(".ef.in");
	o.incount = o.msg.querySelector(".incount");
	o.innames = o.msg.querySelector(".innames");
	o.edited = o.msg.querySelector(".edited");
	return o;
}

function buildP3(parent) {
	const el = panelShell(parent, "Home");
	const pb = el.querySelector(".pb");
	const o = { el };
	add(pb, `<div class="wk"><div class="wkh">This week</div><div class="wks">What's on, who's in — tap to join.</div></div>`);
	o.card = add(pb, `<div class="scard"><div class="sart">${coverArt("star")}</div><div class="sinfo"><div class="stt">Starfall Salvage <span class="vb open">${SVG_GLOBE}Open</span></div><div class="swhen">Tonight 8:00 PM <span class="mono">· in 2 hours · 3 hrs</span></div><div class="shost">hosted by Casey</div><div class="roster"><span class="faces"></span><span class="rcount"></span></div><div class="rsvp"><span class="rb yes">I'm in</span><span class="rb">Maybe</span><span class="rb">Out</span></div></div></div>`);
	o.faces = o.card.querySelector(".faces");
	o.rcount = o.card.querySelector(".rcount");
	o.yes = o.card.querySelector(".rb.yes");
	o.faceEls = ["Casey", "Drew", "Sam", "Riley", "You"].map((n) => {
		const f = h(face(n, 46, "margin-left:-10px;border:3px solid #1a1f27"));
		o.faces.appendChild(f);
		return f;
	});
	o.card2 = add(pb, `<div class="scard small"><div class="sart">${coverArt("gloom")}</div><div class="sinfo"><div class="stt">Gloomkeep — session 4 <span class="vb">${SVG_LOCK}Members</span></div><div class="swhen">Saturday 2:00 PM <span class="mono">· 4 hrs</span></div><div class="roster"><span class="faces">${["Jordan", "Alex", "Casey"].map((n) => face(n, 34, "margin-left:-8px;border:3px solid #1a1f27")).join("")}</span><span class="rcount">3 in</span></div></div></div>`);
	o.toast = add(el, `<div class="itoast">${face("Riley", 44)}<div><b>Riley joined from an invite link</b><span>Guest · can see and join open sessions</span></div></div>`);
	return o;
}

function buildP4(parent) {
	const el = panelShell(parent, "Starfall Salvage · Played");
	const pb = el.querySelector(".pb");
	const o = { el };
	add(pb, `<div class="wuh"><b>How did it go?</b><span class="mono">TUESDAY · 8:00 PM · 3 HRS</span></div>`);
	o.who = add(pb, `<div class="came">${P4_WHO.map(([n, g]) => `<span class="cw">${face(n, 34)}${n}${g ? '<small>GUEST</small>' : ""}<span class="tick">${SVG_CHECK}</span></span>`).join("")}</div>`);
	o.cw = [...o.who.querySelectorAll(".cw")];
	o.stars = add(pb, `<div class="stars">${[0, 1, 2, 3, 4].map(() => `<span class="st">${SVG_STAR}</span>`).join("")}<span class="srate mono"></span></div>`);
	o.st = [...o.stars.querySelectorAll(".st")];
	o.srate = o.stars.querySelector(".srate");
	o.recap = add(pb, `<div class="search recap"><span class="q"></span><span class="caret"></span></div>`);
	o.rq = o.recap.querySelector(".q");
	o.rcaret = o.recap.querySelector(".caret");
	o.row = add(pb, `<div class="wrow"><span class="tog"><i></i></span><span class="tl">${SVG_REPEAT}Same time next week</span><span class="btn">Save wrap-up</span></div>`);
	o.tog = o.row.querySelector(".tog");
	o.kpis = add(pb, '<div class="kpis"><div class="kpi"><b class="k1">0</b><i>sessions this month</i></div><div class="kpi"><b class="k2" style="color:#34d1e6">0 h</b><i>played together</i></div><div class="kpi"><b class="k3">0.0</b><i>average rating</i></div></div>');
	o.k = [...o.kpis.querySelectorAll("b")];
	return o;
}

function layoutReel() {
	layoutLogo(R.logo);
	layoutLogo(R.lock);
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
		const rowH = 118;
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
		T(R.wall, { y: off - 59, blur: Math.min(6, Math.max(0, t - 1.4) * 4) });
	} else hide(R.wallWrap);

	// counter
	if (t > TL.count - 0.05 && t < 1.55) {
		const p = pr(t, TL.count, 0.85, Ez.oq);
		const out = pr(t, 1.32, 0.18, Ez.ic);
		setText(R.countNum, p >= 0.999 ? "99+" : String(Math.round(99 * p)));
		setText(R.countLbl, decode("UNREAD IN THE GROUP CHAT", pr(t, 0.62, 0.55, Ez.lin), t, 3));
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
		setText(idx, decode(["POST", "DISCORD", "JOIN", "WRAP UP"][i], pr(t, t0, 0.3, Ez.lin), t, i));
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

function typed(str, u, at) {
	let n = 0;
	for (let i = 0; i < str.length; i++) if (u >= at(i)) n = i + 1;
	return str.slice(0, n);
}

function renderP1(P, u) {
	const q = typed(P1_QUERY, u, P1_TYPE);
	setText(P.q, q);
	P.ph.style.display = q ? "none" : "";
	const done = u >= P1_TYPE(P1_QUERY.length - 1) + 0.06;
	P.search.classList.toggle("focus", u > 0.06 && !done);
	P.caret.style.opacity = u > 0.06 && !done && Math.floor(u * 5) % 2 === 0 ? "1" : "0";
	const gp = pr(u, P1_TYPE(P1_QUERY.length - 1) + 0.04, 0.25, Ez.oe);
	T(P.gpick, { o: gp, x: (1 - gp) * 30 });
	// when-chips: a quick hover across, landing on "Tonight 8pm"
	const hov = Math.floor(cl((u - (P1_WHEN_T - 0.16)) / 0.08));
	P.whenEls.forEach((c, k) => {
		const sel = k === 1 && u >= P1_WHEN_T;
		c.className = "chip wc" + (sel ? " on-v" : !sel && u >= P1_WHEN_T - 0.16 && u < P1_WHEN_T && k === hov ? " hov" : "");
		T(c, { s: sel ? 1 + 0.12 * spr(u, P1_WHEN_T, 3, 9) : 1 });
	});
	P.opts.forEach((op, k) => {
		const on = k === 0 && u >= P1_VIS_T;
		op.className = "opt" + (on ? " on" : "");
		T(op, { s: on ? 1 + 0.05 * spr(u, P1_VIS_T, 3, 9) : 1 });
	});
	const press = u >= P1_POST_T ? 1 - 0.07 * Math.max(0, spr(u, P1_POST_T, 2.5, 10)) - 0.06 * decay(u, P1_POST_T, 18) : 1;
	T(P.btn, { s: press });
	P.btn.classList.toggle("done", u >= P1_POST_T + 0.06);
	setText(P.btn, u >= P1_POST_T + 0.06 ? "Posted" : "+ Post session");
	const nu = pr(u, P1_POST_T + 0.1, 0.35, Ez.oe);
	T(P.note, { o: nu, x: (1 - nu) * -20 });
	P.more.classList.toggle("on", u >= 1.0);
}

function renderP2(P, u) {
	T(P.old, { o: pr(u, 0.0, 0.25, Ez.oc) * 0.55 });
	const mu = pr(u, 0.14, 0.42, Ez.oe);
	T(P.msg, { o: mu, y: (1 - mu) * 50 });
	const joined = P2_JOIN.filter((j) => u >= j.u);
	const names = ["Casey", ...joined.map((j) => j.name)];
	setText(P.incount, `In (${names.length}/6)`);
	setText(P.innames, names.join(", "));
	const last = joined.length ? joined[joined.length - 1].u : -9;
	const fl = decay(u, last, 5);
	P.inField.style.background = `rgba(46,204,113,${(0.22 * fl).toFixed(3)})`;
	P.inField.style.boxShadow = fl > 0.02 ? `0 0 0 2px rgba(46,204,113,${(0.7 * fl).toFixed(3)})` : "";
	T(P.edited, { o: joined.length ? pr(u, P2_JOIN[0].u, 0.2, Ez.lin) : 0 });
	T(P.embed, { s: 1 + 0.012 * fl });
	const ru = pr(u, P2_REMIND_T, 0.35, Ez.oe);
	T(P.remind, { o: ru, y: (1 - ru) * 30 });
}

function renderP3(P, u) {
	const cu = pr(u, 0.08, 0.4, Ez.oe);
	T(P.card, { o: cu, y: (1 - cu) * 30 });
	const c2 = pr(u, 0.22, 0.4, Ez.oe);
	T(P.card2, { o: c2 * 0.85, y: (1 - c2) * 30 });
	const tu = pr(u, P3_GUEST_T, 0.4, Ez.oe) * (1 - pr(u, P3_GUEST_T + 1.1, 0.3, Ez.ic));
	T(P.toast, { o: tu, y: (1 - pr(u, P3_GUEST_T, 0.4, Ez.oe)) * -40, x: 0 });
	const show = [true, true, true, u >= P3_GUEST_T + 0.15, u >= P3_IN_T + 0.05];
	P.faceEls.forEach((f, k) => {
		const t0 = k === 3 ? P3_GUEST_T + 0.15 : k === 4 ? P3_IN_T + 0.05 : 0;
		const s = k < 3 ? 1 : pr(u, t0, 0.3, (x) => Ez.ob(x, 2.6));
		T(f, { s, o: show[k] ? 1 : 0 });
	});
	const n = show.filter(Boolean).length;
	setText(P.rcount, `${n} in · ${6 - n} seat${6 - n === 1 ? "" : "s"} left`);
	const pressed = u >= P3_IN_T;
	P.yes.classList.toggle("on", pressed);
	T(P.yes, { s: pressed ? 1 - 0.08 * decay(u, P3_IN_T, 14) + 0.05 * spr(u, P3_IN_T + 0.05, 3, 9) : 1 });
}

function renderP4(P, u) {
	P.cw.forEach((c, k) => {
		const cu = pr(u, 0.08 + k * 0.06, 0.3, Ez.oe);
		T(c, { o: cu, y: (1 - cu) * 16 });
		c.classList.toggle("on", u >= 0.2 + k * 0.06);
	});
	P.st.forEach((s, k) => {
		const on = k < 4 && u >= P4_STARS[k];
		s.classList.toggle("on", on);
		T(s, { s: on ? 1 + 0.35 * Math.max(0, spr(u, P4_STARS[k], 3, 8)) : 1 });
	});
	setText(P.srate, u >= P4_STARS[3] ? "4 / 5" : "");
	const r = typed(P4_RECAP, u, P4_RECAP_T);
	setText(P.rq, r || "One line about it (optional)");
	P.rq.style.color = r ? "" : "#5d6676";
	const typing = u > P4_RECAP_T(0) - 0.05 && u < P4_RECAP_T(P4_RECAP.length - 1) + 0.08;
	P.recap.classList.toggle("focus", typing);
	P.rcaret.style.opacity = typing ? "1" : "0";
	P.tog.classList.toggle("on", u >= P4_REPEAT_T);
	const ku = pr(u, P4_STATS_T, 0.4, Ez.oq);
	T(P.kpis, { o: pr(u, P4_STATS_T - 0.05, 0.2, Ez.lin), y: (1 - pr(u, P4_STATS_T - 0.05, 0.4, Ez.oe)) * 20 });
	setText(P.k[0], String(Math.round(12 * ku)));
	setText(P.k[1], `${Math.round(31 * ku)} h`);
	setText(P.k[2], (4.4 * ku).toFixed(1));
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
	setText(R.meta, decode("OPEN SOURCE · SESSIONS · DISCORD · VIDEO GAMES · TTRPGS · BOARD GAMES", pr(t, 14.15, 0.5, Ez.lin), t, 21));
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
