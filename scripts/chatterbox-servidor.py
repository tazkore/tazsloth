"""
Servidor local de Chatterbox Multilingual para v!d (lo copia scripts/instalar-ia-local.ps1 a C:\\vid-ia\\chatterbox\\servidor.py).
Solo escucha en 127.0.0.1. Corre con el Python del entorno de Chatterbox:

    C:\\vid-ia\\chatterbox\\Scripts\\python.exe servidor.py --puerto 8189

GET  /salud -> {"modelo": ..., "dispositivo": "cuda"|"cpu", "idiomas": [...]}
POST /tts   {"texto": ..., "idioma": "es", "referencia": "C:\\\\ruta\\\\voz.wav"?, "exageracion": 0.5?} -> audio/wav 24 kHz mono
El texto se parte en frases (el modelo rinde mejor con trozos cortos) y se unen con una pausa corta.
"""
import argparse
import io
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODELO = {"modelo": None, "dispositivo": None, "idiomas": []}
CERROJO = threading.Lock()  # la GPU hace una voz a la vez


def cargar():
    import torch
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS, SUPPORTED_LANGUAGES

    dispositivo = "cuda" if torch.cuda.is_available() else "cpu"
    MODELO["tts"] = ChatterboxMultilingualTTS.from_pretrained(device=dispositivo)
    MODELO["modelo"] = "chatterbox-multilingual"
    MODELO["dispositivo"] = dispositivo
    MODELO["idiomas"] = sorted(SUPPORTED_LANGUAGES.keys())


def frases(texto, maximo=280):
    partes = re.split(r"(?<=[.!?;:])\s+", texto.strip())
    trozos, actual = [], ""
    for p in partes:
        if actual and len(actual) + len(p) + 1 > maximo:
            trozos.append(actual)
            actual = p
        else:
            actual = f"{actual} {p}".strip()
    if actual:
        trozos.append(actual)
    return trozos


def generar(datos):
    import torch
    import torchaudio

    tts = MODELO["tts"]
    idioma = datos.get("idioma") or "es"
    kw = {"language_id": idioma}
    if datos.get("referencia"):
        kw["audio_prompt_path"] = datos["referencia"]
    if datos.get("exageracion") is not None:
        kw["exaggeration"] = float(datos["exageracion"])
    pausa = torch.zeros(1, int(tts.sr * 0.15))
    piezas = []
    with CERROJO:
        for trozo in frases(datos["texto"]):
            wav = tts.generate(trozo, **kw)
            piezas += [wav.cpu().reshape(1, -1), pausa]
    audio = torch.cat(piezas[:-1], dim=1)
    buf = io.BytesIO()
    torchaudio.save(buf, audio, tts.sr, format="wav")
    return buf.getvalue()


class Manejador(BaseHTTPRequestHandler):
    def _json(self, estado, datos):
        cuerpo = json.dumps(datos).encode("utf8")
        self.send_response(estado)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):
        if self.path == "/salud":
            return self._json(200, {k: MODELO[k] for k in ("modelo", "dispositivo", "idiomas")})
        self._json(404, {"error": "no existe"})

    def do_POST(self):
        if self.path != "/tts":
            return self._json(404, {"error": "no existe"})
        try:
            datos = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))) or b"{}")
            if not (datos.get("texto") or "").strip():
                return self._json(400, {"error": "falta el texto"})
            wav = generar(datos)
        except Exception as e:  # noqa: BLE001 - el cliente recibe el motivo
            return self._json(500, {"error": str(e)})
        self.send_response(200)
        self.send_header("content-type", "audio/wav")
        self.send_header("content-length", str(len(wav)))
        self.end_headers()
        self.wfile.write(wav)

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--puerto", type=int, default=8189)
    args = ap.parse_args()
    cargar()
    ThreadingHTTPServer(("127.0.0.1", args.puerto), Manejador).serve_forever()
