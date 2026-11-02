# Cómo aportar a v!d

Gracias por querer mejorar v!d. Antes de abrir un PR:

1. **Abre un issue primero** si el cambio es grande o cambia cómo se usa la app, para hablarlo antes de que trabajes.
2. **Lee [`AGENTS.md`](AGENTS.md)**: ahí están las reglas del proyecto. Las más importantes:
   - La interfaz y los comentarios van en español.
   - Rápida y sencilla antes que completa: antes de añadir algo, piensa si se puede quitar otra cosa.
   - La paleta es la de v!d (`web/src/styles.css`) y los iconos son de trazo (`web/src/Iconos.tsx`), nunca emojis.
   - Lo de un sistema (Windows, Mac o Linux) lleva su par en los otros.
3. **Comprueba tu cambio** con `npm run typecheck` y `npm test` y, si tocaste `skills/`, con `npm run comprobar-skills`.
4. **Un PR por tema**, con una descripción de qué cambia y por qué.

## Lo que no entra

- Material de otras personas sin permiso: videos, imágenes, música, voces o transcripciones.
- Llaves, tokens o datos personales.
- Nada que haga que v!d envíe datos de quien la usa a otro lado sin decirlo.

## Tu aporte y la licencia

v!d se publica con la [Apache 2.0 con Commons Clause](LICENSE). Al enviar un aporte (código, skills, textos o
imágenes):

- Confirmas que es tuyo o que tienes derecho a aportarlo.
- Aceptas que se publique con la licencia de este repo.
- Le das a Tazkore un permiso mundial, gratuito, perpetuo, irrevocable y no exclusivo para usarlo, modificarlo,
  sublicenciarlo y distribuirlo en v!d by Kold.Gold.

Sigues siendo dueño de tu aporte y puedes usarlo como quieras.
