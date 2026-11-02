---
name: social-carousel-planner
description: "Plan an Instagram carousel slide by slide, up to 10 slides, with a hook slide that opens a loop, value slides that front-load the payoff, and a payoff slide that earns the save and follow. Picks a 2026 carousel formula (listicle, before/after, myth-buster, framework) by goal (saves, shares, follows), drafts each slide's text plus the caption, then publishes the images you supply via vid-api (borrador). Use to structure a multi-slide carousel. Not for single-image captions (use social-caption-writer). En v!d: lee MemoriaProyecto, sirve también para TikTok, YouTube, Facebook y LinkedIn, y publica con vid-api de Kold.Gold solo en borrador."
---

# Instagram Carousel Planner

> **Adaptación para v!d by Kold.Gold** (manda sobre lo que diga abajo; ver `../social-base/SKILL.md`):
> - **Idioma:** escribe en español de México salvo que la memoria del proyecto diga otra cosa.
> - **Memoria del proyecto:** si el mensaje trae la línea `MemoriaProyecto: <ruta>` (y `MemoriaSerie:`), léela antes de
>   escribir: su tono, público, reglas y cierre mandan sobre el perfil de voz genérico.
> - **Redes:** sirve también para TikTok, YouTube (Shorts y largos), Facebook y LinkedIn donde aplique; ajusta largo,
>   gancho y hashtags a cada red con `../social-base/references/redes.md`.
> - **Publicar:** nunca con Publora. Se publica con vid-api (`subir_media` + `crear_post`) usando `VID_AGENCIA_LLAVE` y
>   `VID_API_URL`, y desde la skill **solo en borrador** (`../social-base/publicar.mjs`). Programar o publicar ya lo
>   confirma una persona en v!d → Social Media.
> - **De pago:** Pixfaro está desactivado (entrega el brief de la imagen, no la generes). Apify solo si existe
>   `APIFY_TOKEN`, y avisando que cobra por uso.

Plan a carousel that gets swiped to the end and saved. The whole game is slide 1
(the swipe-earning hook) and the last slide (the saveable payoff). This skill
maps every slide, writes the on-image text, and drafts the caption that frames
it.

## When to use

- User wants to turn a topic or notes into a multi-slide carousel
- User has a list, a framework, or a transformation to teach
- User wants a slide-by-slide structure, not just a caption

## Formulas this skill uses (carousel shapes)

| Code | Formula | Primary goal | Best for |
|---|---|---|---|
| IG5 | Listicle Carousel | saves | a numbered teaching list, one item per slide |
| IG6 | Before/After Transformation | saves, follows | proof of a result with the steps between |
| IG7 | Myth-Buster | shares | correcting beliefs your niche holds |
| IG8 | Steal-This Framework | saves | a named, repeatable framework |

Full skeletons in `../social-base/references/hook-formulas.md`.

## Slide architecture (the 10-slide spine)

A carousel is 2-10 slides (API limit). The reliable spine:

| Slide | Role |
|---|---|
| **1 (hook)** | the promise + an open loop ("most miss #4"). Earns the swipe. Big text, one idea. |
| **2-3** | the strongest value, front-loaded (swipe-through decays with depth). |
| **4 to N-1** | one point per slide, each standing alone, each readable in 2 seconds. |
| **N (payoff)** | the one-slide summary (the saveable artifact) + one clear ask (save / follow). |

6-10 slides is the sweet spot for a teaching carousel. Fewer than 4 is usually a
single image. See `references/slide-architecture.md` for per-formula spines.

## Steps

**Voice profile first (all drafts).** If `../social-base/references/voice-profile.md` has `filled: yes`, load it and match the user's voice fingerprint, hard rules, and CTA/link style throughout. If it is not filled, mention once that `social-humanizer --mode profile` can learn their voice from a few posts, then proceed with the generic voice rules.

**Never invent the specifics.** The rules below ask for a concrete number, a date and a named entity, because that is what separates a real post from a generated one. Take them from what the user actually said in this conversation. **Do not invent a figure, a date, a client name or a result, and do not soften a vague claim into a plausible-looking number.** If the user has nothing concrete for a beat, ask them once, and if they still have nothing, drop the claim rather than decorate it. A published invented number is a retraction; a missing one is only a weaker post.

1. **Gather inputs.** Topic, the list/framework/transformation, target audience,
   and the goal (saves / shares / follows).
2. **Pick the formula.** Use the goal table; suggest 2-3 that fit and let the
   user choose.
3. **Set the slide count.** Match it to the real content (6-10 typical). Never
   pad to hit 10; viewers feel filler and bail.
