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

## Fase 1 — limpieza y seguridad (v!d) (2 nov 2026)

Se quita todo lo que hablaba con los servidores del creador original y se endurece el servidor local.

| Qué | Antes | Ahora | Archivos |
| --- | --- | --- | --- |
| Licencia / apoyo | `server/licencia.ts` validaba una clave contra el cobro (MachineGuid, Ed25519) | Quitado | `server/licencia.ts` (+test), `web/src/Licencia.tsx/.css`, `web/src/main.tsx`, grupo «Apoyo» de `web/src/Opciones.tsx`, tipos en `shared/types.ts` |
| Comunidad, anuncios, «Liberar» | Proxy `/api/comunidad/*`, `/api/mejoras`, redactar | Quitado (y su navegación, avisos y botón de compartir video) | `server/comunidad.ts`, `web/src/Comunidad.tsx/.css`, `Escribir.tsx/.css`, `Liberar.tsx`, `avisos.ts` (+test), `App.tsx`, `MisVideos.tsx` |
| «Pedir mejora» | Botones en hilos, citas y errores | Quitado (llegará Feedback en otra fase) | `web/src/PedirMejora.tsx/.css`, `etiquetas.ts`, `Timeline.tsx`, `App.tsx` |
| Actualizador | electron-updater con feed del cobro (apagado salvo `TAZSLOTH_ACTUALIZAR=1`) | Sin auto-update; dependencia quitada | `electron/main.ts`, `electron/preload.ts`, `web/src/Actualizar.tsx`, `scripts/compilar.mjs` (sin `publish`), `package.json` |
| Cobro y scripts de venta | `licencias/` (Worker PayPal + comunidad), `publicar`, `anuncio`, `version-venta`, `paypal`, workflow `venta.yml` | Quitados | `licencias/`, `scripts/*.mjs`, `.github/workflows/venta.yml`, `package.json` (scripts `licencias`, `paypal`, `publicar`; typecheck y tests de `licencias/`) |
| Nube de Instagram | `nube.sloth.vancci.org` | `nube.vid.kold.gold` (sin desplegar); tipos del runtime en `nube/worker-runtime.d.ts` | `nube/wrangler.jsonc`, `nube/worker-configuration.d.ts`, `nube/tsconfig.json` |
| Token del servidor local | Solo `origen.ts` (Host/Origin) | Además, token de 32 bytes en `data/servidor-token`, exigido en `/api` y `/ws` (cabecera `x-vid-token` o cookie HttpOnly SameSite=Strict `vid_token`). Exentas: vuelta de YouTube OAuth y vista en vivo motor/vivo (GET de marco) | `server/token.ts` (+test), `server/index.ts`, `web/src/api.ts` (recarga si falta), `electron/main.ts` (pone la cookie) |
| Clientes locales | Sin credencial | `VID_TOKEN` junto a `SLOTH_URL` | `server/voz/index.ts`, `server/voz/mcp.mjs` (+test), `skills/reel-collage/scripts/voz.py`, `skills/video-el-diff/scripts/buscar.mjs`, `scripts/redes.ts`, `scripts/start.mjs` |
| Llaves de API | Texto plano en `data/agentes.json`; en Mac/Linux, `variables.json` plano leído por `start.mjs` | AES-256-GCM; llave maestra con DPAPI (`data/llave-maestra.dpapi`) en Windows o `data/llave-maestra` (600) en Mac/Linux; migración automática del plano | `server/secretos.ts` (+test), `server/acceso.ts`, `server/opciones.ts`, `scripts/start.mjs` |
| yt-dlp | `pip install --upgrade` diario | Versión fijada `YT_DLP = '2026.10.26'`; se instala solo si falta o no coincide | `server/requisitos.ts`, `server/index.ts` |
| Documentos | Instrucciones de cobro, anuncios, cuenta Vancci-sloth | Actualizados; `docs/agents/anuncios.md` quitado | `AGENTS.md`, `SECURITY.md`, `README.md`, `CONTRIBUTING.md`, `docs/agents/mapa.md`, `docs/agents/publicacion.md` |

Se conserva `__VENTA__` (`shared/venta.ts`): ya no implica red, solo marca la app compilada (interfaz estática, skills enlazadas).

## Fase 2 — branding total (v!d by Kold.Gold) (2 nov 2026)

El producto se llama **v!d by Kold.Gold** (corto: **v!d**). El «!» solo va en texto visible; todo nombre de archivo,
carpeta o identificador técnico usa `vid-koldgold`.

