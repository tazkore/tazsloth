> **v!d by Kold.Gold** es el fork de uso interno de Tazkore basado en v!d de Vancci. No está afiliado a Vancci ni se vende. Cambios: [docs/tazkore/CAMBIOS.md](docs/tazkore/CAMBIOS.md).

<p align="center">
  <img src="docs/imagenes/portada.png" alt="v!d: videos verticales que se hacen casi solos" width="100%">
</p>

<p align="center">
  <img alt="Windows, Mac y Linux" src="https://img.shields.io/badge/Windows%20%C2%B7%20Mac%20%C2%B7%20Linux-171512?logo=electron&logoColor=ede6d6">
  <img alt="Con Claude" src="https://img.shields.io/badge/con-Claude-e8a33d?labelColor=171512">
  <a href="LICENSE"><img alt="Licencia" src="https://img.shields.io/badge/licencia-Apache%202.0%20%2B%20Commons%20Clause-ede6d6?labelColor=171512"></a>
</p>

---

**v!d** es una app de escritorio que hace videos verticales para TikTok, Reels y Shorts. Eliges un estilo, le das
un tema o un enlace, y un agente de IA investiga, escribe el guion, te pide tu voz y edita el video en tu
computadora. No es una caja negra: lo ves trabajar paso a paso y le pides cambios con tus palabras.

Es gratis, sin tarjeta y sin límite de videos. Trabaja con la IA que ya tengas: Claude, ChatGPT, OpenCode (que tiene
modelos gratis) u otra.

## Ejemplos

<table>
  <tr>
    <td align="center" width="50%">
      <img src="docs/imagenes/el-diff.gif" alt="Un episodio de El Diff" width="270"><br>
      <b>El Diff</b><br>
      <sub>Tu noticiero vertical, con tu nombre, tu sello y tu despedida. De una a dos horas por episodio.</sub>
    </td>
    <td align="center" width="50%">
      <img src="docs/imagenes/explicativo.gif" alt="Un video explicativo" width="270"><br>
      <b>Video explicativo</b><br>
      <sub>Cualquier tema en un mundo 3D que la cámara recorre sin cortes, con el texto palabra por palabra. Unos 40 minutos.</sub>
    </td>
  </tr>
</table>

## Cómo funciona

Cada estilo de video es una **card**. Escribes qué quieres y el agente avanza por cinco fases, que ves en el estudio:

| Fase | Qué pasa |
| --- | --- |
| **Idea** | Investiga el tema: lee el enlace, busca las fuentes y junta el material (capturas, clips, datos). |
| **Guion** | Escribe el guion en el tono del estilo, con su gancho de 3 segundos y su cierre. |
| **Sonido y voz** | Te pide tu voz (la grabas con el celular) o, en El Diff, la pone una voz de Gemini si quieres. |
| **Video** | Arma cada escena con Remotion y la renderiza en tu computadora. |
| **Entrega** | El video final con su portada, listo para descargar o publicar. Si algo no te gusta, se lo dices. |

<p align="center">
  <img src="docs/imagenes/estudio.jpg" alt="El estudio de v!d: las cinco fases, el video y la línea de tiempo con sus escenas y la voz" width="560">
</p>

## Instalar

v!d no tiene descargas públicas ni se actualiza sola: el instalador sale de `npm run compilar` (ver
[`docs/agents/publicacion.md`](docs/agents/publicacion.md)) y una versión nueva se instala encima de la anterior.

Necesitas una IA conectada, con una basta: **Claude**, **ChatGPT**, **OpenCode** (tiene modelos gratis) u otro agente.
Con ChatGPT, v!d además hace las imágenes. FFmpeg, Python y lo que pide cada estilo los instala la propia app.

## Correrla desde el código

Necesitas Node 24.

```bash
git clone https://github.com/tazkore/tazsloth.git
cd tazsloth
git checkout tazkore
npm ci
npm start
```

`npm start` levanta el servidor en `http://localhost:4850` y abre la ventana de v!d. Sus agentes leen las skills de
`skills/` de este repo, con su propia configuración de Claude en `data/claude` (la cuenta se conecta una vez desde
v!d): tu `~/.claude` no cambia, y una v!d instalada en la misma computadora sigue con las suyas.

Antes de dar algo por hecho: `npm run typecheck`, `npm test` y, si tocaste `skills/`, `npm run comprobar-skills`.

## Cómo está hecha

| Pieza | Con qué |
| --- | --- |
| La ventana | [Electron](https://www.electronjs.org), con instalador (sin actualizaciones automáticas) |
| La interfaz | React y Vite (`web/`) |
| El servidor local | Node (`server/`): sesiones, estudio, galerías y requisitos; solo en `localhost`, con token |
| Los agentes | [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk), con tu cuenta de Claude |
| Los videos | [Remotion](https://www.remotion.dev) en cada estilo, y Python para transcribir y descargar |

```
electron/   la ventana de escritorio
server/     el servidor local que corre los agentes
web/        la interfaz
shared/     los tipos que comparten servidor e interfaz
skills/     los estilos de video (El Diff, explicativo, reel de comedia, documental) y sus herramientas
nube/       la nube que publica en Instagram (Cloudflare Worker)
python/     los procesos de Python de v!d
scripts/    compilar y desplegar
docs/       las decisiones (adr/) y las guías para agentes (agents/)
```

Las reglas del proyecto y el mapa del código están en [`AGENTS.md`](AGENTS.md) y
[`docs/agents/mapa.md`](docs/agents/mapa.md).

## Aportar

Es un fork de uso interno. Lee [`CONTRIBUTING.md`](CONTRIBUTING.md) antes de empezar: la interfaz va en español y cada
cambio se comprueba con `npm run typecheck` y `npm test`. Para reportar un problema de seguridad, no
abras un issue: sigue [`SECURITY.md`](SECURITY.md).

## Créditos

**v!d by Kold.Gold** está basado en [v!d](https://github.com/Vancci-sloth/sloth), de
[Vancci](https://vancci.org), y conserva su licencia y su [`NOTICE`](NOTICE).

El estilo **Documental** parte de EDITOR V1, de [NextPhase AI](https://www.skool.com/nextphase-5790/about), que
venía para HyperFrames; en v!d se dibuja con Remotion.

## Licencia

**Código abierto para uso libre, sin reventa.** Puedes usar v!d para lo que quieras (también para trabajos de
paga), modificarla y compartirla. Lo que no puedes es venderla, ni una versión modificada, ni un servicio cuyo valor
venga de ella. Los videos que hagas son tuyos y los puedes vender. Es la [Apache 2.0 con Commons Clause](LICENSE), a
nombre de [Vancci](https://vancci.org); por esa condición no es «open source» según la definición de la OSI.

Remotion, que arma los videos, tiene su [propia licencia](https://www.remotion.dev/license): gratis para personas y
equipos pequeños; las empresas más grandes pagan la suya. v!d no está afiliada, patrocinada ni respaldada por
Anthropic ni por OpenAI.

<p align="center"><sub>v!d original hecho por Vancci en México · v!d by Kold.Gold</sub></p>
