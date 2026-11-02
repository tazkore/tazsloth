# Skills de HeyGen

Las carpetas hermanas `heygen-avatar`, `heygen-video` y `heygen-translate` son las skills oficiales de HeyGen, copiadas tal cual (sin
cambios) de https://github.com/heygen-com/skills, versión 3.2.0, commit 1bd5e4d33a028dfed3abf504c5e3dd644fb9ea8a.
Licencia: MIT, © 2026 HeyGen (texto en el `LICENSE` de cada carpeta). Para actualizarlas, vuelve a copiar esas tres carpetas.

Cómo las usa v!d:
- Con la llave de HeyGen guardada en Opciones → Avatares y voz, v!d la pone en la variable de entorno `HEYGEN_API_KEY`
  de los agentes (el modo «API con llave» de las skills). Sin llave, las skills piden conectar el MCP de HeyGen o la
  CLI `heygen`; v!d no instala ninguna.
- **Cuestan créditos.** Un agente solo debe usarlas si el usuario lo pidió o eligió el motor `heygen` en el compositor
  (`video-base/AVATAR.md`). El motor `heygen` del MCP `avatar` hace lo mismo sin pasar por ellas.
- Su script `heygen-video/scripts/update-check.sh` es opt-in y v!d no lo corre.