| Qué | Antes | Ahora | Archivos |
| --- | --- | --- | --- |
| Texto visible | Sloth / TazSloth / vid.kold.gold | v!d; «v!d by Kold.Gold» en bienvenida, título de ventana, diálogos e instalador | `web/src/*.tsx`, `avisos.ts`, `Redes.tsx`, `server/*`, `electron/*`, `cards.json`, skills, docs |
| Barra lateral | `vid.kold.gold` | wordmark `v!d`: la «!» en cobre (`--metal`), el resto plata | `web/src/App.tsx`, `web/src/styles.css` |
| Pestaña | vid.kold.gold | v!d (y «(N) v!d» con hilos sin ver) | `web/index.html`, `web/src/avisos.ts`, `server/motor.ts` |
| Icono y wordmark | Sello anterior | `assets/icon.svg/png/ico`, `web/public/icon.svg`, `assets/wordmark.svg/png` | `assets/`, `docs/tazkore/icono-preview.png` |
| package.json | `tazsloth` 0.3.0 | `vid-koldgold` 1.0.0 | `package.json`, `package-lock.json` |
| appId / AppUserModelID | TazSloth.App / TazSloth.Dev | `Gold.Kold.Vid` / `Gold.Kold.Vid.Dev` | `scripts/compilar.mjs`, `electron/main.ts` |
| Instalador | productName TazSloth, `TazSloth-Setup-*.exe` | productName, acceso y «Aplicaciones instaladas»: «v!d by Kold.Gold»; ejecutable `vid-koldgold.exe`, instalador `vid-koldgold-Setup-*.exe`, carpeta `Programs\vid-koldgold`, `vid-koldgold.desktop` | `scripts/compilar.mjs`, `scripts/ayudante/Accesos.cs`, `scripts/medir-arranque.mjs` |
| NSIS | Textos con el nombre; borraba la entrada de desinstalar de la Sloth 0.2 | Sin «!» en el .nsh (usa `${PRODUCT_NAME}`); ya no toca la entrada de la Sloth original | `scripts/instalador.nsh` |
| Copyright | Tazkore. Basado en Sloth de Vancci | Kold Gold SAPI · basado en Sloth de Vancci (Apache-2.0) | `scripts/compilar.mjs` |
| Datos | `%APPDATA%\tazsloth`, `%LOCALAPPDATA%\tazsloth-dev`, `Programs\tazsloth`, Mac `TazSloth`, Linux `tazsloth` | `vid-koldgold` (dev: `vid-koldgold-dev`). El repo sigue en `C:\tazkore-sloth\data` | `server/*`, `electron/main.ts`, `scripts/*` |
| Migrador | — | Al primer arranque COPIA la carpeta vieja a la nueva si la nueva no existe, deja `migrado-de-tazsloth.txt` y nunca borra la vieja; reescribe el `cwd` de los hilos que apuntaban al trabajo viejo (respaldo en `data/respaldo-migracion`) y copia su proyecto de Claude Code | `server/migrar.ts` (+test), `server/migrar-arranque.ts`, `server/index.ts`, `electron/main.ts` |
| Temporales y registro | `sloth-voz.json`, `sloth-gpu.lock`, `sloth-navegador-N.lock`, `sloth.log`… | `vid-*`, `vid.log` | `skills/video-base/scripts/*`, `python/procesos/*`, `server/*`, `electron/main.ts` |
| localStorage | `sloth-navegador*` | `vid-navegador*`, con lectura de respaldo de la clave vieja | `web/src/Navegador.tsx` |
| Puente de la ventana | `window.sloth` (`PuenteSloth`) | `window.vid` (`PuenteVid`); `window.sloth` queda como alias del mismo puente | `electron/preload.ts`, `shared/types.ts`, `web/src/vite-env.d.ts` |
| Eventos y nombres internos | `sloth-*`, `mcpSloth`, `rutaPythonSloth`… | `vid-*`, `mcpVid`, `rutaPythonVid`… | `web/src/*`, `server/*` |
| Variables de entorno | `SLOTH_*` | `VID_*`; se sigue leyendo `SLOTH_*` como respaldo y el servidor exporta ambas (`VID_SKILLS`/`SLOTH_SKILLS`, `VID_URL`/`SLOTH_URL`, `VID_PROCESOS`/`SLOTH_PROCESOS`). Las del usuario (`VID_NUBE`…) caen a la `SLOTH_*` guardada | `server/index.ts`, `server/opciones.ts` (`leer`), skills Python/JS, `electron/main.ts`, `scripts/*`. El workflow `.github/workflows/comprobar.yml` sigue con `SLOTH_TUYO` (cambiarlo pide el permiso `workflow` del token de GitHub); `compilar.mjs` lo lee como respaldo |
| Módulo de Python | `video-base/scripts/sloth.py` (`sloth()`, `python_sloth()`) | `vid.py` (`con_python()`, `python_vid()`); `sloth.py` queda como alias del módulo y `sloth`/`python_sloth` como alias de las funciones | `skills/video-base/scripts/vid.py`, `sloth.py`, todos los `from vid import` |
| Marcas en archivos | `sloth-portada`, `sloth-pagina` | `vid-portada`, `vid-pagina`; se reconocen también las viejas | `portada.mjs`, `render_web.mjs`, `pagina.mjs`, `reglas.mjs`, `ubicar.py` |
| Nube | Worker `sloth-redes` | `vid-redes` (sin desplegar) | `nube/wrangler.jsonc`, `server/redes/cloudflare.ts` |

