#!/usr/bin/env python3
"""Une réplique → wav mono 44,1 kHz (mêmes moteurs que le F04 : edge | say | piper, voir partner_quiz.tts_wav). Affiche la durée (s).
Usage : .venv/bin/python scripts/tts.py out.wav --text "…" [--engine edge] [--voice fr-FR-DeniseNeural] [--rate +0%]
Utilisé par src/produce/pov.js --voice (version « avec voix » des POV)."""
import argparse, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from partner_quiz import tts_wav, tts_available
ap = argparse.ArgumentParser(); ap.add_argument("out"); ap.add_argument("--text", required=True)
ap.add_argument("--engine", default="edge"); ap.add_argument("--voice", default="fr-FR-DeniseNeural"); ap.add_argument("--rate", default=None)
a = ap.parse_args()
cfg = {"engine": a.engine, "voice": a.voice, **({"rate": a.rate} if a.rate else {})}
if (why := tts_available(cfg)): sys.exit(f"voix indisponible : {why}")
print(f"{tts_wav(a.text, a.out, cfg):.3f}")
