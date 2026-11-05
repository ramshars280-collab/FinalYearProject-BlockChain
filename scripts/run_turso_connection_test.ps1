<#
.SYNOPSIS
    SOET VeriTrust - Secure Interactive Runner for Turso Connection Test (Phase 3C Step 8B)
.DESCRIPTION
    Prompts for the Turso auth token using masked input (Read-Host -AsSecureString).
    Temporarily sets TURSO_DATABASE_URL and TURSO_TEST_AUTH_TOKEN strictly in process memory.
    Executes scripts/test_turso_connection.js without exposing or persisting secrets.
    Cleans up all environment variables and in-memory secret references in a finally block.
#>

$testUrl = "libsql://soet-veritrust-test-ramsha12.aws-ap-south-1.turso.io"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   SOET VeriTrust - Secure Turso Connection Test" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Target Database: soet-veritrust-test" -ForegroundColor White
Write-Host "Target URL:      $testUrl" -ForegroundColor Gray
Write-Host "`nPlease paste your database-scoped Turso token below." -ForegroundColor Yellow
Write-Host "(Input is masked with asterisks and will NOT be echoed, logged, or saved):" -ForegroundColor Gray

$secureToken = Read-Host -Prompt "Enter Turso Token" -AsSecureString

if ($null -eq $secureToken -or $secureToken.Length -eq 0) {
    Write-Host "`n[ERROR]: No token provided. Aborting connection test." -ForegroundColor Red
    exit 1
}

try {
    # Convert SecureString to process memory string
    $plainToken = [System.Net.NetworkCredential]::new('', $secureToken).Password

    # Set process-scoped environment variables
    $env:TURSO_DATABASE_URL = $testUrl
    $env:TURSO_TEST_AUTH_TOKEN = $plainToken

    # Release plaintext reference from local variable
    $plainToken = $null

    # Execute isolated test script
    node scripts/test_turso_connection.js
}
finally {
    # Purge environment variables from process memory
    Remove-Item Env:\TURSO_TEST_AUTH_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:\TURSO_DATABASE_URL -ErrorAction SilentlyContinue

    if ($secureToken) {
        $secureToken.Dispose()
    }

    Write-Host "`n[Security Confirmation]: Memory references and process environment variables have been purged." -ForegroundColor Green
}

