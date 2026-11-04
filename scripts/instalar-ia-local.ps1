<#
.SYNOPSIS
  Instala los motores de IA locales de v!d: LatentSync 1.5 (labios, dentro de ComfyUI) y Chatterbox Multilingual (voz).

.DESCRIPTION
  NO se corre solo ni lo corre ningun agente sin que Alan lo autorice: baja unos 15 GB.
    - ComfyUI portable (NVIDIA)          -> C:\vid-ia\ComfyUI
    - Nodo ComfyUI-LatentSyncWrapper + VideoHelperSuite y los checkpoints de LatentSync 1.5 (latentsync_unet.pt, whisper/tiny.pt)
    - Entorno de Python 3.11 con torch CUDA + chatterbox-tts -> C:\vid-ia\chatterbox (y servidor.py, que usa v!d)
  Sin -Autorizado solo muestra el plan y sale. Todas las ventanas de trabajo se abren minimizadas y en la pantalla 2
  (la secundaria), y su salida va a C:\vid-ia\logs. Se puede repetir: lo que ya esta, se salta; las descargas se reanudan.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\instalar-ia-local.ps1            # solo el plan
  powershell -ExecutionPolicy Bypass -File scripts\instalar-ia-local.ps1 -Autorizado
  powershell -ExecutionPolicy Bypass -File scripts\instalar-ia-local.ps1 -Autorizado -SoloChatterbox
#>
param(
  [string]$Raiz = $(if ($env:VID_IA_RAIZ) { $env:VID_IA_RAIZ } else { 'C:\vid-ia' }),
  [switch]$Autorizado,
  [switch]$SoloComfy,
  [switch]$SoloChatterbox,
  [switch]$BajarModeloChatterbox
)

$ErrorActionPreference = 'Stop'
$AQUI = Split-Path -Parent $MyInvocation.MyCommand.Path
$HF = 'https://huggingface.co'
$logs = Join-Path $Raiz 'logs'
$descargas = Join-Path $Raiz 'descargas'
$comfy = Join-Path $Raiz 'ComfyUI'
$venv = Join-Path $Raiz 'chatterbox'

# Lo que baja LatentSync 1.5 (los mismos archivos y tamanos exactos que server/avatar/flujos.ts).
$pesos = @(
  @{ url = "$HF/ByteDance/LatentSync-1.5/resolve/main/latentsync_unet.pt"; destino = 'custom_nodes\ComfyUI-LatentSyncWrapper\checkpoints\latentsync_unet.pt'; bytes = 5072348184 },
  @{ url = "$HF/ByteDance/LatentSync-1.5/resolve/main/whisper/tiny.pt"; destino = 'custom_nodes\ComfyUI-LatentSyncWrapper\checkpoints\whisper\tiny.pt'; bytes = 75572083 }
)
$nodos = @('ShmuelRonen/ComfyUI-LatentSyncWrapper', 'Kosinkadink/ComfyUI-VideoHelperSuite')

function Paso($t) { Write-Host "`n== $t" -ForegroundColor Cyan }

# Ventanas: minimizadas y, si hay segunda pantalla, movidas a ella (la ASUS MB169CK es la secundaria).
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class VentanaVid {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int cy, uint f);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
}
'@
function Ventana-EnPantalla2($proc) {
  try {
    for ($i = 0; $i -lt 20 -and $proc.MainWindowHandle -eq 0 -and -not $proc.HasExited; $i++) { Start-Sleep -Milliseconds 150; $proc.Refresh() }
    if ($proc.HasExited -or $proc.MainWindowHandle -eq 0) { return }
    $otra = [System.Windows.Forms.Screen]::AllScreens | Where-Object { -not $_.Primary } | Select-Object -First 1
    if ($otra) { [VentanaVid]::SetWindowPos($proc.MainWindowHandle, [IntPtr]::Zero, $otra.Bounds.X + 40, $otra.Bounds.Y + 40, 900, 500, 0x0004) | Out-Null }
    [VentanaVid]::ShowWindow($proc.MainWindowHandle, 6) | Out-Null  # SW_MINIMIZE
  } catch { }
}

