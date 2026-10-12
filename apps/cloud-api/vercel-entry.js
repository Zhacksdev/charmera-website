// Entrypoint Vercel. deploy-out/ dibuat oleh buildCommand di vercel.json (`pnpm deploy`):
// berisi dist + node_modules berupa file nyata, karena symlink pnpm ke node_modules root
// berada di luar folder service dan tidak ikut terbawa ke function.
const mod = require('./deploy-out/dist/server.js')

module.exports = mod.default || mod