Se quedan a propósito: el Python compartido con la Sloth original (`%APPDATA%\youtube\piezas\python\*-sloth`), los
módulos compartidos `%LOCALAPPDATA%\sloth-modulos`, las carpetas de la Sloth original que mira Espacio en disco, el
referrer de Grok, el nombre del repo en GitHub (`tazkore/tazsloth`), la carpeta del repo (`C:\tazkore-sloth`), NOTICE,
LICENSE, los créditos y los ADR.

## Fase 3 — proyectos y series (v!d) (2 nov 2026)

Cada hilo puede ser de un **proyecto** (marca o canal) y de una **serie** del proyecto, con su memoria (`MEMORIA.md`)
que el agente lee al empezar.

| Qué | Cómo | Archivos |
| --- | --- | --- |
| Entidad | `data/proyectos/<id>/proyecto.json` `{id, nombre, color, logo?, creado, archivado?}` + `MEMORIA.md` + `series/<id>/serie.json` y `MEMORIA.md`. Colores con nombre de la paleta (cobre, oro, plata, verde, rojo, gris). Archivar es una marca: nunca se borra nada | `server/proyectos.ts`, `shared/proyectos.ts` |
| Siembra | Solo si no hay ningún proyecto: Kold.Gold (cobre; nicho y cierre de `skills/kold-gold/marca.json`, regla de oro «no vender de frente», serie «Kold Gold Radar»), Tazkore IA, Alan Korenfeld y Diplomado IA con la plantilla Marca/Tono/Público/Reglas/Cierre | `server/proyectos.ts` |
| API | `GET/POST /api/proyectos`, `GET/POST /api/proyectos/<id>`, `POST /api/proyectos/<id>/series`, `POST /api/proyectos/<id>/series/<serie>`, `GET/POST …/memoria`, `POST /api/sessions/<id>/mover` | `server/proyectos.ts`, `server/index.ts` |
| Hilos | `SessionMeta.proyecto` y `.serie`. `POST /api/sessions` y `/api/lotes` aceptan `proyecto` y `serie`; el primer mensaje lleva `Proyecto:`, `MemoriaProyecto:` y `MemoriaSerie:` | `shared/types.ts`, `server/sessions.ts`, `server/index.ts` |
| Memoria al agente | `Sessions.turno` antepone `<contexto-del-proyecto>` (texto de las memorias) al primer turno de cada proceso sin sesión que retomar, para todos los proveedores; en el hilo solo se ven las líneas de control | `server/sessions.ts` (`contexto`), `server/proyectos.ts` (`contexto`) |
| Skills | `video-base/PROYECTOS.md`: leer y respetar la memoria, proponer al final (sin escribir) qué agregar. Referido en `LEEME.md`, `kold-gold` y `video-explicativo` (El Diff no se toca: recibe el bloque igual) | `skills/video-base/*`, `skills/kold-gold/SKILL.md`, `skills/video-explicativo/SKILL.md` |
| Barra lateral | Sección «Proyectos» (+ Proyecto) con cada proyecto y sus series plegables (recordado en localStorage), y «Sin proyecto» con la lista por fechas de siempre. Menú del proyecto: Renombrar, Color, Nueva serie, Editar memoria, Archivar. Mover un hilo arrastrándolo o con «Mover a…». Plegada (Ctrl+B) se ven los puntos de color | `web/src/Proyectos.tsx`, `web/src/Proyectos.css`, `web/src/App.tsx` |
| Compositor | Selector de proyecto y serie junto al de estilo; por defecto el del último hilo abierto o el que tocaste en la barra. Si la serie coincide con una del banco de la skill, se elige también esa (`Serie:`) | `web/src/Proyectos.tsx` (`SelectorProyecto`), `web/src/App.tsx` |
| Editor de memoria | Modal con textarea monoespaciada, Guardar y Ctrl+S | `web/src/Proyectos.tsx` (`EditorMemoria`) |
| Mis videos | Filtro por proyecto y serie, además del estilo | `web/src/MisVideos.tsx` |
| Tests | CRUD, siembra, archivar sin borrar, líneas de control, inyección de memoria por proveedor | `server/proyectos.test.ts` |