# Corre un programa en una ventana minimizada (pantalla 2), espera a que acabe y deja su salida en logs\<nombre>.log.
function Ejecutar($nombre, $exe, $argumentos) {
  New-Item -ItemType Directory -Force -Path $logs | Out-Null
  $log = Join-Path $logs "$nombre.log"
  # cmd /c redirige la salida al log; la ventana (minimizada) solo es el contenedor.
  $linea = '/c ""{0}" {1} > "{2}" 2>&1"' -f $exe, $argumentos, $log
  $p = Start-Process -FilePath 'cmd.exe' -ArgumentList $linea -WindowStyle Minimized -PassThru
  Ventana-EnPantalla2 $p
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) { throw "$nombre fallo (codigo $($p.ExitCode)). Mira $log" }
}

# Descarga con reanudacion (curl.exe viene con Windows) y comprueba el tamano exacto si se conoce.
function Bajar($url, $destino, [long]$bytes = 0) {
  New-Item -ItemType Directory -Force -Path (Split-Path $destino) | Out-Null
  if ($bytes -gt 0 -and (Test-Path $destino) -and (Get-Item $destino).Length -eq $bytes) { Write-Host "ya esta: $destino"; return }
  Ejecutar ('bajar-' + (Split-Path $destino -Leaf)) 'curl.exe' ('-L --fail --retry 5 -C - -o "{0}" "{1}"' -f $destino, $url)
  if ($bytes -gt 0 -and (Get-Item $destino).Length -ne $bytes) { throw "Tamano distinto en $destino (esperado $bytes, hay $((Get-Item $destino).Length)). Vuelve a correr el script para reanudar." }
}

# -- El plan ---------------------------------------------------------------------------------------------------------
$hacerComfy = -not $SoloChatterbox
$hacerVoz = -not $SoloComfy
Paso 'Plan'
Write-Host "Carpeta: $Raiz"
if ($hacerComfy) { Write-Host "- ComfyUI portable + nodos $($nodos -join ', ') + checkpoints de LatentSync 1.5 (~5.6 GB, mas ~2 GB de ComfyUI)" }
if ($hacerVoz) {
  $extra = if ($BajarModeloChatterbox) { ' + los pesos del modelo (~3 GB)' } else { '' }
  Write-Host "- Python 3.11 + venv $venv + torch CUDA + chatterbox-tts (~6 GB)$extra"
}
$libre = [math]::Round((Get-PSDrive -Name ($Raiz.Substring(0, 1))).Free / 1GB, 1)
Write-Host "Espacio libre en $($Raiz.Substring(0, 2)): $libre GB (se piden unos 20)"
try { Write-Host ('GPU: ' + (& nvidia-smi --query-gpu=name,memory.total --format=csv,noheader)) } catch { Write-Host 'GPU: no encuentro nvidia-smi (hace falta una NVIDIA con 8 GB para LatentSync).' -ForegroundColor Yellow }
if (-not $Autorizado) {
  Write-Host "`nNo se ha instalado nada. Para instalar, vuelve a correr con -Autorizado." -ForegroundColor Yellow
  exit 0
}
if ($libre -lt 20) { throw "Faltan GB libres en el disco ($libre de 20)." }

