# Seguridad

## Reportar un problema

Si encuentras una vulnerabilidad en v!d by Kold.Gold, **no abras un issue público**: escríbenos a
[tazkore@gmail.com](mailto:tazkore@gmail.com) con los pasos para reproducirla.

## Lo que debes saber antes de usar Sloth

**Los agentes de Sloth trabajan con todos los permisos en tu computadora.** Para hacer un video sin pedirte permiso a
cada paso, corren con `bypassPermissions` (`server/claude.ts`): pueden leer, escribir y borrar archivos, y ejecutar
programas, con tu usuario.

- **Instala solo estilos (skills) en los que confíes.** Un estilo es un conjunto de instrucciones y scripts, y el agente
  hace lo que digan. Uno malicioso puede ejecutar lo que quiera en tu computadora. Revisa su carpeta antes de usarlo.
- **Cuidado con lo que le pides que lea.** Una página web o un archivo con instrucciones escondidas puede intentar
  desviar al agente. Revisa lo que hace en el hilo, que se ve paso a paso.
- **Tus cuentas son tuyas.** Sloth entra con tu cuenta de Claude (y, si quieres, de ChatGPT) en el flujo oficial de
  cada una, y no guarda tus contraseñas.

## Lo que sí cuida Sloth

- El servidor escucha solo en tu computadora (`localhost`), valida `Host`/`Origin` (`server/origen.ts`) y exige un
  token (`data/servidor-token`) en `/api` y `/ws`: la ventana lo recibe en una cookie HttpOnly y los procesos locales
  (MCP, scripts de skills) en la variable `VID_TOKEN`.
- Las llaves de API de los agentes se guardan cifradas (AES-256-GCM) en `data/agentes.json`; la llave maestra está
  protegida con DPAPI en Windows (`data/llave-maestra.dpapi`) o en un archivo con permisos 600 en Mac y Linux.
- No hay pagos, comunidad ni actualizaciones automáticas: la app no habla con servidores del proyecto original.
