/// <reference types="vite/client" />

interface Window {
  /** Lo que da la ventana de v!d (electron/preload.ts). En un navegador no está. */
  vid?: import('../../shared/types').PuenteVid
  /** Alias de compatibilidad de `vid` (el mismo puente). */
  sloth?: import('../../shared/types').PuenteVid
}
