"""
Forma de la boca del personaje en cada cuadro, medida en la voz (sin GPU, solo numpy y FFmpeg).

Cuatro formas: 0 cerrada, 1 media, 2 abierta, 3 "o" (redonda: o, u). Se decide con la energia de cada cuadro y el
centroide espectral (las vocales redondas pesan hacia graves; la a y la e, hacia agudos), con suavizado, histeresis
(la boca no parpadea en el umbral), duracion minima por forma (~60 ms) y cierre en los silencios.

Salida compatible hacia atras: voz.json["boca"] sigue siendo una lista de numeros por cuadro. Antes era el nivel 0..1
y Personaje.tsx abria la boca con > 0.3; ahora cada forma ocupa una banda de ese mismo numero:
    cerrada 0..0.15 | media 0.31..0.60 | abierta 0.61..1 | "o" 2 + (0.31..1)
Un Personaje.tsx viejo sigue abriendo la boca (todo lo que no es cerrada pasa de 0.3) y uno nuevo decodifica la forma
con `forma()`. Como acelerar.py ya llama a nivel_por_cuadro(), tambien recibe las formas sin tocarlo.

    python -B scripts/bocas_voz.py audio.wav|mp3 [--bocas 2|3|4]   # imprime la distribucion de formas
"""
from __future__ import annotations

import subprocess
import sys

import numpy as np

SR = 48000
FPS = 30
MIN_MS = 60

CERRADA, MEDIA, ABIERTA, REDONDA = 0, 1, 2, 3
NOMBRES = ["cerrada", "media", "abierta", "o"]


def leer_pcm(ruta, sr: int = SR) -> np.ndarray:
    """La voz como float32 mono a `sr` Hz (FFmpeg lee wav de 24 bits, mp3, lo que sea)."""
    pcm = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(ruta), "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(pcm, dtype=np.int16).astype(np.float32)


def rasgos(datos: np.ndarray, sr: int = SR, fps: int = FPS) -> tuple[np.ndarray, np.ndarray]:
    """Energia (RMS, normalizada con el percentil 95) y centroide espectral en Hz de cada cuadro."""
    paso = sr // fps
    n = len(datos) // paso
    if n == 0:
        return np.zeros(0), np.zeros(0)
    trozos = datos[: n * paso].reshape(n, paso)
    rms = np.sqrt((trozos ** 2).mean(axis=1))
    activos = rms[rms > 0]
    rms = rms / ((np.percentile(activos, 95) if len(activos) else 1.0) + 1e-9)
    espectro = np.abs(np.fft.rfft(trozos * np.hanning(paso), axis=1))
    freqs = np.fft.rfftfreq(paso, 1.0 / sr)
    banda = (freqs >= 100) & (freqs <= 5000)  # donde vive el habla
    pesos = espectro[:, banda]
    centroide = (pesos * freqs[banda]).sum(axis=1) / (pesos.sum(axis=1) + 1e-9)
    return np.clip(rms, 0, 1.5), centroide


def suavizar(x: np.ndarray) -> np.ndarray:
    if len(x) < 3:
        return x
    p = np.pad(x, 1, mode="edge")
    return 0.25 * p[:-2] + 0.5 * p[1:-1] + 0.25 * p[2:]


def duracion_minima(formas: list[int], minimo: int) -> list[int]:
    """Ninguna forma dura menos de `minimo` cuadros: las tandas cortas se funden con la anterior (o la siguiente)."""
    formas = list(formas)
    for _ in range(3):
        tandas, i = [], 0
        while i < len(formas):
            j = i
            while j < len(formas) and formas[j] == formas[i]:
                j += 1
            tandas.append([i, j, formas[i]])
            i = j
        cambio = False
        for k, (a, b, f) in enumerate(tandas):
            if b - a < minimo and len(tandas) > 1:
                vecino = tandas[k - 1][2] if k > 0 else tandas[k + 1][2]
                for q in range(a, b):
                    formas[q] = vecino
                cambio = True
        if not cambio:
            break
    return formas


