$content = Get-Content "src/pages/LandingPage.jsx" -Raw
$content = $content -replace '&rarr;', '→'
$content = $content -replace '&mdash;', '—'
$content = $content -replace '&ldquo;', '"'
$content = $content -replace '&rdquo;', '"'
$content = $content -replace '&lsquo;', '''''
$content = $content -replace '&rsquo;', ''''
$content | Set-Content "src/pages/LandingPage.jsx"