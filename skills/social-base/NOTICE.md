# Aviso de terceros: Instagram Skills

Las skills `social-base`, `social-caption-writer`, `social-carousel-planner`, `social-hook-extractor`,
`social-hashtag-strategist`, `social-humanizer`, `social-content-planner`, `social-repurposer`,
`social-profile-optimizer` y `social-audience-insights` de v!d by Kold.Gold son una adaptación de
**Instagram Skills**, de **Sergey Bulaev**:

- Origen: https://github.com/sergebulaev/instagram-skills (commit `550d3cf6cece08de75dae64235bd32136820920f`, 2026-10-27)
- Licencia: MIT. El texto completo está en `LICENSE`, en esta carpeta, y se conserva sin cambios.

Copyright (c) 2026 Sergey Bulaev.

## Qué cambió en v!d

- Nombres `ig-*` → `social-*`; las referencias compartidas (`references/`) y las ayudas de Python (`lib/`) viven en
  `social-base`.
- Publicar: en lugar de Publora, vid-api de Kold.Gold (`subir_media` + `crear_post`) con `VID_AGENCIA_LLAVE` y
  `VID_API_URL`, y desde las skills solo en borrador (`publicar.mjs`). Se quitaron `publora_client.py`,
  `backend_selector.py` y `pixfaro_client.py`.
- Pixfaro (de pago) desactivado; Apify solo con `APIFY_TOKEN` y con aviso de que cobra por uso.
- Cada skill lee la memoria del proyecto (`MemoriaProyecto:`) y sirve también para TikTok, YouTube, Facebook y LinkedIn
  (`references/redes.md`).
- Se agregó una nota de adaptación al principio de cada `SKILL.md` y se reescribió `references/media-workflow.md`.
