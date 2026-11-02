# Ajustes por red (v!d)

Las skills social-* nacieron para Instagram. En v!d sirven para las redes que la agencia tiene conectadas en GHL
(op `estado` de vid-api). Ajusta así:

| Red | Texto | Gancho | Hashtags | Medios (vid-api) |
|---|---|---|---|---|
| Instagram | hasta 2,200; lo visible, ~125 | primeros 125 caracteres | 3 a 5 | `post` (imagen, carrusel 2-10), `reel` (1 video), `story` (1 medio) |
| TikTok | hasta 2,200; lo visible, ~100 | el del video; el texto lo apoya | 3 a 5 | solo video alojado en GHL; privacidad en `detalles.tiktok.privacyLevel` |
| YouTube | título ≤ 100 (obligatorio) + descripción | el título | 2 a 3 en la descripción | solo video; `detalles.youtube.title` y `privacyLevel` |
| Facebook | corto (1 a 3 líneas) funciona mejor | primera línea | 0 a 2 | imagen, video o texto con medio |
| LinkedIn | 1,300 a 2,000; lo visible, ~210 | primeras 2 líneas, sin clickbait | 0 a 3 | imagen, video o documento; tono profesional |
| Google (perfil de negocio) | corto, con llamada a la acción | primera línea | ninguno | imagen |

- Shorts de YouTube: vertical, menos de 60 s; el título hace de gancho.
- Un mismo video a varias redes: un solo texto base y, si hace falta, un detalle por red (título de YouTube, privacidad
  de TikTok). v!d manda una sola publicación de GHL a varias cuentas.
- El tono de la marca (memoria del proyecto) manda en todas.
