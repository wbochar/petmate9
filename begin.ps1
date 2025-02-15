clear-host

"=- File Clean Up ------------------------------------"

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

"=- clear node options -------------------------------"

$env:NODE_OPTIONS = ""

"=- nvm use ------------------------------------------"

nvm use 16.14.0
#nvm use 16.20.2
"=- install typescript@^3.1.6--------------------------"
npm i typescript@^3.1.6 --save-dev
#"=- install ------------------------------------------"
#npm i
"=- build --------------------------------------------"
npm run build
"=- install typescript@^5.0.0--------------------------"
npm i typescript@^5.0.0 --save-dev
"=- build --------------------------------------------"
npm run build
"=- start --------------------------------------------"
npm run start

