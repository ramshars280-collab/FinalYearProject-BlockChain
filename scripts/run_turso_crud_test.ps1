<#
.SYNOPSIS
    SOET VeriTrust - Secure Interactive Runner for Remote CRUD & Transaction Testing (Phase 3C Step 8E)
.DESCRIPTION
    Prompts for the Turso auth token using masked input (Read-Host -AsSecureString).
    Temporarily sets TURSO_DATABASE_URL and TURSO_TEST_AUTH_TOKEN strictly in process memory.
    Executes scripts/test_turso_crud.js to verify remote CRUD, constraints, and transactions.
    Cleans up all environment variables and in-memory secret references in a finally block.
#>

$testUrl = "libsql://soet-veritrust-test-ramsha12.aws-ap-south-1.turso.io"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   SOET VeriTrust - Remote CRUD & Transaction Test (Turso)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Target Database: soet-veritrust-test" -ForegroundColor White
Write-Host "Target URL:      $testUrl" -ForegroundColor Gray
Write-Host "Action:          Isolated remote CRUD, constraint & transaction verification" -ForegroundColor White
Write-Host "`nPlease paste your database-scoped Turso token below." -ForegroundColor Yellow
Write-Host "(Input is masked with asterisks and will NOT be echoed, logged, or saved):" -ForegroundColor Gray

$secureToken = Read-Host -Prompt "Enter Turso Token" -AsSecureString

if ($null -eq $secureToken -or $secureToken.Length -eq 0) {
    Write-Host "`n[ERROR]: No token provided. Aborting remote CRUD test." -ForegroundColor Red
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

    # Execute isolated remote CRUD test script
    node scripts/test_turso_crud.js
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

