remove-item ./node_modules -recurse -force
remove-item ./package-lock.json -force
remove-item ./yarn.lock -force
npm install
