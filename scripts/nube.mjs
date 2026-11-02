// wrangler para la nube de v!d (`nube/`), con su propia sesión de Cloudflare (la cuenta de v!d) en %APPDATA%\vid-koldgold,
// sin tocar la de otras cuentas de esta computadora. Uso: `npm run nube -- login`, `npm run nube -- deploy`.
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const args = process.argv.slice(2)
const carpeta = 'nube'
// La cuenta de Cloudflare no va en el repo: es VID_CLOUDFLARE_CUENTA, en las variables de quien despliega.
const cuenta = process.env.VID_CLOUDFLARE_CUENTA || process.env.SLOTH_CLOUDFLARE_CUENTA
const env = { ...process.env, XDG_CONFIG_HOME: join(process.env.APPDATA ?? '', 'vid-koldgold'), ...(cuenta ? { CLOUDFLARE_ACCOUNT_ID: cuenta } : {}) }
// En Windows, npx es un .cmd y necesita la consola: va como un solo comando.
spawn(['npx --yes wrangler@4', ...args].join(' '), { cwd: join(import.meta.dirname, '..', carpeta), env, stdio: 'inherit', shell: true }).on('exit', (code) =>
  process.exit(code ?? 0)
)
