# La voz: la línea `Voz:`

El usuario elige en el compositor de v!d si manda él la voz o si la generas tú con una voz de Google AI Studio
(Gemini 3.8 Flash TTS, en su cuenta de Google) o de ElevenLabs (con su llave, incluidos sus clones). Lo elegido llega
en el primer mensaje:

- `Voz: genérala tú en AI Studio con la voz <Nombre> …`: la generas tú, como se dice abajo. **No se la pidas.**
- `Voz: genérala tú con ElevenLabs, voz <Nombre> (id <id>; pasa proveedor "elevenlabs" a generar_voz …)`: igual, con
  `proveedor: "elevenlabs"` y, en `voz`, el id de la línea. Sale el mismo WAV (24 kHz, mono) y en la misma `salida`
  (`fuentes/voz/ai-studio.wav`; el nombre se queda aunque la voz sea de ElevenLabs, para que tu skill no cambie), así
  que lo demás —transcribir, alinear, las bocas— va igual.
- `Voz: la manda el usuario; no la generes …`: pídesela como diga tu skill, aunque la marca o la skill traigan una
  voz de AI Studio.
- Sin la línea: lo que diga tu skill.

## Generarla

Con la herramienta `generar_voz` del MCP `voz` (en Claude, `mcp__voz__generar_voz`), en cuanto el guion esté listo:

- `voz`: el nombre que trae la línea.
- `texto`: lo que se narra, tal como lo leería el usuario: el guion que le darías para grabar, sin títulos,
  encabezados, notas ni indicaciones. O `archivo`: la ruta absoluta de ese guion (un `.md` se narra sin títulos ni
  encabezados).
- `salida`: `<carpeta del video>/fuentes/voz/ai-studio.wav`, en ruta absoluta.

Una frase tarda unos 5 s y un guion de 6 minutos unos 100 s. Si no acabó en 40 s, la herramienta te da un id: sigue con
lo que no necesita la voz y espérala con `estado_voz`. Cuando llega, **ese WAV es la voz del usuario**: sigue el paso
de tu skill para cuando llega su voz, con ese archivo. Si después corriges el guion, vuelve a pedirla; si no cambió,
sale al momento.

AI Studio a veces lee un párrafo dos veces o se salta una frase. Si al transcribir o alinear falta o sobra un tramo,
pídela otra vez una sola vez; si se repite, díselo al usuario.

## Si falla

- **Sin cuenta conectada, o se fue la sesión:** dile al usuario que conecte su cuenta de Google en Opciones → Voz (o en
  el menú «Voz» al pedir un video). Mientras, pídele su voz como siempre.
- **La cuota del día u otro error de AI Studio:** dile el error tal cual y pídele su voz.
- **Una voz que AI Studio no tiene:** `voces` dice las que hay. Usa la más parecida y díselo.

Si el usuario eligió AI Studio o ElevenLabs, no la generes de otra forma (edge-tts u otra): o sale del proveedor que
eligió o la manda él. Sin proveedor en la línea, `generar_voz` usa el de Opciones → Avatares y voz.

ElevenLabs cobra por carácter de su plan: pide la voz una sola vez por guion y, si corriges el guion, solo la vuelves a
pedir cuando de verdad cambió (si el texto y la voz son los mismos, sale al momento sin gastar). Sus errores
(`Se acabó la cuota…`, `no aceptó esa llave`) se los dices al usuario tal cual.

## En un estilo nuevo

Todo estilo con voz narrada sigue esta guía: su skill solo dice en qué paso está el guion y qué hace con la voz cuando
llega. Así lo tienen también los estilos que hace cada quien con «Nuevo estilo».
