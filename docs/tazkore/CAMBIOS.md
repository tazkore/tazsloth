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
