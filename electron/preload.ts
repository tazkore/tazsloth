/**
 * Lo que la ventana de v!d (main.ts) le da a la interfaz: `window.vid` (`PuenteVid`). Corre antes que la página,
 * aislado de ella.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { EstadoNavegador, PuenteVid } from '../shared/types.ts'

const puente: PuenteVid = {
  traer: () => ipcRenderer.send('traer'),
  anclada: () => ipcRenderer.invoke('anclada'),
  anclar: () => ipcRenderer.invoke('anclar'),
  // El navegador integrado (navegador.ts).
  navegador: {
    ver: (hilo, caja, pantalla) => ipcRenderer.send('navegador:ver', hilo, caja, pantalla),
    ir: (hilo, url) => ipcRenderer.send('navegador:ir', hilo, url),
    hacer: (hilo, accion) => ipcRenderer.send('navegador:hacer', hilo, accion),
    oir: (cb) => {
      const oir = (_e: IpcRendererEvent, estado: EstadoNavegador) => cb(estado)
      ipcRenderer.on('navegador:estado', oir)
      return () => void ipcRenderer.off('navegador:estado', oir)
    },
    oirPestana: (cb) => {
      const oir = (_e: IpcRendererEvent, hilo: string, url: string) => cb(hilo, url)
      ipcRenderer.on('navegador:pestana', oir)
      return () => void ipcRenderer.off('navegador:pestana', oir)
    },
    estados: () => ipcRenderer.invoke('navegador:estados')
  }
}

contextBridge.exposeInMainWorld('vid', puente)
// Alias de compatibilidad: el mismo puente con su nombre de antes de la Fase 2.
contextBridge.exposeInMainWorld('sloth', puente)
