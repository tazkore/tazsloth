# El avatar: la línea `Avatar:`

El usuario elige en el compositor de v!d con qué motor se anima el personaje (o un presentador) que habla en el vídeo.
Lo elegido llega en el primer mensaje:

- `Avatar: comfyui-local …`, `Avatar: nube-gratis …`, `Avatar: heygen …` o `Avatar: codex …`: usa ese motor, como se
  dice abajo, **en lugar de** las bocas abierta y cerrada.
- Sin la línea (o `sprites`): lo de siempre, las bocas de tu skill (`bocas.py`, `alinear.py`). Este archivo no cambia
  nada de eso.

El motor se pide con el MCP `avatar` (en Claude, `mcp__avatar__*`): `motores` dice cuáles están listos ahora,
`generar_avatar` pide el vídeo y `estado_avatar` espera a uno que tarda. **Siempre necesitas primero la voz**: el avatar
se anima con el audio ya hecho (el del usuario o el que dejó `generar_voz`, ver [VOZ.md](VOZ.md)).

## Cómo pedirlo

1. `motores`: confirma que el motor de la línea está LISTO. Si no lo está, díselo al usuario en una frase y sigue con
   `sprites`; no insistas ni instales nada tú.
2. `generar_avatar` con `motor`, `audio` (ruta absoluta del `.wav` de la voz), la imagen o el vídeo del personaje y
   `salida`: `<carpeta del vídeo>/fuentes/avatar/avatar.mp4`, en ruta absoluta.
3. Si no acabó en 40 s te da un id: sigue con lo que no lo necesita (la música, los gráficos, las demás escenas) y
   espéralo con `estado_avatar`. Cuando llega, el MP4 es la **capa del avatar**: úsalo en el lugar de la pose animada,
   sobre el fondo de tu estilo, y toma el audio de la voz original, no el del MP4.

## Cada motor

| Motor | Etiqueta | Qué pasarle | Tarda | Cuesta |
|---|---|---|---|---|
| `comfyui-local` | Local | `audio` + `video` del personaje (LatentSync, MuseTalk) o `imagen` (InfiniteTalk, FantasyTalking). `flujo` si quieres uno en concreto | Minutos a horas en una RTX 4060 | Nada, solo luz |
| `nube-gratis` | Nube | `audio`, `salida` (y `carpeta` si quieres) | Lo hace el usuario a mano | Nada |
| `heygen` | Pago | `avatar_heygen` (de `avatares_heygen`) y `audio`, o `guion` y `voz_heygen`; `formato` | Minutos | **Créditos del usuario** |
| `codex` | Nube | Nada propio: Codex elige otro motor | — | Su suscripción |

- **`comfyui-local`**: LatentSync 1.5 y MuseTalk piden un vídeo del personaje (sin él, v!d convierte la imagen en un
  vídeo quieto con FFmpeg). InfiniteTalk y FantasyTalking, una imagen; caben justo en 8 GB y son lentos: no los uses
  para un vídeo con prisa. Si el flujo no está listo, `generar_avatar` lo dice (falta instalar el modelo o importar el
  flujo): cae a `sprites`.
- **`nube-gratis`**: no hay API gratis. `generar_avatar` prepara un cuaderno de Colab y las instrucciones en
  `fuentes/avatar/nube/` y abre Colab; el usuario sube el audio y la imagen, baja el MP4 y lo importa en Opciones.
  Devuelve `espera-usuario`: **no esperes el vídeo**. Sigue con `sprites` para el borrador y avisa que el real llegará
  a `salida` cuando lo importe.
- **`heygen`**: gasta créditos. Pídelo **una sola vez** por vídeo, nunca para probar, y solo si la línea lo dice. Si no
  hay llave, `generar_avatar` lo avisa: dile al usuario que use «Hacer en HeyGen con Chrome» (Opciones → Avatares y
  voz) o que pegue su llave. Las skills `heygen-avatar`, `heygen-video` y `heygen-translate` (carpetas hermanas de
  esta) sirven para crear un avatar nuevo o un vídeo con el Video Agent de HeyGen; úsalas solo si el usuario lo pide.
- **`codex`**: si eres Codex, esto es la tarea: elige **tú** el motor real entre los LISTOS (`motores`) y llama a
  `generar_avatar` con él. Codex no genera vídeo por sí mismo. Si no hay ninguno listo, `sprites`.

## Si falla

Dile al usuario el error tal cual y sigue con `sprites`: el vídeo no se queda sin avatar. Un `comfyui-local` que se
cuelga no se reintenta más de una vez (la GPU es una sola y la comparte el resto del vídeo).
