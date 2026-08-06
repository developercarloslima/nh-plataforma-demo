$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root
if (Test-Path ".env") { Write-Host ".env já existe."; exit 0 }
Copy-Item ".env.kinghost.example" ".env"
function New-Secret([int]$Bytes = 48) {
  $buffer = New-Object byte[] $Bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
  return [Convert]::ToBase64String($buffer).Replace("+","A").Replace("/","B").Replace("=","")
}
$content = Get-Content ".env" -Raw
$content = $content.Replace("TROQUE_POR_UMA_SENHA_FORTE", (New-Secret 36))
$content = $content.Replace("TROQUE_POR_UMA_CHAVE_ALEATORIA_COM_64_CARACTERES", (New-Secret 64))
[IO.File]::WriteAllText((Join-Path $Root ".env"), $content, (New-Object Text.UTF8Encoding($false)))
Write-Host ".env criado. Preencha domínios, acessos, SGA, Hinova e as credenciais da plataforma."
notepad .env
