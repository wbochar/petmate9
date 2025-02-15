param (
	[switch]$showDeps = $false,
	[switch]$cleanModules = $false,
	[switch]$noOptions = $false

)

$version = (Get-Content package.json) -join "`n" | ConvertFrom-Json | Select-Object -ExpandProperty "version"
"Petmate Version: $version"
if($showDeps -eq $true)
{
"-------------------------------------"
"devDependencies"
"-------------------------------------"
(Get-Content package.json) -join "`n" | ConvertFrom-Json | Select-Object -ExpandProperty "devDependencies"
"-------------------------------------"
"dependencies"
"-------------------------------------"
(Get-Content package.json) -join "`n" | ConvertFrom-Json | Select-Object -ExpandProperty "devDependencies"
}

if($cleanModules -eq $true)
{
	If (Test-Path ./node_modules) {
	"Removing node_modules"
		remove-item ./node_modules -recurse -force
	}

	If (Test-Path ./package-lock.json) {
		"Removing package-lock.json"
			remove-item ./package-lock.json -force
		}

		If (Test-Path ./yarn.lock) {
			"Removing yarn.lock"
				remove-item ./yarn.lock -force
			}


}

if($noOptions)
{
	$env:NODE_OPTIONS = ""

}
else {
	$env:NODE_OPTIONS = "--openssl-legacy-provider"

}
nvm use 16.20.2
#nvm use lts
node --version
npm --version


npm install
npm run build