# Publicar con vid-api (v!d by Kold.Gold)

Reemplaza el flujo de Publora del paquete original. vid-api es la API privada de Kold.Gold sobre el Social Planner
de GoHighLevel (marca blanca app.kold.gold); cada agencia emite su llave en kold.gold y la pega en v!d → Opciones →
Agencia.

## Variables

- `VID_API_URL`: la URL de vid-api (por omisión `https://udzsxmgyedojtirjpepc.supabase.co/functions/v1/vid-api`).
- `VID_AGENCIA_LLAVE`: la llave (`kg_live_…`). Va en la cabecera `x-vid-key`. Nunca la imprimas ni la guardes.

## El flujo

```
1. estado        → las cuentas conectadas (id, plataforma, nombre)
2. subir_media   → sube cada archivo (o URL) a la biblioteca de GHL → media.url
3. crear_post    → estado "draft" con cuentas, texto, media (URLs de GHL), tipo y detalles
```

Desde una skill, todo junto:

```
node ../social-base/publicar.mjs --texto-archivo caption.txt --medio out/video.mp4 --tipo reel --cuentas <id>,<id>
```

Sin `--cuentas`, usa todas las conectadas que acepten ese medio. Siempre crea en **borrador**: programar o publicar
lo confirma una persona en v!d → Social Media. Con `--probar` solo enseña lo que mandaría.

## Reglas de vid-api

- Al menos una cuenta, incluso en borrador.
- TikTok: solo video y solo medios de la biblioteca de GHL (por eso primero `subir_media`).
- `reel`: exactamente un video. `story`: exactamente un medio. YouTube: video y título (≤ 100).
- `scheduled` exige fecha futura (≥ 60 s); `now` programa a +90 s. Ambos exigen al menos un medio.
- Límites de subida: video ≤ 500 MB, otros ≤ 25 MB.
- Errores: `{ok:false, code, message}` en español, con HTTP 400/401/403/413/422/429.

## Límites de Instagram (del paquete original)

| Cosa | Límite |
|---|---|
| Imágenes | JPEG, PNG, WebP |
| Carrusel | 2 a 10, sin mezclar imagen y video |
| Reel | hasta 3 min; de 5 a 90 s entra a la pestaña de Reels |
| Texto | 2,200 caracteres (se ven ~125) |
| Cuenta | profesional (Business o Creator) |

## Sin llave

Sin `VID_AGENCIA_LLAVE` (ni servidor de v!d que la dé), entrega el texto aprobado como bloque para copiar y recuerda
que la imagen o el video van aparte.
