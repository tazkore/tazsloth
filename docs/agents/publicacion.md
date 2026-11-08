# Comprobar y publicar v!d

## Comprobación sin publicar

`Comprobar v!d` (`.github/workflows/comprobar.yml`) se ejecuta al subir a `main`, en las PR hacia `main` y a mano
desde Actions. En Windows, Mac y Linux instala las dependencias y FFmpeg, corre `npm test`, `npm run comprobar-skills`
y `npm run compilar -- --sin-instalador` (en Windows, sin esa opción, para generar también el instalador). Compilar incluye `npm run typecheck`, arma la interfaz y el servidor,
comprueba sus paquetes, revisa que lo que se vende no lleve nada del creador ni React en modo desarrollo y empaqueta
Electron. También prueba el caso de secretos de Apple vacíos: Mac usa firma ad hoc.

No cambia la versión, no arranca la app ni sube archivos a ningún servidor. En Windows ejecuta además el NSIS real dos
veces en una carpeta temporal del runner y comprueba que instalar encima conserve los datos
(`scripts/comprobar-instalacion.mjs`). Ese script solo permite el Windows desechable de GitHub: registra y desinstala
v!d y no se debe correr donde ya se usa. La firma con certificado de Apple se hace aparte. Para repetir la comprobación
sin instalar en esta computadora, con FFmpeg en el PATH
(las pruebas de YouTube generan videos y extraen fotogramas):

```powershell
npm ci --no-audit --no-fund
npm test
npm run compilar -- --sin-instalador
```

El instalador no trae el programa de Claude Code, Codex ni OpenCode (ADR 0009): `compilar` deja fuera los opcionales
de npm, que son justo esos programas, y la app los baja al elegir cada agente. En `dist/` no debe haber ninguna
carpeta `claude-agent-sdk-<sistema>` ni `codex-<sistema>`. Para probar la descarga, abre la app compilada en una
cuenta sin `%APPDATA%\vid-koldgold\piezas\agentes` y elige cada agente.

### Windows: error al escribir `app-64.7z\Uninstall v!d by Kold.Gold.exe`

El destino de ese error es un archivo comprimido tratado como carpeta. Sloth lo reprodujo con el NSIS y las plantillas
de electron-builder 26.15.3 forzando que `Nsis7z` no cargue: su argumento queda en la pila, `Pop $R0` lo toma como el
directorio de salida y NSIS intenta escribir allí. No atribuirlo al antivirus o a los permisos sin el diagnóstico de
esa PC.

`scripts/instalador-config.ts` usa ZIP y desactiva `differentialPackage`. Deben ir juntos: con esa versión del builder,
activar solo `useZip` crea un 7z que luego se intenta abrir como ZIP. `electron/instalador.test.ts` compila y ejecuta el
extractor real, simula el DLL incompatible y comprueba que se escriba en la carpeta y se conserven los datos al
instalar encima.
También desactiva `preCompressedFileExtensions`: el builder excluye los videos del ZIP y solo los repone desde
`resources`, pero en Windows los de v!d van en `app/web`. La prueba usa el empaquetado real de NSIS y comprueba que
lleguen los `.mp4` y `.webm`.

Si a alguien le sale: «Anular» (no «Omitir», que deja incompleta la instalación), cerrar v!d y el instalador, reiniciar
e instalar encima la versión corregida en la misma carpeta, sin desinstalar ni borrar `app/data`, `app/trabajo` o
`app/skills`.

Cada sistema se comprueba en el suyo. Antes de publicar, comprueba que los tres resultados de `Comprobar v!d`
corresponden al commit de `main` que vas a subir y terminaron bien. Este workflow informa; no configura protección de
ramas ni bloquea por sí solo un push a `venta`.

## App instalada

v!d (Fase 1) no tiene pagos, comunidad ni actualizaciones automáticas: se quitaron `licencias/`, `npm run publicar`,
`scripts/anuncio.mjs` y electron-updater. El instalador sale de `npm run compilar` y una versión nueva se instala encima
de la anterior. La distribución propia se definirá en otra fase. Una versión grande puede llevar su guía animada
(`web/src/Novedades.tsx`, la 1.1.7 en `web/public/novedades/1.1.7.html`), que sale una vez al abrirla a quien la
instaló encima de otra; su número va en `VERSION` de `Novedades.tsx`.

## Publicaciones de Instagram: nube/

El Worker `vid-redes`, con R2 y su cron, se configura en `nube/wrangler.jsonc`. Desde la raíz:

```powershell
npm run nube -- deploy
```

Comprueba el despliegue de `vid-redes` en Cloudflare y sus registros si cambiaste el cron. «Reiniciar backend»
solo afecta al servidor local. `scripts/nube.mjs` usa una sesión de Cloudflare propia de v!d; si falta,
`npm run nube -- login` la abre. La cuenta de Cloudflare no va en el repo: es la variable
`VID_CLOUDFLARE_CUENTA` (su id) de quien despliega.
