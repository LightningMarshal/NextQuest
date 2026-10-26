/* NextQuest walkthrough: 70 s, composited from screenshots of the real app.
 *
 * Everything on screen is a pure function of time — render(t) — so realtime
 * playback and the frame-stepped export are identical. The screenshots, tap
 * boxes and Discord embeds come from captures/manifest.json (capture.mjs),
 * injected by build.mjs as WALK_DATA; this file only stages them.
 */
"use strict";

const WALK_DUR = 70.0;
const DATA = window.WALK_DATA;
const SHOTS = DATA.manifest.shots;

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
	ob: (t, s = 1.7) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
};
const pr = (t, t0, d, e = Ez.ioc) => (d <= 0 ? (t >= t0 ? 1 : 0) : e(cl((t - t0) / d)));
const decay = (t, t0, k = 8) => (t < t0 ? 0 : Math.exp(-k * (t - t0)));
const hsh = (n) => {
	const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
	return x - Math.floor(x);
};
const noise1 = (x) => {
	const i = Math.floor(x);
	const f = x - i;
	return mix(hsh(i), hsh(i + 1), f * f * (3 - 2 * f)) * 2 - 1;
};
/** In-window envelope: fades in over `a` from t0, out over `b` ending at t1. */
const win = (t, t0, t1, a = 0.4, b = 0.4) => pr(t, t0, a, Ez.oc) * (1 - pr(t, t1 - b, b, Ez.ic));

// ------------------------------------------------------------------ timeline
// Narration cues (seconds). Line lengths come from the audio files.
const CUES = { chat1: 0.7, chat2: 3.6, logo: 7.7, post1: 10.5, post2: 13.9, disc1: 22.5, disc2: 25.5, join1: 34.4, join2: 38.6, wrap1: 48.4, wrap2: 51.7, more1: 60.3, end1: 66.6, end2: 67.7 };
const NO_CAPTION = new Set(["logo", "end1", "end2"]); // already on screen as the logo / end card

const CHAPTERS = [
	{ t: 10, end: 22, kicker: "01 / 05 · Post", head: ["Post in", "<em>three taps</em>"], steps: ["Pick the game", "Tap a time", "Choose who can join", "Posted. You're in."], ticks: [14.0, 15.2, 16.3, 20.2] },
	{ t: 22, end: 34, kicker: "02 / 05 · Discord", head: ["Discord", "<em>keeps up</em>"], steps: ["One live card", "Edited as friends join", "Reminders before it starts"], ticks: [22.8, 26.0, 29.3] },
	{ t: 34, end: 48, kicker: "03 / 05 · The circle", head: ["Friends", "<em>hop in</em>"], steps: ["Invite link or Discord", "Sees open sessions", "I'm in. Calendar."], ticks: [36.6, 38.8, 41.7], side: "right" },
	{ t: 48, end: 60, kicker: "04 / 05 · Wrap-up", head: ["Wrap up in", "<em>ten seconds</em>"], steps: ["Who came", "How it went", "Same time next week?"], ticks: [50.8, 52.2, 53.8] },
	{ t: 60, end: 66.2, kicker: "05 / 05 · And more", head: ["Everything", "<em>around it</em>"], steps: ["Library + I'd play this", "Find-a-time polls", "Stats for your group"], ticks: [60.8, 63.4, 64.4] },
];

// Phone sequences: [shot, start] / [time, shot whose tap box to press] / camera [time, zoom, focus y].
const PHONES = [
	{
		t0: 10.0, t1: 22.0, x: 1260,
		shots: [["post-00-home", 10.0], ["post-01-composer", 11.4], ["post-02-game", 14.0], ["post-03-when", 15.2], ["post-04-open", 16.3], ["post-05-details", 18.6], ["post-06-posted", 20.2]],
		taps: [[11.0, "post-00-home"], [13.7, "post-01-composer"], [14.95, "post-03-when"], [16.05, "post-04-open"], [19.85, "post-05-details"]],
		cam: [[10.0, 1, 300], [11.4, 1.1, 330], [16.2, 1.08, 470], [18.6, 1.0, 422], [20.2, 1.06, 330]],
	},
	{
		t0: 34.0, t1: 48.0, x: 590,
		shots: [["join-00-invite", 34.0], ["join-01-guest-home", 36.9], ["join-02-session", 39.7], ["join-03-in", 40.7]],
		taps: [[36.5, "join-00-invite"], [39.4, "join-01-guest-home"], [40.4, "join-02-session"], [41.6, "join-03-in"]],
		cam: [[34.0, 1.14, 200], [36.9, 1.0, 422], [39.7, 1.06, 480], [41.4, 1.1, 560]],
	},
	{
		t0: 48.0, t1: 60.0, x: 1260,
		shots: [["wrap-00-ended", 48.0], ["wrap-01-form", 50.0], ["wrap-02-ticked", 50.8], ["wrap-03-stars", 52.2], ["wrap-04-recap", 53.0], ["wrap-05-next", 53.8], ["wrap-06-played", 55.2], ["wrap-07-recent", 57.2]],
		taps: [[50.6, "wrap-01-form"], [52.0, "wrap-03-stars"], [52.8, "wrap-04-recap"], [53.6, "wrap-05-next"]],
		cam: [[48.0, 1.0, 422], [50.0, 1.1, 330], [53.4, 1.1, 440], [55.2, 1.0, 422], [57.2, 1.04, 300]],
	},
];
const WRAP_CLOCK = [50.0, 55.2]; // the stopwatch runs while the form is filled in

