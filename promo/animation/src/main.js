/*
 * Player shell: realtime playback synced to the pre-rendered soundtrack,
 * plus hooks used by the video exporter (window.NQ).
 */
"use strict";

(function () {
	const canvas = document.getElementById("stage");
	const ctx = canvas.getContext("2d");
	canvas.width = W;
	canvas.height = H;

	const ui = {
		overlay: document.getElementById("overlay"),
		play: document.getElementById("bigplay"),
		status: document.getElementById("status"),
		bar: document.getElementById("controls"),
		toggle: document.getElementById("toggle"),
		scrub: document.getElementById("scrub"),
		fill: document.getElementById("fill"),
		time: document.getElementById("time"),
		full: document.getElementById("full"),
		wrap: document.getElementById("wrap"),
	};

	let audioBuf = null;
	let actx = null;
	let src = null;
	let playing = false;
	let startAt = 0; // actx time when t=0
	let pausedT = 0;
	let raf = 0;

	async function narration() {
		if (window.NARRATION_B64) {
			const bin = atob(window.NARRATION_B64);
			const u = new Uint8Array(bin.length);
			for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
			return u.buffer;
		}
		const r = await fetch("assets/narration.mp3");
		return r.arrayBuffer();
	}

	const soundReady = (async () => {
		await Promise.all([
			document.fonts.load("800 40px 'Shantell Sans'"),
			document.fonts.load("700 40px 'Caveat'"),
		]);
		buildPaper();
		buildPile();
		renderFrame(ctx, 0.0);
		drawPoster();
		audioBuf = await buildSoundtrack(await narration());
		return audioBuf;
	})();

	function drawPoster() {
		// a friendly first frame behind the play button
		renderFrame(ctx, 44.6);
	}

	function now() {
		if (!playing) return pausedT;
		return Math.min(DURATION, actx.currentTime - startAt);
	}

	function fmt(t) {
		const s = Math.floor(t);
		return `0:${String(s).padStart(2, "0")}`;
	}

	function tick() {
		const t = now();
		renderFrame(ctx, t);
		ui.fill.style.width = `${(t / DURATION) * 100}%`;
		ui.time.textContent = `${fmt(t)} / ${fmt(DURATION)}`;
		if (playing && t >= DURATION) {
			stop(DURATION);
			ui.overlay.classList.remove("hidden");
			ui.status.textContent = "Watch again";
			return;
		}
		if (playing) raf = requestAnimationFrame(tick);
	}

	function start(from) {
		if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
		if (actx.state === "suspended") actx.resume();
		if (src) {
			try {
				src.stop();
			} catch (e) {
				void e;
			}
		}
		src = actx.createBufferSource();
		src.buffer = audioBuf;
		src.connect(actx.destination);
		const t0 = actx.currentTime + 0.05;
		src.start(t0, from);
		startAt = t0 - from;
		playing = true;
		ui.toggle.dataset.state = "playing";
		ui.overlay.classList.add("hidden");
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(tick);
	}

	function stop(at) {
		pausedT = at ?? now();
		playing = false;
		ui.toggle.dataset.state = "paused";
		if (src) {
			try {
				src.stop();
			} catch (e) {
				void e;
			}
			src = null;
		}
		cancelAnimationFrame(raf);
		renderFrame(ctx, pausedT);
	}

	async function playFrom(t) {
		ui.status.textContent = "Tuning the orchestra…";
		await soundReady;
		start(t >= DURATION - 0.05 ? 0 : t);
	}

	ui.play.addEventListener("click", () => playFrom(pausedT));
	ui.toggle.addEventListener("click", () => (playing ? stop() : playFrom(pausedT)));
	ui.scrub.addEventListener("click", (e) => {
		const r = ui.scrub.getBoundingClientRect();
		const t = clamp((e.clientX - r.left) / r.width) * DURATION;
		if (playing) start(t);
		else {
			pausedT = t;
			tick();
		}
	});
	ui.full.addEventListener("click", () => {
		const el = ui.wrap;
		if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
		else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
	});
	window.addEventListener("keydown", (e) => {
		if (e.code === "Space") {
			e.preventDefault();
			playing ? stop() : playFrom(pausedT);
		}
	});

	soundReady
		.then(() => {
			ui.status.textContent = "Play · 47 seconds · sound on";
			ui.play.disabled = false;
		})
		.catch((err) => {
			ui.status.textContent = "Couldn't build the soundtrack — visuals only";
			console.error(err);
		});

	// hooks for the offline video exporter
	window.NQ = {
		ready: soundReady,
		duration: DURATION,
		frame(t) {
			renderFrame(ctx, t);
			return canvas.toDataURL("image/png");
		},
		async wavBase64() {
			const ab = await soundReady;
			const u = new Uint8Array(encodeWav(ab));
			let s = "";
			for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
			return btoa(s);
		},
	};
})();
