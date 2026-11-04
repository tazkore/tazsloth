"""
Saca las fotos de boca "media" y "o" de cada pose a partir de las dos que ya tiene (cerrada y abierta), sin IA ni GPU.

    python -B scripts/bocas_variantes.py [carpeta_de_fotos [personaje.json]]
    (sin argumentos: public/perro y src/datos/personaje.json del proyecto)

- media:  mitad del camino entre la boca cerrada y la abierta (mezcla de las dos; solo cambia donde cambia la boca).
- o:      la boca abierta encogida a lo ancho (~58 %) y un poco alta, centrada en la boca, sobre la foto cerrada: una "o".
Deja <pose>-media.webp y <pose>-o.webp con la misma silueta, y suma "media" y "o" a la pose en personaje.json. Si ya
existen y son mas nuevas que las dos fotos, no las rehace. Las poses sin foto abierta se dejan como estan (2 bocas).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

RAIZ = Path(__file__).resolve().parent.parent

ANCHO_O = 0.58   # cuanto se encoge a lo ancho la boca abierta para hacer la "o"
ALTO_O = 1.06    # y cuanto se estira a lo alto


def caja_boca(a: np.ndarray, b: np.ndarray) -> tuple[int, int, int, int] | None:
    """Caja (x0, y0, x1, y1) de lo que cambia entre dos fotos RGBA: la boca."""
    dif = np.abs(a[..., :3].astype(np.int16) - b[..., :3].astype(np.int16)).sum(axis=2)
    mascara = dif > 40
    if mascara.sum() < 30:
        return None
    ys, xs = np.nonzero(mascara)
    # Se ignora lo suelto: la caja va de los percentiles 1 a 99 de lo que cambio.
    x0, x1 = np.percentile(xs, [1, 99])
    y0, y1 = np.percentile(ys, [1, 99])
    # Si cambio media foto, la abierta no es "solo la boca" (la rehizo otra herramienta): no hay boca que aislar.
    if (x1 - x0) * (y1 - y0) > 0.15 * a.shape[0] * a.shape[1]:
        return None
    return int(x0) - 2, int(y0) - 2, int(x1) + 3, int(y1) + 3


def media(cerrada: Image.Image, abierta: Image.Image) -> Image.Image:
    a = np.asarray(cerrada).astype(np.float32)
    b = np.asarray(abierta).astype(np.float32)
    salida = a * 0.5 + b * 0.5
    # La silueta es la de la foto cerrada.
    salida[..., 3] = a[..., 3]
    return Image.fromarray(np.clip(salida, 0, 255).astype(np.uint8), "RGBA")


def redonda(cerrada: Image.Image, abierta: Image.Image, caja: tuple[int, int, int, int]) -> Image.Image:
    x0, y0, x1, y1 = caja
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(cerrada.width, x1), min(cerrada.height, y1)
    parche = abierta.crop((x0, y0, x1, y1))
    w, h = parche.size
    nw, nh = max(2, round(w * ANCHO_O)), max(2, min(round(h * ALTO_O), round(h * 1.2)))
    parche = parche.resize((nw, nh), Image.LANCZOS)
    # Borde difuminado: el parche se funde con la cara en vez de quedar con filo.
    mascara = Image.new("L", (nw, nh), 0)
    interior = Image.new("L", (max(2, nw - 6), max(2, nh - 6)), 255)
    mascara.paste(interior, (3, 3))
    mascara = mascara.filter(ImageFilter.GaussianBlur(2.2))
    salida = cerrada.copy()
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    salida.paste(parche, (cx - nw // 2, cy - nh // 2), mascara)
    # La silueta no cambia.
    salida.putalpha(cerrada.getchannel("A"))
    return salida


def guardar(img: Image.Image, ruta: Path) -> None:
    img.save(ruta, "WEBP", quality=95, method=6, alpha_quality=100)


def viejo(salida: Path, *fuentes: Path) -> bool:
    return not salida.exists() or salida.stat().st_mtime < max(f.stat().st_mtime for f in fuentes)


def procesar(carpeta: Path, indice: Path) -> int:
    datos = json.loads(indice.read_text(encoding="utf8"))
    hechas = 0
    for nombre, pose in datos["poses"].items():
        if not pose.get("abierta"):
            continue
        rc, ra = carpeta / Path(pose["cerrada"]).name, carpeta / Path(pose["abierta"]).name
        if not (rc.exists() and ra.exists()):
            print(f"{nombre}: faltan fotos en {carpeta}")
            continue
        base = Path(pose["cerrada"]).with_suffix("")
        sal_m, sal_o = carpeta / f"{base.name}-media.webp", carpeta / f"{base.name}-o.webp"
        cerrada, abierta = Image.open(rc).convert("RGBA"), Image.open(ra).convert("RGBA").resize(Image.open(rc).size, Image.LANCZOS)
        caja = caja_boca(np.asarray(cerrada), np.asarray(abierta))
        if not caja:
            print(f"{nombre}: no se aisla la boca (la foto abierta cambia mas que la boca): queda con 2 bocas")
            continue
        if viejo(sal_m, rc, ra):
            guardar(media(cerrada, abierta), sal_m)
            hechas += 1
        if viejo(sal_o, rc, ra):
            guardar(redonda(cerrada, abierta, caja), sal_o)
            hechas += 1
        pose["media"] = str(Path(pose["cerrada"]).parent / sal_m.name).replace("\\", "/")
        pose["o"] = str(Path(pose["cerrada"]).parent / sal_o.name).replace("\\", "/")
        print(f"{nombre}: media, o (boca en {caja})")
    indice.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    return hechas


if __name__ == "__main__":
    carpeta = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / "public" / "perro"
    indice = Path(sys.argv[2]) if len(sys.argv) > 2 else RAIZ / "src" / "datos" / "personaje.json"
    print(f"{procesar(carpeta, indice)} fotos nuevas")