const DESK = {
	t0: 60.0, t1: 66.2,
	shots: [["more-01-library", 60.0, "/backlog"], ["more-02-game", 61.9, "/backlog/elden-ring"], ["more-03-keen", 62.8, "/backlog/elden-ring"], ["more-04-poll", 63.4, "/sessions/plan"], ["more-05-stats", 64.4, "/stats"]],
	taps: [[62.6, "more-02-game"]],
};

// Discord: the real embeds after each RSVP, swapped in place like Discord edits.
const DISCORD = { t0: 22.0, t1: 34.0, states: [["posted", 22.0], ["+drew", 25.9], ["+jordan", 27.3]], reminder: 29.2 };
const TOASTS = [
	{ t: 25.6, name: "Drew Kaplan", what: "is in", until: 27.1 },
	{ t: 27.0, name: "Jordan Lee", what: "is in", until: 28.9 },
	{ t: 44.2, name: "Frankie Moss", what: "is in · guest", until: 47.6 },
];
const MINI = { t0: 42.9, t1: 48.0, from: "+jordan", to: "+frankie", at: 44.4 };
const STEPS_OUT = { 34: 42.6 }; // chapter start → when its steps fade for the mini card

const CHAT = [
	["Casey", "anyone on tonight?"], ["Drew", "what are we playing"], ["Sam", "helldivers?"], ["Jordan", "i'm down after 9"],
	["Riley", "who's in"], ["Alex", "link?"], ["Brooke", "sorry just saw this"], ["Frankie", "can't tonight 😩"],
	["Casey", "tomorrow?"], ["Sam", "lethal company again?"], ["Drew", "need one more for 4"], ["Jordan", "what time"],
	["Riley", "8?"], ["Alex", "9 works"], ["Brooke", "wait which server"], ["Casey", "is this still happening"],
	["Sam", "who has the discord link"], ["Drew", "nvm"], ["Frankie", "im on now"], ["Jordan", "where is everyone"],
	["Riley", "rip"], ["Alex", "next week then"], ["Brooke", "ok what time saturday"], ["Casey", "anyone??"],
	["Sam", "hello?"], ["Drew", "i'll be on later maybe"], ["Jordan", "does anyone own it"], ["Alex", "pinging again"],
];
const PEOPLE = { Alex: "#5aa8ff", Brooke: "#34d1e6", Casey: "#8b7cff", Drew: "#ffc94a", Jordan: "#ff6b6b", Sam: "#3fcf8e", Frankie: "#ff8fb1", Riley: "#f2994a" };

// ------------------------------------------------------------------ SVG
const CHEV_SVG = (sw = 6) =>
	`<svg viewBox="0 0 58 58"><polyline class="c1" points="14,16 26,29 14,42" fill="none" stroke="#e7ebf1" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="36" stroke-dashoffset="0"/><polyline class="c2" points="28,16 40,29 28,42" fill="none" stroke="#34d1e6" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="36" stroke-dashoffset="0"/></svg>`;
const SVG_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17 19 7"/></svg>';
const SVG_HASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 9h15M4 15h15M10 3 8 21M16 3l-2 18"/></svg>';
const face = (name, size = 44) =>
	`<i class="face" style="width:${size}px;height:${size}px;background:${PEOPLE[name.split(" ")[0]] ?? "#e7ebf1"};font-size:${Math.round(size * 0.44)}px">${name[0]}</i>`;

