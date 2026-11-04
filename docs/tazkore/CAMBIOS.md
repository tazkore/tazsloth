# Cambios de TazSloth respecto a Sloth

TazSloth es el fork de Tazkore de [Sloth](https://github.com/Vancci-sloth/sloth) (Apache 2.0 + Commons Clause).
Uso interno, sin venta. Los cambios propios viven en la rama `tazkore`; `main` sigue a `upstream`.

## v1.1.0 — Marca al centro (4-nov-2026)

- Versión 1.0.1 → 1.1.0 (`package.json` y `package-lock.json`; `scripts/compilar.mjs` y el servidor la leen de ahí).
- Inicio (chat nuevo): el logo «v!d by Kold.Gold» grande y centrado entre las skills y el compositor, sin acaparar: `clamp(220px, 32%, 420px)` (hasta 300 px con pantallas de menos de 800 px de alto, para que el compositor siga a la vista en 1366×768). Usa el wordmark de `assets/wordmark.svg`, sin su metadato C2PA, copiado a `web/public/wordmark.svg`.
- Pie fijo en la esquina de abajo a la derecha: «un servicio de agentes.kold.gold» (11,5 px, `--muted`), con enlace a https://agentes.kold.gold que Electron abre en el navegador externo. También sale sobre la bienvenida.
- Archivos: `web/src/Marca.tsx`, `web/src/Marca.css`, `web/src/App.tsx`, `web/src/Bienvenida.tsx`, `web/public/wordmark.svg`.
- No hay pantalla de splash propia (la ventana de Electron se muestra al estar lista), así que no se tocó.
- Capturas en `docs/tazkore/capturas-1.1/`.

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

## Fase 4 — agencia, Social Media y skills de Instagram (v!d) (2 nov 2026)

Publicar por la agencia: vid-api de Kold.Gold (Edge Function `vid-api` en Supabase) sobre el Social Planner de GHL
(marca blanca app.kold.gold), con la llave de cada agencia por proyecto, una vista nueva «Social Media» y nueve skills
de redes adaptadas de Instagram Skills (Sergey Bulaev, MIT).

| Qué | Archivos |
| --- | --- |
| Opciones → Agencia: «Llave de agencia v!d» y URL de vid-api por proyecto, más una por defecto; cifradas con AES-256-GCM + DPAPI (`data/agencia/llaves.json`); «Probar conexión» (op `estado`) con agencia, subcuenta y redes con su logo | `web/src/AgenciaOpciones.tsx`, `server/agencia/llaves.ts`, `web/src/Opciones.tsx` (una línea), `web/src/Logos.tsx` (Facebook, LinkedIn, Google) |
| Cliente de vid-api: timeout, reintentos (429 con `Retry-After` siempre; 5xx y red solo en operaciones repetibles, nunca en crear/editar/subir), subida multipart en flujo con avance, errores en español sin la llave | `server/agencia/vid-api.ts` |
| Rutas `/api/agencia/*` (el navegador nunca ve la llave): config, llave, activo, probar/estado, archivo, subir + trabajos (avance), publicar, posts, posts/editar, posts/borrar, plan, skill, entorno (solo procesos locales con `x-vid-token`) | `server/agencia/index.ts`, `server/index.ts` (tres líneas) |
| `VID_AGENCIA_LLAVE` y `VID_API_URL` para los agentes: la llave del proyecto activo (que la ventana sincroniza al servidor), en el entorno que heredan al arrancar; nunca en el primer mensaje ni en logs | `server/agencia/llaves.ts` (`exportar`), `web/src/SocialSkill.tsx` |
| Barra lateral → «Social Media»: proyecto y serie, canal «Por agencia (GHL)» (por omisión) o «Directo (como antes)» (lleva a Mis videos, que sigue subiendo a TikTok, Instagram y YouTube como antes); nueva publicación (videos de Mis videos o archivo, cuentas por red, tipo post/reel/story/carrusel, texto, borrador/programar/ahora, privacidad de TikTok, título de YouTube), subida a GHL con barra y diálogo de confirmación obligatorio antes de programar o publicar | `web/src/SocialMedia.tsx`, `web/src/SocialMedia.css`, `web/src/App.tsx` (entrada y vista) |
| Calendario semanal/mensual (`listar_posts` + borradores locales del plan) con Editar, Reprogramar (con confirmación) y Borrar | `web/src/SocialMedia.tsx` |
| Reglas de vid-api en el cliente y en el servidor antes de mandar (cuentas, reel = 1 video, story = 1 medio, carrusel 2-10 sin mezclar, TikTok solo video de GHL, YouTube video + título ≤ 100, programar ≥ +60 s) | `shared/agencia.ts` (`validarPost`) |
| Skills de redes (van también en la app instalada: `SKILLS_BASE` de `scripts/compilar.mjs`; se enlazan en ~/.claude/skills y ~/.codex/skills como las demás): `social-caption-writer`, `social-carousel-planner`, `social-hook-extractor`, `social-hashtag-strategist`, `social-humanizer`, `social-content-planner`, `social-repurposer`, `social-profile-optimizer`, `social-audience-insights`, con la base `social-base` (referencias, `lib/`, `publicar.mjs` que siempre crea en `draft`, LICENSE MIT y NOTICE con crédito) | `skills/social-*` |
| Botones de skills: «Escribir caption», «Hashtags», «Humanizar y auditar», «Carrusel» en la publicación; «Plan de la semana» (llena el calendario con borradores locales) y «Optimizar perfil» en el calendario; «Extraer gancho» y «Reaprovechar» en cada idea. Corren con `query()` (como el texto de redes), con la memoria del proyecto, y el resultado se edita | `server/agencia/skills.ts`, `web/src/SocialSkill.tsx`, `web/src/Ideas.tsx` (una línea + import) |
| Pruebas con fetch simulado (estado, subir, crear borrador, 429 con Retry-After, errores), cifrado de la llave por proyecto, rutas (confirmación, entorno) y validación | `server/agencia.test.ts`, `shared/agencia.test.ts` |

### Cómo poner la llave

1. Emitirla en kold.gold: ficha de la agencia → tarjeta «v!d — Llave API» (solo superadmin). Para Kold Gold (consumidor
   interno) por SQL: `select vid_llave_emitir(null, 'qfvg0kx2g8DCdPLmIwjx');`. La llave en claro (`kg_live_…`) se ve una
   sola vez; emitir otra rota la anterior.
2. Pegarla en v!d → Opciones → Agencia, en el proyecto (o en «Llave por defecto») → Guardar → Probar conexión.
3. Social Media ya publica por la agencia; los agentes la reciben como `VID_AGENCIA_LLAVE` (la del proyecto activo).

### Skills de Instagram (MIT)

Origen: https://github.com/sergebulaev/instagram-skills (commit `550d3cf`, 27-oct-2026). Se conservan `LICENSE` y un
`NOTICE.md` en `skills/social-base`. Adaptaciones: nombres `ig-*` → `social-*`; publicación con vid-api (no Publora),
desde las skills solo en borrador; leen `MemoriaProyecto:`/`MemoriaSerie:`; ajustes para TikTok, YouTube, Facebook y
LinkedIn (`social-base/references/redes.md`); Pixfaro desactivado (se quitaron `publora_client.py`,
`pixfaro_client.py` y `backend_selector.py`); Apify solo con `APIFY_TOKEN`, con aviso de que cobra por uso.

Sin probar contra vid-api real (no hay llave todavía): todo con fetch simulado. Nada se publicó.

## Fase 5 — avatares y voz (2-nov-2026)

Se construyó el sistema; **no se descargó ningún modelo ni se gastó ningún crédito** al hacerlo. Todo lo pesado queda
detrás de un botón de Opciones → «Avatares y voz».

| Qué | Antes | Ahora | Archivos |
| --- | --- | --- | --- |
| Motor de avatar | Solo sprites (boca abierta y cerrada) | Cinco motores: `sprites` (por omisión, sin cambios), `comfyui-local`, `nube-gratis`, `heygen`, `codex` (orquesta, no genera) | `server/avatar/*`, `shared/avatar.ts`, `server/index.ts` |
| MCP `avatar` | — | `motores`, `generar_avatar`, `estado_avatar`, `avatares_heygen`; viaja con el MCP `voz` (`mcpVoz()`), así que lo llevan Claude, Codex y OpenCode | `server/avatar/mcp.mjs`, `server/voz/index.ts`, `scripts/compilar.mjs` |
| ComfyUI | — | Cliente de su API, detección en `127.0.0.1:8188`, «Instalar ComfyUI portátil» (NVIDIA, ~2 GB) y «Arrancar» como proceso hijo sin ventana | `server/avatar/comfy.ts`, `comfy-instalar.ts` |
| Flujos | — | LatentSync 1.5 (trae su JSON), MuseTalk, InfiniteTalk y FantasyTalking (se importa el flujo API exportado del ejemplo oficial); botón «Instalar modelo» con nodos, pesos con tamaño exacto y reanudación | `server/avatar/flujos.ts`, `flujos/latentsync.json` |
| Nube gratis | — | Cuaderno de Colab para LatentSync 1.5, enlace al Space de Hugging Face e «Importar resultado» | `server/avatar/nube.ts` |
| HeyGen | — | API v3 (avatares, voces, video con audio propio o guion, estado, descarga) y «Hacer en HeyGen con Chrome» (paquete + prompt al portapapeles) | `server/avatar/heygen.ts`, `nube.ts` |
| Voz | Solo Google AI Studio | Segundo proveedor, ElevenLabs (clones incluidos, WAV 24 kHz como AI Studio); `generar_voz` acepta `proveedor`; preferencia global en Opciones | `server/avatar/elevenlabs.ts`, `server/voz/*`, `shared/voz.ts` |
| Llaves | — | ElevenLabs y HeyGen cifradas (AES-256-GCM + DPAPI) en `data/avatar/llaves.json`; la de HeyGen también pasa a `HEYGEN_API_KEY` de los agentes, que es lo que leen sus skills | `server/avatar/llaves.ts` |
| Interfaz | — | Opciones → «Avatares y voz»; menú «Avatar» y voces de ElevenLabs en el compositor; línea `Avatar: <motor>` en el primer mensaje | `web/src/Avatar.tsx`, `Avatar.css`, `Voz.tsx`, `App.tsx`, `Opciones.tsx` |
| Skills | — | `video-base/AVATAR.md` (cómo usar la línea y el fallback a sprites), `VOZ.md` con ElevenLabs, y las skills oficiales de HeyGen (MIT) en `skills/heygen-*` | `skills/video-base/*`, `skills/heygen-*` |

**Qué falta que Alan haga** (nada corre solo):
1. Pegar la llave de **ElevenLabs** (y, si quiere, la de **HeyGen**) en Opciones → Avatares y voz, y pulsar «Probar». Elegir ElevenLabs como proveedor y su voz por omisión (p. ej. «Tazkore IA»).
2. Pulsar **«Instalar ComfyUI portátil»** (descarga ~2 GB; pide 7-Zip o el `tar` de Windows para extraer) y **«Arrancar ComfyUI»**.
3. Pulsar **«Instalar modelo»** del flujo que quiera: LatentSync 1.5 (~5.2 GB más ~0.7 GB que baja el nodo al primer uso; cabe en 8 GB), MuseTalk (~6.8 GB al primer uso; cabe), InfiniteTalk o FantasyTalking (~33 GB, justos en 8 GB y muy lentos). Para estos dos y MuseTalk: abrir el flujo de ejemplo que el botón deja en ComfyUI, elegir sus modelos, exportarlo con «Save (API Format)» y pulsar «Importar flujo».
4. Probar un video corto con cada motor antes de fiarse: **los flujos y los enlaces de pesos se verificaron con peticiones HEAD y leyendo el código de los nodos, pero no se corrieron contra un ComfyUI real**.
5. Si quiere HeyGen con Chrome: tener la extensión de Claude en Chrome y su sesión de HeyGen abierta.

## Fase 6 — 3D, navegador y Feedback (2 nov 2026)

| Qué | Antes | Ahora | Archivos |
| --- | --- | --- | --- |
| Modelos 3D: nuevo | La biblioteca solo se miraba | `modelos.py nuevo <id> --nombre --descripcion [--referencia]` arma el proyecto de prueba compartido (plantilla mínima del explicativo, `node_modules` compartido) y el andamio `src/modelos/<id>.tsx`; botón «Nuevo modelo» (modal con descripción e imagen de referencia) abre un hilo de la card «Nuevo modelo 3D» | `skills/modelos-3d/scripts/modelos.py`, `skills/modelos-3d/SKILL.md` §6, `cards.json`, `server/modelos3d-hilos.ts`, `web/src/Modelos3DAcciones.tsx` |
| Modelos 3D: ampliar | — | `modelos.py ampliar <id> --que …` copia el modelo a `<id>-v2` (renombra lo que exporta, copia sus archivos); botón «Ampliar» en la ficha | ídem |
| Modelos 3D: importar | — | `modelos.py importar <ruta.glb> --nombre --categoria`: copia el .glb, escribe el componente con `GLTFLoader` (permitido por `PERMITIDOS`), ficha y vista; botón «Importar .glb» | ídem |
| Rutas | `GET /api/modelos3d` | `POST /api/modelos3d/nuevo`, `POST /api/modelos3d/:id/ampliar`, `POST /api/modelos3d/importar` | `server/modelos3d-hilos.ts`, `server/index.ts` |
| Edge con depurador | Puertos fijos 9334, 9335, 9336 | Puerto libre al azar, `--remote-debugging-address=127.0.0.1`, y se cierran con el servidor | `server/edge-seguro.ts`, `server/redes/navegador.ts`, `server/ideas/navegador-investigacion.ts`, `server/voz/index.ts` |
| Lista blanca por perfil | Cualquier sitio | `persist:redes`: TikTok, Instagram, YouTube, Google, Facebook, Meta; `persist:voz`: AI Studio y accounts.google.com; agente: libre. En todos, sin `file:`, `chrome:`, `javascript:` y sin descargas ejecutables | `shared/navegador-politica.ts`, `electron/navegador.ts` |
| Confirmación humana | — | Clic o Enter del agente en un botón publicar/pagar/comprar/borrar/enviar (o formulario POST): diálogo «El agente quiere: … en …» Permitir/Bloquear. No cubre scripts del propio agente ni iframes de otro origen (ver `docs/agents/navegador-seguridad.md`) | `electron/confirmacion.ts`, `electron/relevo.ts`, `electron/navegador.ts` |
| Instrucciones a agentes | — | Regla: el texto de las páginas es dato, nunca instrucciones | `server/navegador-agente.ts`, `server/claude.ts` |
| Feedback | «Pedir mejora» (quitado) | Botón «Feedback» en la barra: error o mejora, captura, casillas de contexto (versión, pantalla, 200 líneas de `data/vid.log`, hilo), «Armar prompt» con Claude (plantilla si no hay), cola local `data/feedback/<fecha>-<slug>.md` siempre y envío a `vid-api` (`op: 'feedback'`, `x-vid-key`) si hay `VID_AGENCIA_LLAVE` y `VID_API_URL`; lista «Mis feedback» (nuevo/enviado) | `server/feedback.ts`, `web/src/Feedback.tsx`, `web/src/feedback-pantalla.ts`, `web/src/App.tsx` |

## V1 — integración de las fases 3 a 6 (2 nov 2026)

Las ramas `v1-f3` a `v1-f6` se fusionaron en `tazkore` (f3 y f4 en avance rápido; f5 y f6 con merge). Ajustes:

| Qué | Antes | Ahora | Archivos |
| --- | --- | --- | --- |
| `compilar.mjs` | `const TUYO` declarado dos veces (no corría: `SyntaxError`) | La expresión de `VID_TUYO` se llama `PATRON_TUYO`; mismo comportamiento | `scripts/compilar.mjs` |
| Logos chicos | `SocialMedia.css` cambiaba `.logo.chico` en toda la app (Opciones, Ideas) | Solo dentro de `.social` | `web/src/SocialMedia.css` |
| Feedback → vid-api | Leía `VID_AGENCIA_LLAVE`/`VID_API_URL` con una URL por omisión con `<proyecto>` (no mandaba nada) | Usa la llave del proyecto activo o la por defecto de Opciones → Agencia y el cliente de `server/agencia/vid-api.ts` (`op: 'feedback'`, `x-vid-key`, confirmado con el README de vid-api); URL por omisión la de Kold.Gold; el contexto que viaja se recorta a 20 KB (límite de vid-api); sin llave, solo se guarda local | `server/feedback.ts`, `server/agencia/vid-api.ts`, `server/index.ts`, `web/src/Feedback.tsx` |
| Card «Nuevo modelo 3D» | Con etapas, el compositor le ponía formato, voz y avatar, y `comprobar-skills` le exigía `Formato: horizontal` | Solo las cards con etapas con `fase` (los estilos de video, como `sessions.esVideo`) | `web/src/App.tsx`, `scripts/comprobar-skills.mjs` |
| `comprobar-skills` | Fallaba en las plantillas de reel-collage y video-explicativo (TS2307: `voz.json`, `moneda`, `personaje.json`) cuando los `node_modules` eran los compartidos, sin un video de verdad de donde tomarlos | Si no hay video, se ponen como lo hace el script de crear un video: `modelos.py usar moneda`, el `personaje.json` de la skill y un `voz.json` vacío con la forma de `voz.py` (solo en la carpeta temporal) | `scripts/comprobar-skills.mjs` |

## v1.0.1 — Chrome nativo (3 nov 2026)

El staff usa Mac, donde casi nunca hay Edge: el navegador de v!d pasa a ser Google Chrome instalado.

| Qué | Antes | Ahora | Archivos |
| --- | --- | --- | --- |
| Detección | Rutas de Edge fijas por módulo (Chrome solo de respaldo en Mac/Linux) | Chrome en Program Files, (x86), `%LOCALAPPDATA%`, registro App Paths; `/Applications` y `~/Applications`; rutas y PATH en Linux (`google-chrome`, `chromium`); `VID_CHROME` manda | `server/navegador-sistema.ts` |
| Preferencia | — | Opciones → Navegador: Chrome (por omisión), Edge o Integrado (solo el agente); muestra la ruta de Chrome o el aviso con google.com/chrome; `GET/POST /api/navegador`, `data/navegador-preferencia.json` | `web/src/NavegadorOpciones.tsx`, `server/index.ts` |
| Lanzador | `server/edge-seguro.ts` | `server/navegador-seguro.ts`: Chrome o Edge, 127.0.0.1, puerto al azar, `--no-first-run --no-default-browser-check`, exige `--user-data-dir` de v!d, se cierran al salir | voz, redes, Ideas |
| Perfiles | `data/{voz,redes,investigacion}/perfil` (Edge) | Chrome en `…/perfil-chrome`; se vuelve a iniciar sesión una vez (Voz y Redes lo piden con «Iniciar sesión en Chrome») | `server/voz/index.ts`, `server/redes/*`, `server/ideas/navegador-investigacion.ts` |
| Agente | Navegador integrado de la ventana | Ventana nativa de Chrome por el relevo `server/chrome-agente.ts`: bloquea `file:`/`chrome:`/`javascript:`, cancela descargas ejecutables, confirma publicar/pagar/borrar en la página; «Integrado» como antes | `server/chrome-agente.ts`, `server/navegador-agente.ts`, `docs/agents/navegador-seguridad.md` |
| Skills | `buscarChrome` sin `~/Applications` ni `google-chrome-stable` | Con ellos (Chrome antes que Edge, como ya era) | `skills/video-base/scripts/chrome.mjs` |
| Versión | 1.0.0 | 1.0.1 (dispara «Compilar v!d para Mac») | `package.json` |

## Sincronización con Sloth 2026-11-03 (upstream 7d50117)

Merge (sin rebase) de `upstream/main` (24 commits, de `a90083e` a `7d50117`) en `tazkore`. Conflictos resueltos
conservando siempre el branding v!d by Kold.Gold y las funciones propias (proyectos, agencia, avatares, 3D, Chrome nativo,
Feedback, secretos cifrados, token local).

### Qué se integró

| Qué | Archivos | Ajuste para v!d |
| --- | --- | --- |
| Google Flow: imágenes (Nano Banana) y videos (Veo/Omni) con la cuenta de la voz y hasta 50 cuentas más, créditos en Opciones y en el chat, menú «Imágenes» del compositor | `server/flow/*`, `shared/flow.ts`, `web/src/Flow.tsx`, `skills/video-base/FLOW.md`, ADR 0014 y 0015 | Las cuentas abren el navegador elegido en Opciones → Navegador (Chrome por omisión) con `--remote-debugging-address=127.0.0.1`; archivo de puerto `puerto-vid`; el MCP `flow` usa `VID_URL` y manda `x-vid-token` (sin él, el servidor lo rechazaba); `compilar.mjs` copia `server/flow/mcp.mjs`. «Ayudar a mejorar Flow» sigue apagado por omisión |
| Frutinovela (card y skill) | `cards.json`, `skills/frutinovela/*` | `from vid import transcribir`; textos con v!d |
| Gemini CLI por ACP con llave de AI Studio | `server/gemini.ts`, `server/acp.ts`, ADR 0013 | MCP de v!d (`mcpVid`), etiqueta `<vid>` |
| Antigravity: errores de cuota en español, relevo a una sesión nueva con resumen | `server/antigravity.ts`, `server/relevo.ts`, `server/sessions.ts` | El resumen va después de la memoria del proyecto (`contexto + antes + mensaje`) |
| Círculo de contexto → botón «Uso» (chat, plan y créditos de Flow), compactar | `web/src/LimitesContexto.tsx`, `web/src/styles.css`, `web/src/App.tsx` | - |
| Botón «Actualizar los agentes» (Claude Code, Codex, OpenCode; solo agentes, no la app) | `server/agentes.ts`, `server/index.ts`, `web/src/AvisoAgentes.tsx` (nuevo) | Se sacó de `Actualizar.tsx` a su propio archivo: el actualizador de la app sigue quitado. Carpeta `vid-koldgold/piezas/agentes(-arm64)` |
| Claude Code bajado a medias (EFTYPE), binario de Mac que falta | `server/agentes.ts`, `server/claude.ts` | - |
| FFmpeg en Windows sin winget (BtbN), Python propio cuando el del sistema no tiene ruedas | `server/requisitos.ts`, `scripts/start.mjs` | Se mantiene `YT_DLP` fijado (Fase 1) y `vid-koldgold/piezas`; se retiró `pythonFueraDelPath` (upstream ya no lo usa) |
| AI Studio: espera la bienvenida/términos, sesión vieja | `server/voz/index.ts`, `web/src/Voz.tsx` | Se conserva `navegador-seguro.ts` (puerto al azar, 127.0.0.1, Chrome/Edge según Opciones, perfiles `-chrome`) en vez del puerto fijo 9336 y `chromiumDelSistema` de Sloth; se conservan ElevenLabs y `entrarEnChrome` |
| Clic derecho (Cortar, Copiar, Pegar, Seleccionar todo) | `electron/clic-derecho.ts`, `electron/main.ts` | - |
| Grok «Cerrar sesión» | `server/grok.ts`, `web/src/Opciones.tsx` | Texto con v!d |
| Mac Apple Silicon: agentes aparte (`agentes-arm64`), `open -n` para traer la ventana al frente | `server/agentes.ts`, `server/chromium.ts` | El build arm64 ya lo hace `.github/workflows/compilar-mac.yml` del fork |
| Chat, markdown, eventos | `web/src/Timeline.tsx`, `markdown.ts`, `eventos.ts`, `items.ts`, `Composer.tsx` | - |

Textos nuevos que decían «Sloth» como nombre de la app pasan a «v!d» (código, interfaz, skills y `docs/agents/mapa.md`).
Se dejan como estaban los créditos a Vancci, LICENSE, NOTICE y los ADR de upstream.

### Qué se descartó y por qué

| Qué | Por qué |
| --- | --- |
| `licencias/` (cupos de la comunidad, migración `0012_cupos.sql`), `server/licencia.ts`, `server/comunidad.ts`, `web/src/Licencia.tsx`, `web/src/Liberar.tsx` | Cobro y comunidad del creador, quitados en Fase 1 |
| `web/src/Actualizar.tsx` (actualizador de la app), canal `latest-arm64` y `publish` en `compilar.mjs`, `SO`/`/ultima`/`/descargar` en `electron/main.ts` | Actualizador automático del creador (habla con `api.sloth.vancci.org`) |
| `scripts/publicar.mjs`, `.github/workflows/venta.yml`, flujo de venta de `docs/agents/publicacion.md`, descargas del README | Flujo de venta del creador |
| Tipos de comunidad y `VersionLiberable` en `shared/types.ts` | Solo servían a lo anterior |
| Versión `0.3.44`/nombre `sloth-2` de `package.json` | v!d sigue en `vid-koldgold` 1.0.1 |
| `macos-15` en `.github/workflows/comprobar.yml` | Cambiar workflows pide el permiso `workflow` del token; el build Apple Silicon ya lo hace `compilar-mac.yml` |

### Seguridad

- Sin telemetría, backdoors ni dominios nuevos del creador en el código integrado. Lo nuevo solo habla con Google
  (Flow, AI Studio, `generativelanguage.googleapis.com`), `registry.npmjs.org` (versiones de agentes), GitHub (FFmpeg de
  BtbN) y los proveedores de IA que ya había. Todo lo que apuntaba a `api.sloth.vancci.org` venía del actualizador y del
  cobro, y se descartó.
- Upstream abría los navegadores de la voz, las redes y Flow con `--remote-debugging-port` sin `--remote-debugging-address`
  y en puertos fijos (9334, 9336). v!d conserva el lanzador seguro (puerto al azar, solo 127.0.0.1) en voz y redes, y a
  las cuentas de Flow se les agregó `--remote-debugging-address=127.0.0.1`.
- El MCP `flow` de upstream no mandaba credencial: ahora manda `x-vid-token` como los demás clientes locales.
- Gemini CLI corre con `GEMINI_CLI_TRUST_WORKSPACE` (confía en la carpeta del hilo) y sin el actualizador ni las
  estadísticas de Gemini: igual que los otros agentes, que ya corren sin permisos.

Verificación: `npm run typecheck` sin errores; `npm test` 353/353.

## v1.1 — Historial de Sloth (4 nov 2026)

Los hilos y videos que Alan hizo en el Sloth original ya están en v!d, cada uno en su proyecto.

- `server/importar-sloth.ts`: importa desde la carpeta de app de Sloth (la detectada o la que se diga). COPIA, nunca
  mueve ni borra: hilos (`.json`/`.jsonl`, sin pisar ids de v!d: si chocan, `<id>-sloth`), sus carpetas de trabajo
  (`trabajo/<card>`), `attachments`, `miniaturas` y `previas`. Reescribe en los registros las rutas de trabajo,
  attachments y skills de Sloth a las de v!d (con `\`, `\\` de JSON y `/`). Los enlaces de la copia que apuntaban dentro
  del trabajo de Sloth se rehacen a la copia (con la ruta real: en el paquete MSIX de Claude, `AppData\Local` está
  virtualizada). Si la carpeta de etapas de un hilo nunca sale en su historial, se corrige a la que sí sale.
- La sesión de Claude Code de cada hilo (`projects/<cwd>/<id>.jsonl` y su carpeta) se copia del `~/.claude` de Sloth al
  `CLAUDE_CONFIG_DIR` de v!d, en la carpeta del cwd nuevo y con las rutas reescritas: el hilo se continúa igual. Sin
  sesión, el hilo queda como historial y el siguiente mensaje empieza otra con su resumen (`resumir`).
- Proyecto y serie por hilo (`asignacionAlan`): todo a Kold.Gold salvo el sketch de roast (Tazkore IA); el Radar a la
  serie `kold-gold-radar`. Series nuevas en Kold.Gold con su memoria: `5-datos` («5 datos que te harán reír de la
  logística») y `estafas` («Desmontando estafas», la del banco de video-base).
- `data/importado-de-sloth.json` registra lo importado: volver a correrlo no duplica nada.
- `POST /api/importar/sloth` (opcional `{ carpeta }`) y `Sessions.incorporar`, que suma los hilos nuevos sin reiniciar.
- Opciones → «Historial de Sloth» con el botón «Traer historial de Sloth» y el resultado (`web/src/HistorialSloth.tsx`).

Importación hecha en desarrollo (`C:\tazkore-sloth\data` y `%LOCALAPPDATA%\vid-koldgold-dev\trabajo`): 11 hilos, 4
carpetas de trabajo (kold-gold, reel-collage, video-el-diff, video-explicativo; ~4 GB, 55 mp4) y 15 adjuntos. Los 11
tenían su sesión de Claude Code: todos se pueden continuar.

Verificación: `npm run typecheck` sin errores; `npm test` 356/356.

### v1.1 — Trabajo de desarrollo fuera de AppData (4 nov 2026)

En Windows, el paquete MSIX de Claude Desktop virtualiza `AppData\Local`: un v!d arrancado desde Claude Desktop veía
`%LOCALAPPDATA%\vid-koldgold-dev\trabajo` en `AppData\Local\Packages\Claude_…\LocalCache\Local\…`, y uno arrancado desde
la terminal no lo veía.

- `server/trabajo.ts`: `TRABAJO_DEV` = `VID_TRABAJO`, o en Windows `C:\vid-datos\trabajo` (fuera de Windows, lo de
  antes). `TRABAJO_DEV_VIEJO` es la de AppData.
- `server/migrar.ts` (`migrarTrabajo`, desde `migrar-arranque.ts`): al arrancar, si la nueva no existe y la vieja sí, la
  copia sin borrar nada (`copiarConEnlaces`: los enlaces se recrean, no se copia lo que hay detrás), rehace los enlaces
  que apuntaban dentro de la vieja (o a su ruta física virtualizada) hacia la copia y deja `migrado-de-appdata.txt`.
- `reescribirSesiones` ahora también reescribe el registro (`.jsonl`, con respaldo; su vista se rehace), el nombre con
  guiones de la carpeta, las sesiones de Claude copiadas a la carpeta de `projects` del cwd nuevo y la marca
  `importado-de-sloth.json`. `cambiosDeRuta`, `repuntarEnlaces` y `recorrer` pasan aquí desde `importar-sloth.ts`.
- Espacio en disco y `scripts/comprobar-skills.mjs` miran también la carpeta nueva.

Hecho en desarrollo: 12 hilos con su cwd bajo `C:\vid-datos\trabajo` (56 mp4, ~4.3 GB), sus 12 sesiones de Claude en
`data/claude/projects/C--vid-datos-trabajo-*`, el enlace de «Mito o realidad» apuntando a la copia nueva. La carpeta vieja
quedó intacta. Verificación: `npm run typecheck` sin errores; `npm test` 357/357.

## v1.1 — Optimización (tokens, NVENC, música, voz) (4 nov 2026)

Base: auditoría de 12 videos reales (202 USD en total). Kold Gold promediaba 21.5 USD y ~56 min por video, con el render
en solo 3–5 min: lo caro era el contexto del hilo (450–565 mil tokens, releído en ~400 llamadas), la configuración
global de Claude que se colaba, las imágenes leídas por el hilo principal, Opus high para todo y 216 `tsc`.

| Qué | Antes | Ahora | Medido / archivos |
| --- | --- | --- | --- |
| Configuración de Claude | La app instalada usaba `~/.claude`: plugins (ECC y su hook GateGuard, que bloqueó ~90 llamadas), CLAUDE.md global, MCP y agentes del usuario en cada hilo | Siempre la propia de v!d, `<app>/data/claude` (`CLAUDE_CONFIG_DIR`), también en la que se vende: solo `skills` (unión a `~/.claude/skills` en la que se vende, a las del repo en desarrollo) y `projects` (unión a `~/.claude/projects`, para seguir los hilos de antes). La primera vez copia solo `.credentials.json` y la cuenta (`oauthAccount`, `userID`) de `.claude.json`; nunca settings, plugins, hooks ni MCP. `settingSources` sigue con `'user'`, que ahora es la de v!d (de ahí salen las skills) | Contexto al arrancar un hilo (`getContextUsage`, mismo proyecto, sin los MCP de v!d): **63 959 → 18 130 tokens (−72 %)**; se van «Custom agents» 22 274, «MCP server instructions» 12 746 y «MCP tools» 8 437. `server/skills.ts` (`configClaude`, `heredarSesion`), `server/index.ts`, `server/claude.ts`, `server/cuenta.ts` |
| Modelos por tarea | Solo El Diff tenía bloque `modelos`; Kold Gold y el explicativo lanzaban subagentes «con tu mismo modelo» (Opus high) | `modelos` en `kold-gold` y `video-explicativo`: hilo Opus 5.5 **medium**; subagentes `modelos` (3D) Sonnet high, `subtítulos` Haiku, `imágenes` (vistas, hojas, parecidos) Sonnet medium. Las skills leen la línea `Subagentes:` y, sin ella, usan esos mismos | Sin medir aún (marcado así en `medido`). `cards.json`, `skills/{kold-gold,video-explicativo}/SKILL.md` |
| Imágenes | El hilo abría `vista.webp` (224 veces en un video), las hojas del borrador, `parecidos.jpg` y las fotos | Las mira un subagente `imágenes` que devuelve texto; `modelos.py buscar` ya no imprime la ruta de la vista (con `--rutas`, sí, para el subagente) y `vitrina.mjs` imprime «<id>: vista lista»; `final.py` y `PORTADA.md` piden subagente | `skills/modelos-3d/scripts/{modelos.py,vitrina.mjs}`, `skills/modelos-3d/SKILL.md`, `skills/*/scripts/final.py`, `skills/video-base/PORTADA.md` |
| `tsc` | `npx tsc --noEmit -p .` tras cada cambio (216 en un video) | Una vez por tanda de cambios, incremental (`out/tsc.tsbuildinfo`, también en el `tsconfig.json` de las plantillas) | En 5-datos-01-10 (con `npx`): 7.0 s en frío → 3.8 s sin cambios y 4.8 s tras un cambio. `skills/{kold-gold,video-explicativo}/SKILL.md`, `plantilla/tsconfig.json` |
| Videos a la vez (`CABEN`) | min(hilos/3, RAM/4 GB): 8 en esta PC | También 1 por cada 4 GB de VRAM de la NVIDIA (`nvidia-smi`, una vez al arrancar): **2** con la RTX 4060 de 8 GB | `server/tope-agentes.ts` (`cabenALaVez`, `vramNvidia`), `server/sessions.ts` |
| Subagentes a la vez (`TOPE_AGENTES`) | 1 por cada 2 GB, sin techo (16 en 32 GB) | Entre 3 y **6** | `server/tope-agentes.ts` (`topeAgentes`); pruebas en `server/tope-agentes.test.ts` |
| Portada sin recodificar | Nunca se lograba con un render de Remotion: su H.264 marca `chroma_location=center` y el cuadro de la portada no; ningún preset daba las mismas cabeceras y se recodificaba todo el video con x264 medium | `portada.mjs` pasa `-x264-params chromaloc=N`: pega la portada sin recodificar | Final de 80 s (1920×1080): **13 s recodificando → 2.9 s**, los 2411 cuadros idénticos (framemd5). `skills/video-base/scripts/portada.mjs` |
| NVENC con respaldo | x264 en todo | `codificadorH264()` prueba `h264_nvenc` con un cuadro (caché de un día en `%TEMP%/vid-h264.json`; `VID_SIN_NVENC=1` lo apaga); `-preset p5 -rc vbr -cq 19 -b:v 0`, y si falla, libx264. Lo usan `portada.mjs` (cuando tiene que recodificar) y `frutinovela/unir.py` | Recodificar un final de 66 s 1080×1920: NVENC **6.4 s** contra x264 12.7 s; SSIM 0.9982 contra 0.9986 (frente al original); pesa 96 MB contra 64 MB. `skills/video-base/scripts/ffmpeg.mjs`, `skills/frutinovela/scripts/unir.py`. El render de Remotion sigue en x264 (su FFmpeg no trae NVENC) |
| Música en Kold Gold | Solo si había pista en `fuentes/musica/` (nunca) | Siempre: la de `fuentes/musica/` o una sintetizada del largo del video (`video-base/scripts/musica.py`: 92 BPM, pad, bajo, arpegio y batería suave; senos, ruido y filtros, sin muestras), a −34 LUFS, con ducking (`sidechaincompress`) bajo la voz y limitador; solo audio (`-c:v copy`). `--sin-musica` la quita | En un final de 80 s: 4.7 s; `comprobar.mjs` en verde (−14.2 LUFS, −4.1 dBTP) y la portada se sigue pegando sin recodificar. `skills/kold-gold/scripts/final.py`, `skills/kold-gold/KOLD-GOLD.md` |
| Voz | `acelerar.py` con `atempo` 1.12 y pausas de 0.18 s (sonaba apurada) | 1.05 y 0.25 s | Misma voz (5-datos-01-10): 63.0 s → 69.2 s, 182 → 166 palabras por minuto en esa voz. `skills/kold-gold/plantilla/scripts/acelerar.py`, `GUION.md` (~205 ppm, ~3.4 palabras/s) |
| Compactar antes | Al llegar cerca del límite del modelo | Opción **apagada**: `VID_AUTOCOMPACTAR=200000` (100 000–1 000 000) pasa `autoCompactWindow` a Claude Code. Riesgo: el resumen pierde detalle (rutas, decisiones, lo que dijo el usuario); encenderla solo tras un lote de prueba | `server/claude.ts` (`compactarAntes`) |
| Python de las skills | — | Sin cambio: el Python de v!d (`%APPDATA%\youtube\piezas\python\3.12.15-cu128-sloth`) no trae rembg, cv2 ni soundfile, que las skills usan; el del sistema (3.14) sí. v!d ya pone delante su Python propio (`%APPDATA%\vid-koldgold\piezas\python`) cuando instala uno porque el del sistema no servía | `scripts/start.mjs`, `server/requisitos.ts` |

Ahorro estimado por video de Kold Gold (base 21.5 USD y ~56 min; **estimado, no medido en un video completo**):
- Configuración aislada: ~46 mil tokens menos en cada una de ~400 llamadas (~18 M tokens, casi todos de caché) y sin
  las ~90 llamadas que GateGuard bloqueaba.
- `tsc`: de 216 a una o dos decenas; cada llamada que no se hace es una relectura menos del contexto.
- Imágenes fuera del hilo y subagentes en Sonnet/Haiku: el contexto del hilo deja de crecer con cada vista y hoja.
- Con todo, se espera bajar de 21.5 a unos 10–13 USD (−40 a −55 %) y unos 10–15 min; hay que confirmarlo con el
  primer lote de v1.1 (gasto por hilo en v!d). Portada: −10 s por final; NVENC: −50 % cuando hay que recodificar.

Pendiente de medir: el efecto de Opus medium en la calidad del hilo de Kold Gold, y `VID_AUTOCOMPACTAR`.

## v1.1 — Lip-sync de sprites y motores locales listos (4 nov 2026)

**Lip-sync de sprites (sin GPU).** La boca del personaje pasa de 2 estados movidos por RMS a 4 formas: cerrada, media, abierta y «o» redonda.

| Qué | Archivos |
| --- | --- |
| Medición por cuadro con energía + centroide espectral (numpy), suavizado, histéresis, duración mínima por forma (~60 ms) y cierre en silencios. `python -B scripts/bocas_voz.py audio` imprime la distribución | `skills/kold-gold/plantilla/scripts/bocas_voz.py` (nuevo), `alinear.py` (`nivel_por_cuadro` ahora la usa; `KG_BOCAS=2\|3` limita las formas) |
| Compatibilidad: `voz.json["boca"]` sigue siendo un número por cuadro; cada forma ocupa una banda (cerrada ≤0.15, media 0.31–0.60, abierta 0.61–1, «o» = 2 + nivel). Un `Personaje.tsx` viejo sigue abriendo la boca y `acelerar.py` recibe las formas sin tocarlo | `bocas_voz.py`, `src/piezas/Personaje.tsx` (`formaDe`, `fotoBoca`) |
| Si la pose solo trae `cerrada` y `abierta`, cae a 2 bocas (media y «o» usan la abierta) | `Personaje.tsx` |
| Fotos `-media.webp` y `-o.webp` generadas desde cerrada+abierta (mezcla al 50 % y boca abierta encogida a lo ancho). Las poses cuya foto abierta rehace más que la boca (zorra-kold) se quedan con 2 bocas | `plantilla/scripts/bocas_variantes.py` (nuevo), `skills/kold-gold/personaje/perro/*-media.webp`, `*-o.webp`, `personaje/personaje.json` |

**Motores locales preparados (apagados hasta detectar que están instalados).**

| Qué | Archivos |
| --- | --- |
| Estado «No instalado / parcial / instalado / corriendo» con texto que dice qué falta, para LatentSync (ComfyUI, nodo, VideoHelperSuite, checkpoints 1.5) y Chatterbox (venv, paquete, servidor). `EstadoAvatar.locales`; `GET /api/voz/chatterbox` | `server/avatar/local.ts` (nuevo), `shared/avatar.ts`, `server/avatar/index.ts` |
| LatentSync: ya existía el flujo `latentsync.json`; ahora el motor `comfyui-local` no lo corre si falta algo y dice qué. ComfyUI también se busca en `C:\vid-ia\ComfyUI` | `server/avatar/index.ts`, `server/avatar/comfy-instalar.ts` |
| Chatterbox (voz gratis, local, español, clonación): cliente HTTP, arranque del servidor bajo demanda y proveedor `chatterbox` en `/api/voz/generar` y en el MCP `voz` | `server/avatar/chatterbox.ts` (nuevo), `scripts/chatterbox-servidor.py` (nuevo), `server/voz/index.ts`, `server/voz/mcp.mjs`, `server/avatar/config.ts` (`chatterboxRaiz`, `chatterboxReferencia`; `vozProveedor` acepta `chatterbox`; `/api/avatar/config` las guarda), `shared/types.ts` |
| Instalador que Alan correrá cuando lo autorice (sin `-Autorizado` solo muestra el plan): ComfyUI portátil en `C:\vid-ia\ComfyUI` + nodo LatentSync + checkpoints 1.5; venv `C:\vid-ia\chatterbox` con Python 3.11, torch CUDA y chatterbox-tts. Ventanas minimizadas en la pantalla 2, registros en `C:\vid-ia\logs` | `scripts/instalar-ia-local.ps1` (nuevo) |
| Pruebas con fetch simulado | `server/avatar-local.test.ts` (nuevo) |

Pendiente: probar LatentSync y Chatterbox contra los motores reales, que no se han instalado.

## v1.1.0 — Entrega (4 nov 2026)

Unión de `v11-importar`, `v11-marca`, `v11-optimiza` y `v11-avatar` en `tazkore`, y:

- Opciones → Avatares y voz: estado de LatentSync y Chatterbox (`EstadoAvatar.locales`: «No instalado: …»), campos
  «Carpeta de Chatterbox» (`chatterboxRaiz`) y «Voz de referencia» (`chatterboxReferencia`), que guarda
  `/api/avatar/config`, y Chatterbox en el proveedor de voz (`web/src/Avatar.tsx`).
- Datos fuera de la carpeta del programa (`server/datos-fuera.ts`): en Windows, si existe `C:\vid-datos` (o con
  `VID_DATOS` y `VID_TRABAJO`), la ventana instalada (`electron/main.ts`) pone `app\data` y `app\trabajo` como uniones a
  `C:\vid-datos\data` y `C:\vid-datos\trabajo` antes de abrir nada. Lo que hubiera dentro se mueve a la de fuera si está
  vacía; si las dos tienen algo, la de dentro se aparta (`*.antes-de-vid-datos-<fecha>`). `carpetaTrabajo` de la
  instalada usa la de fuera, así los hilos tienen el mismo `cwd` que en el repo y sus sesiones de Claude la misma carpeta
  en `data\claude\projects`. El desinstalador quita primero solo la unión (`RMDir` sin `/r`): lo de `C:\vid-datos` se queda.
  Pruebas: `server/datos-fuera.test.ts`.

Verificación: `npm run typecheck` sin errores; `npm test` 377/377.

## v1.1.1 — La instalada usa siempre sus propias skills (4 nov 2026)

En la PC de Alan, `~/.claude/skills` tenía `kold-gold`, `video-base`, `video-el-diff`, `video-explicativo`, etc. como
uniones a un build viejo de Sloth (`C:\sloth\dist\…`, del 1 de noviembre). La 1.1.0 instalada buscaba ahí sus skills
(`SKILLS = ~/.claude/skills`) y `enlazarSkills` no pisaba lo que ya estaba: «Con tus cambios (47)» contaba las
diferencias con Sloth, a Codex y a los scripts (`VID_SKILLS`) les llegaban las de Sloth.

- `server/skills.ts`: `SKILLS` es siempre `<app>/skills` (la carpeta con `cards.json`, en el repo y en la que se vende;
  `VID_SKILLS` sigue mandando). De ahí salen «Con tus cambios», la ruta de la skill que se le pasa a Codex y `VID_SKILLS`.
- `skillsDeClaude`: en la que se vende, `data\claude\skills` (la de `CLAUDE_CONFIG_DIR`) es una carpeta con una unión por
  skill: las de v!d y, con otro nombre, las del usuario en `~/.claude/skills` (se siguen pudiendo usar). Con el mismo
  nombre gana la de v!d. Si era una unión a toda una carpeta (la 1.1.0), se quita solo la unión. Corre al arrancar
  (`configClaude`) y cuando «Nuevo estilo» hace uno.
- `enlazarSkillsCodex` enlaza las de `<app>/skills`, no las de `~/.claude/skills`. v!d ya no escribe en `~/.claude`
  (`enlazarSkills` ya no se llama). `guardarSkillTuya` quita la unión de `data\claude\skills`.
- Pruebas nuevas en `server/skills.test.ts` (la de v!d gana a la de otra app, uniones rotas, la carpeta de la 1.1.0).

Verificación: `npm run typecheck` sin errores; `npm test` 379/379.