4. **Write slide 1.** The promise plus the loop. Big, single-idea on-image text.
   Front-load a number if one fits.
5. **Map the value slides.** Put the strongest point on slide 2 or 3. One point
   per slide, each able to stand alone. Draft the on-image text for each (keep it
   short, it has to read in 2 seconds on a 4:5 frame).
6. **Write the payoff slide.** A one-slide recap that is worth saving on its own,
   plus a single ask (save it / follow for more).
7. **Write the caption.** The caption supports the carousel (it can be short),
   restates the hook for the fold, and carries the hashtags. Hand off to
   `social-hashtag-strategist` or apply the 3-5 sized set.
8. **Humanizer pass** on the on-image text and caption. Scrub 2026 AI vocab
   by density (per slide, per caption paragraph), cap em dashes (at most one
   per slide, about one per 100 words in the caption; never swap one for a
   period), break stacked triads and reveal bridges. Slides are short by
   design: never chop or pad a slide for rhythm. Canonical rules:
   `social-humanizer` V3.
9. **Approval card.** Show: formula, slide-by-slide outline with each slide's
   text, the caption, hashtag set, primary goal, and a reminder that the user
   supplies 2-10 images (all images, no mixed media) in this order.
10. **Al aprobar: publicar con vid-api (v!d by Kold.Gold).** No uses Publora ni `lib.publish`.
    Entrega el texto aprobado y deja que el usuario lo publique desde v!d → Social Media
    (canal «Por agencia (GHL)»), que pide confirmación antes de programar. Si el usuario
    te pide que lo dejes listo tú, corre
    `node ../social-base/publicar.mjs --texto-archivo <caption.txt> --medio <archivo o URL> [--medio …] --tipo <post|reel|story> --cuentas <id,id>`:
    sube la media a la biblioteca de GHL (`subir_media`) y crea la publicación con
    `crear_post` **siempre en `draft`**. Programar o publicar de verdad solo se hace en la
    app, con el botón Confirmar. Detalle: `../social-base/references/media-workflow.md`.

## Hard rules

Global voice rules: see `../social-base/SKILL.md` Voice rules. Additional skill-specific
rules:

- Slide 1 is a promise with an open loop, never a bare title.
- Front-load value to slides 2-3; never bury the best point at the end.
- One point per slide, readable in 2 seconds on a portrait 4:5 frame.
- 2-10 slides only. Never pad to a round number.
- All images, no mixed media (the API rejects an image+video carousel).
- The last slide must earn the save with a one-slide summary and one ask.

## Anti-patterns (skill will refuse)

- A title-only slide 1 with no promise or loop.
- A 10-slide carousel padded from a 4-point idea.
- The strongest point saved for the final slide.
- Three competing CTAs on the payoff slide.
- Mixing images and a video in one carousel.
- On-image walls of text that cannot be read in a swipe.
- Em dashes above the cap (more than one on a slide), AI vocab clusters, stacked or hollow rule-of-three.
- "The result?" reveals and staccato stacks added for punch.

## Resources

- `../social-base/references/hook-formulas.md` - the carousel formulas (IG5-IG8) with skeletons
- `../social-base/references/algorithm-heuristics.md` - 2026 carousel ranking and swipe-through rules
- `../social-base/references/hashtag-strategy.md` - the 3-5 sized hashtag recipe
- `../social-base/references/media-workflow.md` - uploading 2-10 images in order
- `references/slide-architecture.md` - per-formula slide spines and on-image text rules

## Optional illustration

> Desactivado por defecto en v!d (Pixfaro es de pago): entrega el brief de cada lámina y no generes la imagen.

Offer a generated image when a visual would lift reach. Draft a prompt and call
`lib.illustrate(prompt, kind="carousel")`, pulling brand handle/color from Voice &
Brand Profile section 6 for a pixel-exact overlay. Show the returned `url` + `cost`,
attach it as your Instagram media via `media_urls=[url]` in one shot (vid-api la sube a la biblioteca de GHL con `subir_media` por URL): a single image posts as a photo, and the carousel planner can pass 2-10 URLs for a carousel. For a Reel cover instead, set `platformSettings.instagram.coverUrl`. Full workflow (incl. quote-cards):
`../social-humanizer/sub-skills/illustration.md`. No Pixfaro key -> it drafts the prompt for you to generate manually.
## Related skills

- `social-caption-writer` - when the idea is a single image, not a carousel
- `social-hashtag-strategist` - build the sized hashtag set
- `social-humanizer` - scrub the on-image text and caption
- `social-hook-extractor` - reverse-engineer a carousel you admire
