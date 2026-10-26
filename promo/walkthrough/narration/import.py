"""Bring recorded voiceover into the walkthrough.

Put one file per line in a folder, named by its id from lines.json
(chat1.wav, chat2.m4a, …; any format ffmpeg reads), then:

  FFMPEG=ffmpeg python3 import.py /path/to/takes

Each take is trimmed of leading/trailing silence, high-passed, lightly
compressed, matched in level, and written over <id>.ogg next to this file.
It then prints each clip's length against the time available before the
next line's cue in src/walk.js, so overruns show up before a render.
"""
import json, os, re, subprocess, sys

here = os.path.dirname(os.path.abspath(__file__))
ffmpeg = os.environ.get("FFMPEG", "ffmpeg")
takes = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
lines = json.load(open(os.path.join(here, "lines.json")))

# Trim silence at both ends (reverse trick for the tail), clean up the low
# end, glue the dynamics, then normalise loudness so lines sit evenly.
trim = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03"
chain = ",".join([
	trim, "areverse", trim, "areverse",
	"highpass=f=80", "acompressor=threshold=-20dB:ratio=2.5:attack=5:release=100:makeup=2",
	"loudnorm=I=-17:TP=-1.5:LRA=7",
])

def duration(path):
	info = subprocess.run([ffmpeg, "-hide_banner", "-i", path], capture_output=True, text=True).stderr
	h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", info).groups()
	return int(h) * 3600 + int(m) * 60 + float(s)

cues = dict(re.findall(r"(\w+): ([\d.]+)", re.search(r"const CUES = \{(.*?)\};", open(os.path.join(here, "../src/walk.js")).read()).group(1)))
order = sorted(lines, key=lambda l: float(cues[l["id"]]))
missing = []
for i, line in enumerate(order):
	src = next((os.path.join(takes, f) for f in sorted(os.listdir(takes)) if os.path.splitext(f)[0] == line["id"]), None)
	if not src:
		missing.append(line["id"])
		continue
	out = os.path.join(here, f"{line['id']}.ogg")
	subprocess.run([ffmpeg, "-loglevel", "error", "-y", "-i", src, "-af", chain, "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "96k", out], check=True)
	start = float(cues[line["id"]])
	room = float(cues[order[i + 1]["id"]]) - start if i + 1 < len(order) else 70 - start
	d = duration(out)
	print(f"{line['id']:6} {d:5.2f}s of {room:5.2f}s{'   ← runs into the next line' if d > room - 0.15 else ''}")
if missing:
	print("no take for:", ", ".join(missing), "(the placeholder clip stays)")