# -- ComfyUI + LatentSync --------------------------------------------------------------------------------------------
if ($hacerComfy) {
  Paso 'ComfyUI portable'
  $raizComfy = Join-Path $comfy 'ComfyUI_windows_portable\ComfyUI'
  if (-not (Test-Path (Join-Path $raizComfy 'main.py'))) {
    $rel = Invoke-RestMethod 'https://api.github.com/repos/comfyanonymous/ComfyUI/releases/latest' -Headers @{ 'User-Agent' = 'vid-koldgold' }
    $asset = $rel.assets | Where-Object { $_.name -eq 'ComfyUI_windows_portable_nvidia.7z' } | Select-Object -First 1
    if (-not $asset) { throw 'No encuentro ComfyUI_windows_portable_nvidia.7z en la ultima version de ComfyUI.' }
    $archivo = Join-Path $descargas $asset.name
    Bajar $asset.browser_download_url $archivo ([long]$asset.size)
    New-Item -ItemType Directory -Force -Path $comfy | Out-Null
    $sz = @('C:\Program Files\7-Zip\7z.exe', 'C:\Program Files (x86)\7-Zip\7z.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($sz) { Ejecutar 'extraer-comfyui' $sz ('x "{0}" -o"{1}" -y' -f $archivo, $comfy) }
    else { Ejecutar 'extraer-comfyui' 'tar.exe' ('-xf "{0}" -C "{1}"' -f $archivo, $comfy) }
    if (-not (Test-Path (Join-Path $raizComfy 'main.py'))) { throw "Se extrajo, pero no encuentro $raizComfy\main.py" }
  } else { Write-Host 'ya esta ComfyUI' }

  Paso 'Nodos de ComfyUI (LatentSync y VideoHelperSuite)'
  $pythonComfy = Join-Path (Split-Path $raizComfy) 'python_embeded\python.exe'
  foreach ($repo in $nodos) {
    $nombre = $repo.Split('/')[1]
    $destino = Join-Path $raizComfy "custom_nodes\$nombre"
    if (Test-Path $destino) { Write-Host "ya esta $nombre"; continue }
    $zip = Join-Path $descargas "$nombre.zip"
    Bajar "https://github.com/$repo/archive/refs/heads/main.zip" $zip
    $tmp = Join-Path $raizComfy "custom_nodes\.descarga-$nombre"
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    Move-Item (Get-ChildItem $tmp | Select-Object -First 1).FullName $destino
    Remove-Item $tmp -Recurse -Force
    $req = Join-Path $destino 'requirements.txt'
    if (Test-Path $req) { Ejecutar "pip-$nombre" $pythonComfy ('-s -m pip install -r "{0}"' -f $req) }
  }

  Paso 'Checkpoints de LatentSync 1.5'
  foreach ($p in $pesos) { Bajar $p.url (Join-Path $raizComfy $p.destino) $p.bytes }
}

# -- Chatterbox ------------------------------------------------------------------------------------------------------
if ($hacerVoz) {
  Paso 'Python 3.11'
  $py = $null
  try { $py = (& py -3.11 -c 'import sys;print(sys.executable)' 2>$null) } catch { }
  if (-not $py) {
    Ejecutar 'python311' 'winget.exe' 'install -e --id Python.Python.3.11 --scope user --accept-package-agreements --accept-source-agreements'
    $py = (& py -3.11 -c 'import sys;print(sys.executable)')
  }
  Write-Host "Python: $py"

  Paso 'Entorno de Chatterbox'
  if (-not (Test-Path (Join-Path $venv 'Scripts\python.exe'))) { Ejecutar 'venv-chatterbox' $py ('-m venv "{0}"' -f $venv) }
  $pyv = Join-Path $venv 'Scripts\python.exe'
  Ejecutar 'pip-actualizar' $pyv '-m pip install --upgrade pip'
  # chatterbox-tts fija torch 2.6.0: se instala esa version con CUDA 12.4 antes, para que pip no ponga la de CPU.
  Ejecutar 'pip-torch' $pyv '-m pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu124'
  Ejecutar 'pip-chatterbox' $pyv '-m pip install chatterbox-tts'
  Copy-Item (Join-Path $AQUI 'chatterbox-servidor.py') (Join-Path $venv 'servidor.py') -Force
  if ($BajarModeloChatterbox) {
    Paso 'Pesos de Chatterbox (primera vez)'
    Ejecutar 'chatterbox-modelo' $pyv "-c `"import torch; from chatterbox.mtl_tts import ChatterboxMultilingualTTS as C; C.from_pretrained(device=('cuda' if torch.cuda.is_available() else 'cpu'))`""
  }
}

Paso 'Listo'
if ($hacerComfy) { Write-Host "LatentSync: $raizComfy (v!d lo detecta solo; si esta en otra carpeta, ponla en Opciones)" }
if ($hacerVoz) { Write-Host "Chatterbox: $venv (v!d enciende el servidor la primera vez que se pide una voz; los pesos se bajan entonces si faltan)" }
Write-Host "Registros en $logs"