def formas_por_cuadro(datos: np.ndarray, bocas: int = 4, sr: int = SR, fps: int = FPS) -> tuple[list[int], list[float]]:
    """(formas 0..3, nivel 0..1) por cuadro. `bocas` = 2, 3 o 4 formas disponibles (2: cerrada/abierta)."""
    rms, cen = rasgos(datos, sr, fps)
    if len(rms) == 0:
        return [], []
    nivel = np.clip(suavizar(rms), 0, 1)
    voz = nivel > 0.12
    # Centroide de referencia: el de los cuadros con voz; "o" es lo claramente mas grave que lo normal.
    if voz.sum() >= 10:
        ref = np.percentile(cen[voz], 30)
    else:
        ref = 0.0
    cen_s = suavizar(cen)

    # Histeresis: umbrales de subida y de bajada distintos.
    sube = {CERRADA: 0.20, MEDIA: 0.58}   # para pasar a la forma de arriba
    baja = {MEDIA: 0.11, ABIERTA: 0.44}   # para pasar a la de abajo
    if bocas == 2:
        sube = {CERRADA: 0.30}
        baja = {ABIERTA: 0.22}
    formas: list[int] = []
    actual = CERRADA
    o_activa = False
    for v, c in zip(nivel, cen_s):
        if bocas == 2:
            if actual == CERRADA and v >= sube[CERRADA]:
                actual = ABIERTA
            elif actual == ABIERTA and v < baja[ABIERTA]:
                actual = CERRADA
            formas.append(actual)
            continue
        if actual in (CERRADA,) and v >= sube[CERRADA]:
            actual = MEDIA
        elif actual == MEDIA and v >= sube[MEDIA]:
            actual = ABIERTA
        elif actual == MEDIA and v < baja[MEDIA]:
            actual = CERRADA
        elif actual == ABIERTA and v < baja[ABIERTA]:
            actual = MEDIA
        forma = actual
        # "o": voz con cuerpo (no un susurro) y centroide grave, con histeresis propia.
        if bocas >= 4 and ref > 0 and actual != CERRADA and v >= 0.30:
            if not o_activa and c < ref * 0.92:
                o_activa = True
            elif o_activa and c > ref * 1.08:
                o_activa = False
            if o_activa:
                forma = REDONDA
        else:
            o_activa = False
        formas.append(forma)

    # Silencios: si el nivel (sin suavizar) cae bajo el umbral de voz, la boca se cierra aunque la histeresis la sostuviera.
    for i, v in enumerate(rms):
        if v < 0.06:
            formas[i] = CERRADA
    # Y al final, ninguna forma dura menos de ~60 ms.
    formas = duracion_minima(formas, max(1, round(MIN_MS / 1000 * fps)))
    return formas, [float(x) for x in nivel]


def codificar(formas: list[int], nivel: list[float]) -> list[float]:
    """Una forma y su nivel -> el numero que va a voz.json["boca"] (bandas en el docstring del modulo)."""
    salida = []
    for f, v in zip(formas, nivel):
        v = float(min(max(v, 0.0), 1.0))
        if f == CERRADA:
            x = min(v, 0.15)
        elif f == MEDIA:
            x = min(max(v, 0.31), 0.60)
        elif f == ABIERTA:
            x = min(max(v, 0.61), 1.0)
        else:
            x = 2 + min(max(v, 0.31), 1.0)
        salida.append(round(x, 3))
    return salida


def forma(valor: float) -> int:
    """Inversa de `codificar` (lo mismo hace Personaje.tsx)."""
    if valor >= 2:
        return REDONDA
    if valor > 0.6:
        return ABIERTA
    if valor > 0.3:
        return MEDIA
    return CERRADA


def boca_por_cuadro(ruta, bocas: int = 4, sr: int = SR, fps: int = FPS) -> list[float]:
    formas, nivel = formas_por_cuadro(leer_pcm(ruta, sr), bocas, sr, fps)
    return codificar(formas, nivel)


def distribucion(formas: list[int]) -> dict[str, float]:
    n = max(1, len(formas))
    return {NOMBRES[i]: round(100 * formas.count(i) / n, 1) for i in range(4)}


def cambios_por_segundo(formas: list[int], fps: int = FPS) -> float:
    return round(sum(1 for a, b in zip(formas, formas[1:]) if a != b) / max(1e-9, len(formas) / fps), 2)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    n_bocas = int(sys.argv[sys.argv.index("--bocas") + 1]) if "--bocas" in sys.argv else 4
    if "--bocas" in sys.argv:
        args = [a for a in args if a != str(n_bocas)]
    if not args:
        sys.exit(__doc__)
    fs, nv = formas_por_cuadro(leer_pcm(args[0]), n_bocas)
    print(f"{args[0]}: {len(fs)} cuadros ({len(fs) / FPS:.1f} s), {n_bocas} bocas")
    print("distribucion %:", distribucion(fs))
    print("cambios de forma por segundo:", cambios_por_segundo(fs))
    tandas = []
    i = 0
    while i < len(fs):
        j = i
        while j < len(fs) and fs[j] == fs[i]:
            j += 1
        tandas.append(j - i)
        i = j
    print(f"tanda mas corta: {min(tandas) if tandas else 0} cuadros (minimo pedido {max(1, round(MIN_MS / 1000 * FPS))})")
    print("primeros 90 cuadros:", "".join("-mAo"[f] for f in fs[:90]))
