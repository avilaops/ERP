# Servidor HTTP simples para servir o frontend WASM
# Porta: 8080

$port = 8080
$path = $PSScriptRoot

Write-Host "Servidor HTTP rodando em http://localhost:$port" -ForegroundColor Green
Write-Host "Servindo arquivos de: $path" -ForegroundColor Cyan
Write-Host "Acesse: http://localhost:$port" -ForegroundColor Yellow
Write-Host ""
Write-Host "Pressione Ctrl+C para parar" -ForegroundColor Gray
Write-Host ""

# Criar listener HTTP
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # Log da requisição
        Write-Host "$($request.HttpMethod) $($request.Url.LocalPath)" -ForegroundColor Cyan

        # Determinar arquivo
        $filePath = $request.Url.LocalPath
        if ($filePath -eq "/" -or $filePath -eq "") {
            $filePath = "/index.html"
        }

        $fullPath = Join-Path $path $filePath.TrimStart('/')

        if (Test-Path $fullPath -PathType Leaf) {
            # Ler arquivo
            $content = [System.IO.File]::ReadAllBytes($fullPath)

            # Determinar Content-Type
            $contentType = "application/octet-stream"
            switch ([System.IO.Path]::GetExtension($fullPath)) {
                ".html" { $contentType = "text/html; charset=utf-8" }
                ".css"  { $contentType = "text/css; charset=utf-8" }
                ".js"   { $contentType = "application/javascript; charset=utf-8" }
                ".wasm" { $contentType = "application/wasm" }
                ".json" { $contentType = "application/json; charset=utf-8" }
                ".png"  { $contentType = "image/png" }
                ".jpg"  { $contentType = "image/jpeg" }
                ".svg"  { $contentType = "image/svg+xml" }
            }

            $response.ContentType = $contentType
            $response.ContentLength64 = $content.Length
            $response.StatusCode = 200
            $response.OutputStream.Write($content, 0, $content.Length)

            Write-Host "  OK 200 - $contentType" -ForegroundColor Green
        }
        else {
            # 404 Not Found
            $response.StatusCode = 404
            $html = "<h1>404 - Nao Encontrado</h1><p>$filePath</p>"
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($html)
            $response.ContentType = "text/html; charset=utf-8"
            $response.OutputStream.Write($buffer, 0, $buffer.Length)

            Write-Host "  X 404 Not Found" -ForegroundColor Red
        }

        $response.Close()
    }
}
finally {
    $listener.Stop()
    Write-Host "Servidor parado" -ForegroundColor Yellow
}
