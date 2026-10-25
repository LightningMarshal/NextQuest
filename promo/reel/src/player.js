/* Player shell for the reel + hooks for the frame exporter (window.REEL). */
"use strict";

(function () {
	const vp = document.getElementById("viewport");
	const stage = document.getElementById("stage");
	const btn = document.getElementById("play");
	const scrub = document.getElementById("scrub");
	const fill = document.getElementById("scrubFill");
	const time = document.getElementById("time");
	const exportMode = /[?&]export\b/.test(location.search);
	if (exportMode) {
		vp.classList.add("export");
		document.body.classList.add("export");
	}

	function fit() {
		const s = exportMode ? 1 : vp.clientWidth / 1920;
		stage.style.transform = `scale(${s})`;
	}
	window.addEventListener("resize", fit);
	fit();

	let actx = null;
	let src = null;
	let playing = false;
	let startAt = 0;
	let pausedT = 0;
	let raf = 0;
	let audio = null;

	const ready = (async () => {
		await Promise.all([
			document.fonts.load("800 100px 'Unbounded'"),
			document.fonts.load("600 20px 'Geist'"),
			document.fonts.load("500 20px 'Geist Mono'"),
		]);
		buildReel();
		initCanvases();
		layoutReel();
		render(14.9);
		if (!exportMode) audio = await buildReelSoundtrack();
	})();

	const now = () => (playing ? Math.min(REEL_DUR, actx.currentTime - startAt) : pausedT);
	function tick() {
		const t = now();
		render(t);
		fill.style.width = `${(t / REEL_DUR) * 100}%`;
		time.textContent = `${t.toFixed(1)} / ${REEL_DUR.toFixed(1)}`;
		if (playing && t >= REEL_DUR) return stop(REEL_DUR);
		if (playing) raf = requestAnimationFrame(tick);
	}
	function start(from) {
		actx ??= new AudioContext();
		if (actx.state === "suspended") actx.resume();
		if (src) src.stop();
		src = actx.createBufferSource();
		src.buffer = audio;
		src.connect(actx.destination);
		const t0 = actx.currentTime + 0.05;
		src.start(t0, from);
		startAt = t0 - from;
		playing = true;
		btn.textContent = "PAUSE";
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(tick);
	}
	function stop(at) {
		pausedT = at ?? now();
		playing = false;
		btn.textContent = pausedT >= REEL_DUR ? "REPLAY" : "PLAY WITH SOUND";
		if (src) {
			src.stop();
			src = null;
		}
		cancelAnimationFrame(raf);
		tick();
	}
	async function toggle() {
		if (playing) return stop();
		btn.textContent = "LOADING…";
		await ready;
		start(pausedT >= REEL_DUR - 0.05 ? 0 : pausedT);
	}
	btn.addEventListener("click", toggle);
	scrub.addEventListener("click", async (e) => {
		await ready;
		const r = scrub.getBoundingClientRect();
		const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * REEL_DUR;
		if (playing) start(t);
		else {
			pausedT = t;
			tick();
		}
	});
	window.addEventListener("keydown", (e) => {
		if (e.code === "Space") {
			e.preventDefault();
			toggle();
		}
	});

	window.REEL = {
		ready,
		duration: REEL_DUR,
		frame(t) {
			render(t);
		},
		async wavBase64() {
			const ab = await buildReelSoundtrack();
			const u = new Uint8Array(encodeWav(ab));
			let s = "";
			for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
			return btoa(s);
		},
	};
})();
