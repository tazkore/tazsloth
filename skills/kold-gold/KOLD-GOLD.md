# Kold Gold: lo que manda en este estilo

Todo lo de `SKILL.md`, `GUION.md` y `MUNDO.md` vale, salvo lo que choque con esto.

## La marca
- KOLD GOLD SAPI · «Logística Integrada Global» · kold.gold · operaciones@kold.gold · +52 55 4877 4420.
- Servicios: marítimo FCL/LCL (Asia–América), aéreo y chárter, terrestre nacional y cross-border con EE. UU., cadena de
  frío (2–8 °C, congelado, ultra baja), despacho aduanal con agente aliado, puerta a puerta.
- Diferenciador: la Torre de Control (GPS en vivo, temperatura en vivo, guías, documentos y facturas en el portal del
  cliente, alertas en el celular) y el simulador público de costo de importación.
- Pilares y palabra clave de comentario (cada una dispara un flujo en GoHighLevel): intermodal Asia–América → CHINA o
  IMPORTAR · cadena de frío → FRIO · aduanal → ADUANA · plataforma → GPS o PORTAL.
- `marca.json` ya trae nicho, cómo habla, el personaje y el cierre: no se le pregunta nada de eso al usuario.

## Investigación
- kold.gold es la fuente [PRIMARIA] de todo lo que se diga de Kold Gold. Lo que no esté ahí no entra al guion.
- Datos de comercio exterior: solo DOF, SAT/ANAM, Secretaría de Economía, ASIPONA, COFEPRIS, IATA, con fecha.
- Sin ofertas, descuentos ni promesas de tiempo garantizado (ni en Buen Fin). Sin «el mejor», «líder», «número uno».

## La regla de oro (consejo del creador de v!d)
En redes no funciona «yo hago esto y vendo esto». Funciona explicar, crear una emoción o entretener. Un tema como
«los cinco tipos de mercancía que más se pierden en el mar» gana a cualquier anuncio. Cada video cuenta lo que le pasa
a la carga y a quien importa; Kold Gold aparece al final, como la consecuencia lógica.

## Guion: vender sin vender
1. Gancho (0–5 s): un dolor real del importador (carga atorada, costos ocultos, mercancía retenida, temperatura fuera de
   rango, nadie contesta), sin saludo.
2. La zorra se presenta en una línea: «Soy la anfitriona de Kold Gold».
3. Lo que hay que saber: el proceso paso a paso. Es el valor del video.
4. Cómo lo resuelve Kold Gold, con una prueba visible de la Torre de Control.
5. En verticales para redes: «Comenta <PALABRA> y te mando…». Luego la frase de cierre de la marca, tal cual.
- De tú, español de México, tono ejecutivo cercano. Cifras en letra en `guion.md`.

## Mundo 3D
- Un solo recorrido: el viaje de la carga del cliente. El contenedor cobre es el protagonista (mapa de rutas → puerto
  y buque → aduana → tráiler → bodega fría → Torre de Control), o la ruta que pida el tema.
- Paleta (ya en `plantilla/src/tema.ts`): fondo carbón #111827, plata #D9DDE3 para Kold Gold mismo, cobre #D07E26 (brillo
  #F2AE5C) para la carga y lo que avanza; verde solo «liberado/aprobado»; rojo solo el problema del gancho; frío #7DD3FC.
- Realismo: escala real (contenedor de 40 ft ≈ 12 × 2.4 × 2.6 m), luz de puerto de noche con sodio cálido y reflejo en
  el agua, niebla ligera, nada flotando ni atravesándose. El único texto en los modelos es «KOLD GOLD» en el contenedor.
- Antes de modelar, `modelos.py buscar`: ya hay contenedor, buque, avión de carga, tráiler, grúa portuaria, aduana,
  bodega fría, torre de control y mapa de rutas. Lo nuevo se guarda en la biblioteca.
- La pantalla de la Torre de Control imita el portal de kold.gold: mapa con punto GPS que avanza, temperatura, una guía
  y la alerta en el celular. Sin logos de terceros.

## Personaje
- La zorra anfitriona (`zorra-kold`), nunca el perro. Su foto base y descripción están en `personajes/zorra-kold/`.
- Si al video le falta una pose (feliz, ladea, pata, celular), se hace con Codex como dice `personaje/NUEVO.md` y se
  guarda en su biblioteca con `marca.py guardar-personaje zorra-kold <proyecto> "<descripcion.txt>"`.
- Sale en el saludo, en el paso servicios → plataforma y en el cierre; en el tercio derecho, sin tapar el texto.

## Subtítulos
- `terminos.txt` siempre con: Kold Gold, kold.gold, Torre de Control, Lázaro Cárdenas, Laredo, FCL, LCL, chárter,
  cross-border, GPS, más los del tema.
- Una `[palabra]` por frase (la caja ya sale en cobre). Íconos de Phosphor: {Boat} {AirplaneTilt} {Truck} {Snowflake}
  {Stamp} {MapPin} {Thermometer} {Bell}. Nunca emoji. Al cierre: `[kold.gold=kold_punto_gold]`.

## Voz y audio
- La voz de la hostess: mujer joven, cálida y dulce, ritmo ágil. Si el usuario manda la suya (Higgsfield, voz
  «Marisol»), va a `fuentes/voz/original.wav` a velocidad normal: aquí se acelera.
- Si el guion cambia después de la voz, se regenera la voz entera, nunca por pedazos.
- Master −14 LUFS / −1 dBTP, sin clips ni silencios de más de 0.4 s.
- Música siempre, bajita: la primera pista libre de derechos de `fuentes/musica/` o, si no hay, una que `final.py`
  sintetiza (`video-base/scripts/musica.py`: senos, ruido y filtros, sin muestras de nadie, del largo del video). Va
  unos 20 LU bajo la voz y se aparta más cuando ella habla (ducking con `sidechaincompress`). `--sin-musica` la quita.
- La voz no se apura: `acelerar.py` deja las pausas en 0.25 s y `atempo` en 1.05 (antes 0.18 s y 1.12).

## Entrega
- Rechaza el borrador si ves el perro, un dato sin [PRIMARIA], colores fuera de paleta, objetos que se atraviesan,
  texto fuera de zona segura o más de 4 s sin plano nuevo.
- Portada: 2 a 5 palabras en plata con la clave en cobre, el mundo del video detrás y la zorra a un lado.
- Para YouTube, también la versión horizontal 1920×1080.
