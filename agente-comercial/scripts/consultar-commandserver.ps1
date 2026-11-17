param(
    [string]$OutputFile,
    [string]$CredentialFile = (Join-Path $env:USERPROFILE '.codex\private\commandserver-api-token.dpapi')
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $CredentialFile)) {
    throw 'Credencial protegida da API Command Server indisponivel neste computador/usuario.'
}
$secret = (Get-Content -LiteralPath $CredentialFile -Raw).Trim() | ConvertTo-SecureString
$credential = New-Object System.Management.Automation.PSCredential('api', $secret)
$headers = @{ Authorization = 'Bearer ' + $credential.GetNetworkCredential().Password }
try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri 'https://app.commandserver.com.br/api/public/versoes?formato=texto' -Headers $headers -TimeoutSec 30
} catch {
    throw 'Nao foi possivel consultar as versoes oficiais do Command Server. Conferir disponibilidade e autorizacao sem expor a credencial.'
} finally {
    $headers.Clear()
    $credential = $null
    $secret = $null
}
if ([string]$response.Content -notmatch '# Funcionalidades e novidades do sistema') {
    throw 'Formato inesperado na API de versoes. Revisar antes de atualizar o conhecimento.'
}
if ($OutputFile) {
    $target = [System.IO.Path]::GetFullPath($OutputFile)
    [System.IO.File]::WriteAllText($target, [string]$response.Content, [System.Text.UTF8Encoding]::new($false))
    Write-Output 'Consulta concluida; conteudo salvo no arquivo solicitado.'
} else {
    Write-Output ([string]$response.Content)
}
