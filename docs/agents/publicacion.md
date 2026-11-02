# Comprobar y publicar Sloth

## Comprobación sin publicar

`Comprobar Sloth` (`.github/workflows/comprobar.yml`) se ejecuta al subir a `main`, en las PR hacia `main` y a mano
desde Actions. En Windows, Mac y Linux instala las dependencias y FFmpeg, corre `npm test`, `npm run comprobar-skills`
y `npm run compilar -- --sin-instalador`. Este último incluye `npm run typecheck`, arma la interfaz y el servidor,
comprueba sus paquetes, revisa que lo que se vende no lleve nada del creador ni React en modo desarrollo y empaqueta
Electron. También prueba el caso de secretos de Apple vacíos: Mac usa firma ad hoc.

No cambia la versión, no arranca la app ni sube archivos a ningún servidor. Comprueba compilación y empaquetado; los instaladores
y la firma con certificado de Apple se hacen en `venta`. Para repetirlo en esta computadora, con FFmpeg en el PATH
(las pruebas de YouTube generan videos y extraen fotogramas):

```powershell
npm ci --no-audit --no-fund
npm test
npm run compilar -- --sin-instalador
```

El instalador no trae el programa de Claude Code, Codex ni OpenCode (ADR 0009): `compilar` deja fuera los opcionales
de npm, que son justo esos programas, y la app los baja al elegir cada agente. En `dist/` no debe haber ninguna
carpeta `claude-agent-sdk-<sistema>` ni `codex-<sistema>`. Para probar la descarga, abre la app compilada en una
cuenta sin `%APPDATA%\sloth\piezas\agentes` y elige cada agente.

Cada sistema se comprueba en el suyo. Antes de publicar, comprueba que los tres resultados de `Comprobar Sloth`
corresponden al commit de `main` que vas a subir y terminaron bien. Este workflow informa; no configura protección de
ramas ni bloquea por sí solo un push a `venta`.

## App instalada

v!d (Fase 1) no tiene pagos, comunidad ni actualizaciones automáticas: se quitaron `licencias/`, `npm run publicar`,
`scripts/anuncio.mjs` y electron-updater. El instalador sale de `npm run compilar` y una versión nueva se instala encima
de la anterior. La distribución propia se definirá en otra fase.

## Publicaciones de Instagram: nube/

El Worker `sloth-redes`, con R2 y su cron, se configura en `nube/wrangler.jsonc`. Desde la raíz:

```powershell
npm run nube -- deploy
```

Comprueba el despliegue de `sloth-redes` en Cloudflare y sus registros si cambiaste el cron. «Reiniciar backend»
solo afecta al servidor local. `scripts/nube.mjs` usa una sesión de Cloudflare propia de Sloth; si falta,
`npm run nube -- login` la abre. La cuenta de Cloudflare no va en el repo: es la variable
`SLOTH_CLOUDFLARE_CUENTA` (su id) de quien despliega.
