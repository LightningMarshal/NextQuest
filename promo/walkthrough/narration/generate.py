"""Narration for the walkthrough: Kokoro v1.0 (ONNX, runs locally) with a
blended deep male voice, one clip per line in lines.json, then EQ +
compression and Opus encoding with ffmpeg.

  pip install kokoro-onnx soundfile
  # model files from https://github.com/thewh1teagle/kokoro-onnx/releases
  KOKORO_DIR=/path/to/models FFMPEG=ffmpeg python3 generate.py

Writes <id>.ogg next to this file and prints each clip's length; the
timeline in src/walk.js cues lines by id, so re-check it if lengths move.
"""
import json, os, subprocess, tempfile

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

here = os.path.dirname(os.path.abspath(__file__))
models = os.environ.get("KOKORO_DIR", ".")
ffmpeg = os.environ.get("FFMPEG", "ffmpeg")
k = Kokoro(os.path.join(models, "kokoro-v1.0.onnx"), os.path.join(models, "voices-v1.0.bin"))
voice = 0.6 * k.get_voice_style("am_onyx") + 0.4 * k.get_voice_style("am_fenrir")
# Warmth, presence, a little glue; levels are matched in the mix.
chain = "highpass=f=75,equalizer=f=170:t=q:w=1:g=2,equalizer=f=3400:t=q:w=1.2:g=2.5,acompressor=threshold=-22dB:ratio=3:attack=4:release=90:makeup=3"

for line in json.load(open(os.path.join(here, "lines.json"))):
	samples, sr = k.create(line["text"], voice=voice, speed=line.get("speed", 1.0), lang="en-us")
	loud = np.where(np.abs(samples) > 0.01)[0]
	samples = samples[max(0, loud[0] - int(0.02 * sr)) : min(len(samples), loud[-1] + int(0.08 * sr))]
	with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
		sf.write(tmp.name, samples, sr)
		out = os.path.join(here, f"{line['id']}.ogg")
		subprocess.run([ffmpeg, "-loglevel", "error", "-y", "-i", tmp.name, "-af", chain, "-ar", "48000", "-c:a", "libopus", "-b:a", "96k", out], check=True)
	print(f"{line['id']:6} {len(samples) / sr:.2f}s")
