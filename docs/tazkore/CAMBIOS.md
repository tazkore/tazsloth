# Cambios de TazSloth respecto a Sloth

TazSloth es el fork de Tazkore de [Sloth](https://github.com/Vancci-sloth/sloth) (Apache 2.0 + Commons Clause).
Uso interno, sin venta. Los cambios propios viven en la rama `tazkore`; `main` sigue a `upstream`.

## Fase 2 · Identidad (1-nov-2026, base upstream a90083e)

| Qué | Antes | Ahora | Archivos |
| --- | --- | --- | --- |
| Nombre de la app | Sloth | TazSloth | `package.json`, `scripts/compilar.mjs`, `electron/main.ts`, `web/index.html` |
| appId / AppUserModelId | Sloth.App / Sloth.Dev | TazSloth.App / TazSloth.Dev | `scripts/compilar.mjs`, `electron/main.ts` |
| Puerto por defecto | 4848 | 4850 | `server/index.ts`, `scripts/start.mjs`, `scripts/redes.ts`, `electron/main.ts`, `server/voz/mcp.mjs` |
| Datos de usuario | `%APPDATA%\sloth` | `%APPDATA%\tazsloth` | `server/*`, `scripts/*` |
| Trabajo en desarrollo | `%LOCALAPPDATA%\sloth-dev` | `%LOCALAPPDATA%\tazsloth-dev` | `server/trabajo.ts` |
| Carpeta instalada | `Programs\sloth` | `Programs\tazsloth` | `scripts/compilar.mjs`, `server/espacio.ts` |
| Instaladores | `Sloth-*` | `TazSloth-*` | `scripts/compilar.mjs`, `scripts/publicar.mjs` |
| Caché del actualizador | `sloth-updater` | `tazsloth-updater` | `electron/main.ts` |
| Acceso del menú Inicio (ayudante) | `Sloth.lnk` | `TazSloth.lnk` | `scripts/ayudante/Accesos.cs` |
| Puerto en skills | 4848 | 4850 | `skills/video-el-diff/scripts/buscar.mjs`, `skills/reel-collage/scripts/voz.py` |
| Actualización automática | Encendida (feed de Vancci) | Apagada; `TAZSLOTH_ACTUALIZAR=1` la enciende | `electron/main.ts` |

Se comparten a propósito con la Sloth original (ahorran varios GB): el Python de `%APPDATA%\youtube\piezas\python` y
los módulos de `%LOCALAPPDATA%\sloth-modulos` y `%LOCALAPPDATA%\video-el-diff\modulos`. Por eso el botón de sobrantes
(`server/espacio.ts`) también mira los videos de la Sloth original. Ojo: el desinstalador de cualquiera de las dos
(`scripts/instalador.nsh`) los borra.

Sin cambios todavía: el servidor de actualizaciones (`COBRO` sigue apuntando a api.sloth.vancci.org, pero apagado), textos de la interfaz,
iconos, y el sistema de licencias (solo se activa al compilar con `VENTA`).

## Fase 3 · Estilo Kold Gold (1-nov-2026)

| Qué | Archivos |
| --- | --- |
| Estilo `kold-gold`: copia del Video explicativo con la marca de Kold Gold (zorra anfitriona, paleta carbón/plata/cobre, cierre a kold.gold, reglas de fuentes, guion «vender sin vender», mundo 3D del viaje de la carga) | `skills/kold-gold/` (`KOLD-GOLD.md` manda sobre el resto) |
| La marca y la zorra se copian solas a la carpeta de la card la primera vez | `skills/kold-gold/scripts/marca.py` (`leer`), `skills/kold-gold/marca.json`, `skills/kold-gold/personajes/zorra-kold/` |
| Caja de selección y protagonista en cobre `#D07E26`, fondo `#111827` | `skills/kold-gold/plantilla/src/tema.ts` |
| Card «Kold Gold» (icono globo) | `cards.json` |
| Requisitos de Python también para `kold-gold` | `server/requisitos.ts` |
| Texto para redes de Kold Gold (palabra clave de comentario, hashtags del sector, sin ofertas) | `server/redes/index.ts` |
| Series «Un embarque, paso a paso» y «Mitos de la importación» | `skills/video-base/series/kold-gold-*.md` |

## Marca vid.kold.gold (2 nov 2026)

- Nombre visible: **vid.kold.gold** (barra lateral, pestaña, ventanas, bienvenida, opciones, ideas). El instalador, el appId y las carpetas de datos siguen como TazSloth para no mover tus videos ni romper actualizaciones.
- Paleta Kold Gold: fondo carbón azulado `#0b0d12`, paneles `#12151c`/`#1b1f29`, texto plata `#e6e9ef`, secundario `#8f97a8`, acento cobre-oro `#d69a5c` (hover `#efb57a`). Las variables conservan sus nombres (`--amber`…) para no chocar con Sloth al traer cambios.
- Metal: `--metal` (cobre) y `--metal-plata` en el botón de enviar, botones principales y el wordmark.
- Icono nuevo: sello de acero y cobre con globo y play (`assets/icon.svg|png|ico`, vista en `docs/tazkore/icono-preview.png`).