// ------------------------------------------------------------------ DOM
const R = {};
function h(html) {
	const d = document.createElement("div");
	d.innerHTML = html.trim();
	return d.firstElementChild;
}
function add(parent, html) {
	const el = h(html);
	parent.appendChild(el);
	return el;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const letters = (text, cls) => [...text].map((c) => `<span class="mask"><span class="${cls}">${c === " " ? "&nbsp;" : c}</span></span>`).join("");
const wordsMasked = (html) =>
	html
		.replace(/<em>(.*?)<\/em>/g, (_, s) => s.split(" ").map((w) => `<em>${w}</em>`).join(" "))
		.split(" ")
		.map((w) => `<span class="mask"><span class="wd">${w}</span></span>`)
		.join('<span style="display:inline-block;width:0.26em"></span>');

function T(el, o) {
	const s = el.style;
	const op = o.o ?? 1;
	if (op <= 0.001) {
		if (s.display !== "none") s.display = "none";
		return;
	}
	if (s.display === "none") s.display = "";
	s.opacity = op >= 0.999 ? "" : op.toFixed(3);
	s.transform = `translate3d(${(o.x ?? 0).toFixed(2)}px,${(o.y ?? 0).toFixed(2)}px,${(o.z ?? 0).toFixed(2)}px) rotateX(${(o.rx ?? 0).toFixed(3)}deg) rotateY(${(o.ry ?? 0).toFixed(3)}deg) rotateZ(${(o.rz ?? 0).toFixed(3)}deg) scale(${(o.s ?? 1).toFixed(4)})`;
	s.filter = o.blur && o.blur > 0.05 ? `blur(${o.blur.toFixed(2)}px)` : "";
}
const hide = (el) => {
	if (el.style.display !== "none") el.style.display = "none";
};

// ------------------------------------------------------------------ Discord text
const tz = DATA.manifest.tz;
const fmt = (opts) => new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts });
const dayKey = (ms) => fmt({ year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
function discordStamp(sec, style, nowMs) {
	const ms = sec * 1000;
	if (style === "R") {
		const mins = Math.round((ms - nowMs) / 60000);
		if (Math.abs(mins) < 45) return mins >= 0 ? `in ${mins} minutes` : `${-mins} minutes ago`;
		const hrs = Math.round(mins / 60);
		const n = Math.abs(hrs);
		const span = n === 1 ? "an hour" : `${n} hours`;
		return hrs >= 0 ? `in ${span}` : `${span} ago`;
	}
	return `${fmt({ weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(ms)} at ${fmt({ hour: "numeric", minute: "2-digit" }).format(ms)}`;
}
function discordMd(text, nowMs) {
	return esc(text)
		.replace(/&lt;t:(\d+):([FR])&gt;/g, (_, s, st) => `<span class="ts-chip">${discordStamp(Number(s), st, nowMs)}</span>`)
		.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
		.replace(/(https?:\/\/[^\s]+?)([.,]?)(?=\s|$)/g, '<a>$1</a>$2');
}
const msgTime = (ms) => `${dayKey(ms) === dayKey(Date.parse(DATA.manifest.capturedAt)) ? "Today" : fmt({ month: "numeric", day: "numeric", year: "numeric" }).format(ms)} at ${fmt({ hour: "numeric", minute: "2-digit" }).format(ms)}`;

function embedHtml(state, nowMs) {
	const e = state.embed;
	const color = `#${e.color.toString(16).padStart(6, "0")}`;
	const art = e.thumbnail && DATA.art[e.thumbnail.url];
	const fields = e.fields
		.map((f) => `<div class="field${f.inline ? " inline" : ""}" data-name="${esc(f.name.split(" ")[0])}"><div class="flash"></div><div class="fname">${discordMd(f.name, nowMs)}</div><div class="fval">${discordMd(f.value, nowMs)}</div></div>`)
		.join("");
	return `<div class="embed" style="border-left-color:${color}"><div class="title">${esc(e.title)}</div>${art ? `<img class="thumb" src="${art}">` : ""}${e.description ? `<div class="desc">${discordMd(e.description, nowMs)}</div>` : ""}<div class="fields">${fields}</div>${e.footer ? `<div class="foot">${esc(e.footer.text)}</div>` : ""}</div>`;
}
function botMessage(timeMs) {
	return `<div class="msg"><div class="av">${CHEV_SVG(5)}</div><div><div class="who">NextQuest <span class="app">APP</span> <span class="ts">${msgTime(timeMs)}</span></div><div class="body"></div></div></div>`;
}
const dcState = (name) => DATA.manifest.discord.find((d) => d.name === name);

// ------------------------------------------------------------------ build
function buildWalk() {
	const world = document.getElementById("world");
	R.world = world;
	R.bg = document.getElementById("bg");
	R.cap = document.querySelector("#cap span");
	R.flash = document.getElementById("flash");
	const bar = document.getElementById("bar");
	R.bar = bar;
	R.barFill = CHAPTERS.map(() => add(bar, "<i><b></b></i>").firstChild);

	// --- 0: the group chat
	R.wall = add(world, '<div class="abs" style="left:960px;top:540px"></div>');
	R.bubbles = CHAT.map(([who, text], i) => {
		const col = i % 3;
		const row = Math.floor(i / 3);
		const el = add(R.wall, `<div class="abs bubble">${face(who, 52)}<div><span class="n">${who}</span><div class="b">${esc(text)}</div></div></div>`);
		return { el, x: -760 + col * 520 + (row % 2) * 70 + hsh(i) * 60, y: -420 + row * 150, t: 0.25 + Math.pow(i / CHAT.length, 0.8) * 6.2 };
	});
	R.badge = add(world, '<div class="abs" style="left:1560px;top:250px"><div class="badge" style="transform:translate(-50%,-50%)">3</div></div>');
	R.badgeNum = R.badge.firstChild;
	R.ask = add(world, `<div class="abs" style="left:960px;top:540px"><div class="headline" style="font-size:118px;transform:translate(-50%,-50%);text-align:center">${wordsMasked("Anyone on")}<br>${wordsMasked("<em>tonight?</em>")}</div></div>`);
	R.askWords = [...R.ask.querySelectorAll(".wd")];
	R.logo = buildLogo(world, 470, 220, 150);
	R.logoSub = add(world, '<div class="abs" style="left:960px;top:640px"><div class="kicker" style="transform:translateX(-50%);color:#8a93a3;font-size:26px">Play more games, with more people</div></div>');

	// --- chapter titles + steps
	R.chapters = CHAPTERS.map((c) => {
		const x = c.side === "right" ? 1000 : 150;
		const root = add(world, `<div class="abs" style="left:${x}px;top:0"></div>`);
		const kicker = add(root, `<div class="abs kicker" style="top:196px">${c.kicker}</div>`);
		const head = add(root, `<div class="abs headline" style="top:250px">${c.head.map(wordsMasked).join("<br>")}</div>`);
		const steps = add(root, `<div class="abs steps" style="top:500px">${c.steps.map((s) => `<div class="step"><span class="box"><i class="fillc"></i>${SVG_CHECK}</span><span class="lbl">${esc(s)}<b>${esc(s)}</b></span></div>`).join("")}</div>`);
		const items = [...steps.children].map((el) => ({ el, fill: el.querySelector(".fillc"), svg: el.querySelector("svg"), lit: el.querySelector(".lbl b") }));
		return { ...c, root, kicker, head, words: [...head.querySelectorAll(".wd")], steps, items };
	});
	R.clock = add(world, '<div class="abs" style="left:150px;top:760px"><div class="headline" style="font-family:\'JetBrains Mono\',monospace;font-size:96px;font-weight:700;letter-spacing:0">0:00</div></div>');
	R.clockNum = R.clock.firstChild;

	// --- phones
	R.phones = PHONES.map((seq) => buildPhone(world, seq));

	// --- Discord
	const capMs = Date.parse(DATA.manifest.capturedAt);
	const start = Date.parse(dcState("posted").scheduledAt);
	R.dc = add(world, `<div class="abs" style="left:840px;top:110px"><div class="dc"><div class="chan">${SVG_HASH}game-night</div><div class="msgs"></div></div></div>`);
	const msgs = R.dc.querySelector(".msgs");
	R.dcMsg = add(msgs, botMessage(capMs));
	R.dcBody = R.dcMsg.querySelector(".body");
	R.dcEmbeds = DISCORD.states.map(([name]) => embedHtml(dcState(name), capMs));
	R.dcRem = add(msgs, botMessage(start - 3600 * 1000));
	R.dcRem.querySelector(".body").innerHTML = `<div class="text">${discordMd(dcState("+jordan").reminder, start - 3600 * 1000)}</div>`;
	R.dcShown = -1;
	R.mini = add(world, `<div class="abs" style="left:1000px;top:540px"><div class="dc" style="width:820px"><div class="msgs"></div></div></div>`);
	const miniMsg = add(R.mini.querySelector(".msgs"), botMessage(capMs));
	R.miniBody = miniMsg.querySelector(".body");
	R.miniEmbeds = [embedHtml(dcState(MINI.from), capMs), embedHtml(dcState(MINI.to), capMs)];
	R.miniShown = -1;
	R.toasts = TOASTS.map((o) => ({ ...o, el: add(world, `<div class="abs toast">${face(o.name, 48)}<span>${esc(o.name.split(" ")[0])} <span class="ok">${esc(o.what)}</span></span></div>`) }));

	// --- desktop
	R.desk = add(world, '<div class="abs" style="left:1290px;top:470px"></div>');
	const browser = add(R.desk, '<div class="browser" style="position:absolute;left:-720px;top:-476px"><div class="bar"><i></i><i></i><i></i><div class="url"></div></div><div class="view"></div></div>');
	R.deskUrl = browser.querySelector(".url");
	const view = browser.querySelector(".view");
	R.deskCam = add(view, '<div class="cam" style="width:1440px;height:900px"></div>');
	R.deskShots = DESK.shots.map(([name]) => add(R.deskCam, `<div class="shot"><img src="${DATA.captures}${name}.png"></div>`));
	R.deskRing = add(R.deskCam, '<div class="ring"></div>');
	R.deskTap = add(R.deskCam, '<div class="tap"><i class="wave"></i><i class="dot"></i></div>');

	// --- end card
	R.end = buildLogo(world, 420, 200, 136);
	R.endLine = add(world, `<div class="abs" style="left:960px;top:610px"><div class="tagline" style="transform:translateX(-50%)">${wordsMasked("Play more games,")} ${wordsMasked("<em>with more people.</em>")}</div></div>`);
	R.endWords = [...R.endLine.querySelectorAll(".wd")];
	R.endUrl = add(world, `<div class="abs" style="left:960px;top:730px"><div class="url" style="transform:translateX(-50%)">${esc(DATA.repoUrl)}</div></div>`);

	// captions: split long lines at punctuation, timed by length
	R.captions = [];
	for (const line of DATA.lines) {
		if (NO_CAPTION.has(line.id)) continue;
		const text = line.caption ?? line.text;
		const t0 = CUES[line.id];
		const dur = DATA.durs[line.id];
		const parts = text.length > 56 ? text.split(/(?<=[,:?])\s+/).reduce((acc, p) => (acc.length && (acc[acc.length - 1] + " " + p).length <= 56 ? [...acc.slice(0, -1), acc[acc.length - 1] + " " + p] : [...acc, p]), []) : [text];
		const total = parts.reduce((n, p) => n + p.length, 0);
		let at = t0;
		for (const p of parts) {
			const d = (dur * p.length) / total;
			R.captions.push({ text: p, t0: at, t1: at + d + 0.25 });
			at += d;
		}
	}
}

function buildLogo(world, y, markSize, fontSize) {
	const root = add(world, `<div class="abs" style="left:960px;top:${y}px;width:0;height:0"></div>`);
	const group = add(root, '<div class="abs"></div>');
	const mark = add(group, `<div class="mark" style="width:${markSize}px;height:${markSize}px">${CHEV_SVG(6)}</div>`);
	const wm = add(group, `<div class="wm" style="font-size:${fontSize}px">${letters("Next", "n")}${letters("Quest", "q")}</div>`);
	return { root, group, mark, wm, markSize, fontSize, chars: [...wm.querySelectorAll(".n,.q")], c1: mark.querySelector(".c1"), c2: mark.querySelector(".c2") };
}
function layoutLogo(L) {
	const gap = L.markSize * 0.22;
	const total = L.markSize + gap + L.wm.offsetWidth;
	L.mark.style.left = `${-total / 2}px`;
	L.mark.style.top = `${-L.markSize / 2}px`;
	L.wm.style.left = `${-total / 2 + L.markSize + gap}px`;
	L.wm.style.top = `${-L.fontSize * 0.62}px`;
}
function layoutWalk() {
	layoutLogo(R.logo);
	layoutLogo(R.end);
}

function buildPhone(world, seq) {
	const root = add(world, `<div class="abs" style="left:${seq.x}px;top:471px"></div>`);
	const phone = add(root, '<div class="phone" style="position:absolute;left:-209px;top:-436px"><div class="screen"><div class="cam"></div></div></div>');
	const cam = phone.querySelector(".cam");
	const shots = seq.shots.map(([name]) => add(cam, `<div class="shot"><img src="${DATA.captures}${name}.png"></div>`));
	const ring = add(cam, '<div class="ring"></div>');
	const tap = add(cam, '<div class="tap"><i class="wave"></i><i class="dot"></i></div>');
	return { seq, root, cam, shots, ring, tap, wave: tap.firstChild, dot: tap.lastChild };
}

// ------------------------------------------------------------------ render
function renderShots(els, list, t) {
	let active = -1;
	for (let i = 0; i < list.length; i++) if (t >= list[i][1]) active = i;
	active = Math.max(0, active);
	const settled = t >= list[active][1] + 0.3;
	els.forEach((el, i) => {
		if (i > active || (settled && i < active) || (i < active - 1)) return hide(el);
		el.style.display = "";
		el.style.opacity = i === active && i > 0 ? pr(t, list[i][1], 0.28).toFixed(3) : "";
	});
	return active;
}

function renderTap(ring, tapEl, taps, t) {
	const tp = taps.find(([tt]) => t > tt - 0.6 && t < tt + 0.7);
	if (!tp) {
		hide(ring);
		hide(tapEl);
		return;
	}
	const [tt, name] = tp;
	const b = SHOTS[name].tap;
	if (!b) return;
	const pad = 5;
	ring.style.left = `${b.x - pad}px`;
	ring.style.top = `${b.y - pad}px`;
	ring.style.width = `${b.w + pad * 2}px`;
	ring.style.height = `${b.h + pad * 2}px`;
	const ro = pr(t, tt - 0.55, 0.2) * (1 - pr(t, tt + 0.2, 0.35));
	T(ring, { o: ro, s: mix(1.12, 1, pr(t, tt - 0.55, 0.3, Ez.oc)) });
	ring.style.transformOrigin = "50% 50%";
	tapEl.style.left = `${b.x + b.w / 2}px`;
	tapEl.style.top = `${b.y + b.h / 2}px`;
	tapEl.style.display = "";
	const dot = tapEl.lastChild;
	const wave = tapEl.firstChild;
	const dOp = pr(t, tt - 0.35, 0.15) * (1 - pr(t, tt + 0.2, 0.3));
	const press = 1 - 0.28 * Math.exp(-Math.pow((t - tt) / 0.08, 2));
	dot.style.opacity = dOp.toFixed(3);
	dot.style.transform = `scale(${press.toFixed(3)})`;
	const k = cl((t - tt) / 0.55);
	wave.style.opacity = t < tt ? "0" : (1 - k).toFixed(3);
	wave.style.transform = `scale(${(0.5 + 1.7 * Ez.oc(k)).toFixed(3)})`;
}

function camAt(keys, t) {
	let s = keys[0][1];
	let fy = keys[0][2];
	for (const [kt, ks, kf] of keys) {
		const e = pr(t, kt, 1.0);
		s = mix(s, ks, e);
		fy = mix(fy, kf, e);
	}
	return { s, fy };
}

function renderPhone(P, t) {
	const { seq } = P;
	if (t < seq.t0 - 0.05 || t > seq.t1 + 0.05) return hide(P.root);
	const enter = pr(t, seq.t0, 0.9, Ez.oq);
	const exit = pr(t, seq.t1 - 0.6, 0.6, Ez.ic);
	const dir = seq.x > 960 ? 1 : -1;
	T(P.root, {
		o: cl(enter * 1.6) * (1 - exit),
		x: dir * (1 - enter) * 160 - dir * exit * 120,
		y: (1 - enter) * 120 + exit * 30,
		z: -exit * 200,
		ry: dir * -10 * (1 - enter) + dir * -4 + noise1(t * 0.35 + seq.t0) * 1.6,
		rx: 2 + noise1(t * 0.3 + 9) * 1.2,
		s: 0.92 * (0.92 + 0.08 * enter),
	});
	renderShots(P.shots, seq.shots, t);
	const { s, fy } = camAt(seq.cam, t);
	// keep the left edge (where labels start) in frame when zoomed
	const tx = cl(175 - 175 * s, 390 - 390 * s, 0);
	const ty = cl(422 - fy * s, 844 - 844 * s, 0);
	P.cam.style.transform = `translate(${tx.toFixed(2)}px,${ty.toFixed(2)}px) scale(${s.toFixed(4)})`;
	renderTap(P.ring, P.tap, seq.taps, t);
}

function renderChapter(C, t) {
	if (t < C.t - 0.05 || t > C.end + 0.05) return hide(C.root);
	C.root.style.display = "";
	const exit = pr(t, C.end - 0.55, 0.5, Ez.ic);
	const dir = C.side === "right" ? 1 : -1;
	C.root.style.opacity = (1 - exit).toFixed(3);
	C.root.style.transform = `translateX(${(dir * exit * 80).toFixed(1)}px)`;
	T(C.kicker, { o: pr(t, C.t + 0.15, 0.4), x: (1 - pr(t, C.t + 0.15, 0.6, Ez.oq)) * -30 });
	C.words.forEach((w, i) => {
		const e = pr(t, C.t + 0.25 + i * 0.08, 0.7, Ez.oq);
		w.style.transform = `translateY(${((1 - e) * 110).toFixed(1)}%)`;
	});
	C.items.forEach((it, i) => {
		const appear = pr(t, C.t + 0.7 + i * 0.12, 0.5, Ez.oq) * (STEPS_OUT[C.t] ? 1 - pr(t, STEPS_OUT[C.t] + i * 0.06, 0.35) : 1);
		it.el.style.opacity = appear.toFixed(3);
		it.el.style.transform = `translateX(${((1 - appear) * -24).toFixed(1)}px)`;
		const tick = C.ticks[i];
		const f = pr(t, tick, 0.28, Ez.oq);
		it.fill.style.transform = `scale(${f.toFixed(3)})`;
		it.svg.style.opacity = f.toFixed(3);
		it.svg.style.transform = `scale(${(0.6 + 0.4 * Ez.ob(f)).toFixed(3)})`;
		it.lit.style.clipPath = `inset(0 ${((1 - pr(t, tick, 0.45, Ez.oc)) * 100).toFixed(1)}% 0 0)`;
		const glow = decay(t, tick, 3);
		it.el.style.textShadow = glow > 0.02 ? `0 0 ${(24 * glow).toFixed(1)}px rgba(52,209,230,${(0.8 * glow).toFixed(2)})` : "";
	});
}

function renderLogo(L, t, t0, tOut) {
	if (t < t0 - 0.05 || t > tOut + 0.05) return hide(L.root);
	L.root.style.display = "";
	const ms = pr(t, t0, 0.7, Ez.ob);
	T(L.mark, { s: mix(0.4, 1, ms), o: pr(t, t0, 0.15), rz: (1 - ms) * -20 });
	L.mark.style.transformOrigin = "50% 50%";
	const d1 = 36 * (1 - pr(t, t0 + 0.1, 0.45, Ez.oc));
	const d2 = 36 * (1 - pr(t, t0 + 0.25, 0.45, Ez.oc));
	L.c1.setAttribute("stroke-dashoffset", d1.toFixed(1));
	L.c2.setAttribute("stroke-dashoffset", d2.toFixed(1));
	L.chars.forEach((c, i) => {
		const e = pr(t, t0 + 0.2 + i * 0.035, 0.55, Ez.oq);
		c.style.transform = `translateY(${((1 - e) * 105).toFixed(1)}%)`;
	});
	return L;
}

function renderDiscord(t) {
	const { t0, t1 } = DISCORD;
	if (t < t0 - 0.05 || t > t1 + 0.05) {
		hide(R.dc);
	} else {
		const enter = pr(t, t0, 0.9, Ez.oq);
		const exit = pr(t, t1 - 0.6, 0.6, Ez.ic);
		T(R.dc, { o: cl(enter * 1.5) * (1 - exit), x: (1 - enter) * 180 + exit * 120, y: (1 - enter) * 60, z: -exit * 200, ry: -8 + (1 - enter) * -10 + noise1(t * 0.3) * 1.2, rx: 3 });
		let st = 0;
		DISCORD.states.forEach(([, at], i) => {
			if (t >= at) st = i;
		});
		if (st !== R.dcShown) {
			R.dcBody.innerHTML = R.dcEmbeds[st];
			R.dcShown = st;
		}
		const flash = R.dcBody.querySelector('.field[data-name="In"] .flash');
		const fa = st > 0 ? decay(t, DISCORD.states[st][1], 2.2) : 0;
		flash.style.opacity = fa.toFixed(3);
		const embed = R.dcBody.firstChild;
		embed.style.boxShadow = fa > 0.02 ? `0 0 ${(40 * fa).toFixed(0)}px rgba(52,209,230,${(0.35 * fa).toFixed(2)})` : "";
		const r = pr(t, DISCORD.reminder, 0.5, Ez.oq);
		T(R.dcRem, { o: r, y: (1 - r) * 40 });
	}
	if (t < MINI.t0 - 0.05 || t > MINI.t1 + 0.05) {
		hide(R.mini);
	} else {
		const enter = pr(t, MINI.t0, 0.8, Ez.oq);
		const exit = pr(t, MINI.t1 - 0.6, 0.6, Ez.ic);
		T(R.mini, { o: enter * (1 - exit), x: (1 - enter) * 120, ry: -6 + noise1(t * 0.3 + 4), s: 0.82 + 0.04 * enter });
		R.mini.style.transformOrigin = "0 0";
		const st = t >= MINI.at ? 1 : 0;
		if (st !== R.miniShown) {
			R.miniBody.innerHTML = R.miniEmbeds[st];
			R.miniShown = st;
		}
		const flash = R.miniBody.querySelector('.field[data-name="In"] .flash');
		flash.style.opacity = (st ? decay(t, MINI.at, 2.2) : 0).toFixed(3);
	}
	for (const o of R.toasts) {
		const e = win(t, o.t, o.until, 0.35, 0.35);
		const pos = o.t < 34 ? { x: 150, y: 790 } : { x: 1000, y: 456 };
		T(o.el, { o: e, x: pos.x + (1 - pr(t, o.t, 0.5, Ez.oq)) * -40, y: pos.y, s: 0.9 + 0.1 * pr(t, o.t, 0.45, Ez.ob) });
	}
}

function renderDesk(t) {
	if (t < DESK.t0 - 0.05 || t > DESK.t1 + 0.05) return hide(R.desk);
	const enter = pr(t, DESK.t0, 1.0, Ez.oq);
	const exit = pr(t, DESK.t1 - 0.6, 0.6, Ez.ic);
	T(R.desk, { o: cl(enter * 1.5) * (1 - exit), x: (1 - enter) * 200, y: (1 - enter) * 60, z: -exit * 300, ry: -12 * (1 - enter) - 5 + noise1(t * 0.3 + 2) * 1.2, rx: 3, s: 0.74 });
	const a = renderShots(R.deskShots, DESK.shots, t);
	R.deskUrl.textContent = `nextquest.example${DESK.shots[a][2]}`;
	// slow push-in per shot, toward the top-left content
	const z = 1 + 0.05 * pr(t, DESK.shots[a][1], 2.2, Ez.lin);
	R.deskCam.style.transformOrigin = "30% 20%";
	R.deskCam.style.transform = `scale(${z.toFixed(4)})`;
	renderTap(R.deskRing, R.deskTap, DESK.taps, t);
}

function renderIntro(t) {
	if (t > 10.1) {
		hide(R.wall);
		hide(R.badge);
		hide(R.ask);
		hide(R.logo.root);
		hide(R.logoSub);
		return;
	}
	// the wall: tilted, drifting up, bubbles popping in faster and faster
	const implode = pr(t, 6.9, 0.6, Ez.ic);
	T(R.wall, { rx: 22, ry: -16 + t * 0.8, rz: 4, y: -t * 26, z: -120 - t * 30 - implode * 1400, o: (1 - implode) * pr(t, 0, 0.4), blur: pr(t, 4.4, 0.8) * 6 });
	R.bubbles.forEach((b, i) => {
		const e = pr(t, b.t, 0.35, Ez.ob);
		if (t < b.t) return hide(b.el);
		T(b.el, { x: b.x, y: b.y, s: 0.6 + 0.4 * e, o: cl(e * 2) * (1 - pr(t, 4.4, 1.2) * 0.55) });
	});
	// unread badge counts up to 99+
	const n = Math.round(mix(3, 99, pr(t, 0.6, 3.6, Ez.ic)));
	R.badgeNum.textContent = t >= 4.25 ? "99+" : String(n);
	const bp = pr(t, 0.5, 0.4, Ez.ob);
	const thump = decay(t, 4.25, 6) * 0.25;
	T(R.badge, { o: bp * (1 - pr(t, 6.6, 0.4)), s: 0.7 + 0.3 * bp + thump, rz: Math.sin(t * 9) * 3 * decay(t, 4.25, 3) });
	// "Anyone on tonight?"
	if (t < 4.5 || t > 7.4) hide(R.ask);
	else {
		R.ask.style.display = "";
		const out = pr(t, 6.9, 0.45, Ez.ic);
		T(R.ask, { o: 1 - out, s: 1 + out * 0.6, blur: out * 10 });
		R.askWords.forEach((w, i) => {
			const e = pr(t, 4.6 + i * 0.16, 0.6, Ez.oq);
			w.style.transform = `translateY(${((1 - e) * 110).toFixed(1)}%)`;
		});
	}
	// logo
	const through = pr(t, 9.3, 0.7, Ez.ic);
	renderLogo(R.logo, t, 7.5, 10.0);
	T(R.logo.group, { s: 1 + through * 2.5, o: 1 - through, blur: through * 8 });
	const sub = pr(t, 8.3, 0.6, Ez.oq);
	T(R.logoSub, { o: sub * (1 - through), y: (1 - sub) * 16 });
}

function renderEnd(t) {
	if (t < 66.1) {
		hide(R.end.root);
		hide(R.endLine);
		hide(R.endUrl);
		return;
	}
	renderLogo(R.end, t, 66.5, WALK_DUR + 1);
	R.endLine.style.display = "";
	R.endWords.forEach((w, i) => {
		const e = pr(t, CUES.end2 + i * 0.16, 0.6, Ez.oq);
		w.style.transform = `translateY(${((1 - e) * 110).toFixed(1)}%)`;
	});
	const u = pr(t, 68.4, 0.6, Ez.oq);
	T(R.endUrl, { o: u, y: (1 - u) * 12 });
	const fade = pr(t, WALK_DUR - 0.5, 0.5, Ez.lin);
	R.world.style.opacity = (1 - fade).toFixed(3);
}

function render(t) {
	R.world.style.opacity = "";
	// backdrop drift
	R.bg.style.setProperty("--gx", `${(62 + 14 * noise1(t * 0.07)).toFixed(1)}%`);
	R.bg.style.setProperty("--gy", `${(36 + 12 * noise1(t * 0.06 + 3)).toFixed(1)}%`);
	R.bg.style.setProperty("--vx", `${(24 + 14 * noise1(t * 0.05 + 7)).toFixed(1)}%`);
	R.bg.style.setProperty("--vy", `${(74 + 10 * noise1(t * 0.06 + 11)).toFixed(1)}%`);

	renderIntro(t);
	R.chapters.forEach((c) => renderChapter(c, t));
	R.phones.forEach((p) => renderPhone(p, t));
	renderDiscord(t);
	renderDesk(t);

	// wrap-up stopwatch
	if (t < 48.6 || t > 60) hide(R.clock);
	else {
		const e = win(t, 48.9, 60, 0.5, 0.55);
		T(R.clock, { o: e, y: (1 - pr(t, 48.9, 0.6, Ez.oq)) * 20 });
		const secs = 9.8 * pr(t, WRAP_CLOCK[0], WRAP_CLOCK[1] - WRAP_CLOCK[0], Ez.lin);
		R.clockNum.textContent = `0:${String(Math.floor(secs)).padStart(2, "0")}.${Math.floor((secs % 1) * 10)}`;
		R.clockNum.style.color = t >= WRAP_CLOCK[1] ? "#3fcf8e" : "";
	}

	renderEnd(t);

	// captions
	const c = R.captions.find((x) => t >= x.t0 && t < x.t1);
	if (c) {
		if (R.cap.textContent !== c.text) R.cap.textContent = c.text;
		R.cap.style.display = "";
		R.cap.style.opacity = (pr(t, c.t0, 0.12) * (1 - pr(t, c.t1 - 0.12, 0.12))).toFixed(3);
	} else hide(R.cap);

	// chapter bar
	const barOn = win(t, 10, 66.2, 0.5, 0.5);
	R.bar.style.opacity = barOn.toFixed(3);
	CHAPTERS.forEach((ch, i) => {
		R.barFill[i].style.transform = `scaleX(${cl((t - ch.t) / (ch.end - ch.t)).toFixed(4)})`;
	});

	// transition flashes
	const f = 0.5 * decay(t, 7.5, 6) + [10, 22, 34, 48, 60].reduce((a, ct) => a + 0.16 * decay(t, ct, 7), 0) + 0.4 * decay(t, 66.5, 6);
	R.flash.style.opacity = f.toFixed(3);
}

/** Sound cues derived from the picture, for walk-audio.js. */
function walkEvents() {
	const ev = [];
	for (const p of PHONES) {
		p.taps.forEach(([t]) => ev.push({ t, kind: "tap" }));
		p.shots.slice(1).forEach(([, t]) => ev.push({ t, kind: "shot" }));
		ev.push({ t: p.t0, kind: "whoosh" });
	}
	DESK.taps.forEach(([t]) => ev.push({ t, kind: "tap" }));
	DESK.shots.slice(1).forEach(([, t]) => ev.push({ t, kind: "shot" }));
	ev.push({ t: DESK.t0, kind: "whoosh" }, { t: DISCORD.t0, kind: "whoosh" });
	CHAPTERS.forEach((c) => c.ticks.forEach((t) => ev.push({ t, kind: "tick" })));
	DISCORD.states.slice(1).forEach(([, t]) => ev.push({ t, kind: "ping" }));
	ev.push({ t: DISCORD.reminder, kind: "ping" }, { t: MINI.at, kind: "ping" });
	TOASTS.forEach((o) => ev.push({ t: o.t, kind: "pop" }));
	R.bubbles.forEach((b) => ev.push({ t: b.t, kind: "bubble" }));
	ev.push({ t: 4.25, kind: "thump" });
	return ev.sort((a, b) => a.t - b.t);
}
