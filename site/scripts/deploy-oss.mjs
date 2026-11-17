#!/usr/bin/env node
// 把 Astro 的 dist/ 发布到阿里云 OSS，并刷新阿里云 CDN。
//
//   node scripts/deploy-oss.mjs              # 先构建再上传（普通发布）
//   node scripts/deploy-oss.mjs --upload-only # 用现有 dist/ 直接上传
//   node scripts/deploy-oss.mjs --skip-refresh # 上传但不刷新 CDN
//
// 需要的环境变量（写在仓库根目录 .env，已被 gitignore）：
//   ALIYUN_OSS_BUCKET  目标 bucket，例如 pabrai-site-cn
//   OSS_REGION         默认 cn-hangzhou
//   ALIYUN_CLI_PROFILE 可选，阿里云 CLI 的 OAuth profile 名（例如 codex-oss）
//   ALIYUN_CDN_URL     正式域名，默认 https://pabrai.ayaseeri.com
//   ALIYUN_CLI_BIN     可选，aliyun 可执行文件路径
//
// bucket 是私有 ACL，CDN 通过服务关联角色 AliyunCDNAccessingPrivateOSSRole 回源；
// 新 bucket 需要给该角色挂一条只读策略（见 docs/deploy-oss.md）。
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENV_ROOT = path.resolve(ROOT, '..')

// 直接 `node scripts/deploy-oss.mjs` / `npm run deploy:oss` 时也读仓库根 .env；
// 通过 ./deploy.sh 进入时 .env 已由 shell 导出，这里不会覆盖已有值。
function loadEnv() {
  const file = path.join(ENV_ROOT, '.env')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (!match || line.trimStart().startsWith('#')) continue
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(match[1] in process.env)) process.env[match[1]] = value
  }
}
loadEnv()

const PUBLIC_DIR = path.join(ROOT, 'dist')
const WEBSITE_XML = path.join(ROOT, 'scripts/oss-website.xml')
const argv = process.argv.slice(2)
const uploadOnly = argv.includes('--upload-only')
const skipRefresh = argv.includes('--skip-refresh')

const bucket = (process.env.ALIYUN_OSS_BUCKET || '').trim()
const region = (process.env.OSS_REGION || 'cn-hangzhou').trim()
const profile = (process.env.ALIYUN_CLI_PROFILE || '').trim()
const cdnUrl = (process.env.ALIYUN_CDN_URL || 'https://buffett.ayaseeri.com').trim().replace(/\/$/, '')

function fail(message) {
  console.error(`部署失败：${message}`)
  process.exit(1)
}

if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) fail(`ALIYUN_OSS_BUCKET 不合法：${bucket || '(空)'}`)
if (!/^[a-z0-9-]+$/.test(region)) fail(`OSS_REGION 不合法：${region}`)

function findCli() {
  const candidates = [
    process.env.ALIYUN_CLI_BIN,
    path.join(process.env.HOME || '', '.local/bin/aliyun'),
    '/usr/local/bin/aliyun',
    '/opt/homebrew/bin/aliyun',
  ].filter(Boolean)
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  try {
    return execFileSync('sh', ['-c', 'command -v aliyun'], { encoding: 'utf8' }).trim()
  } catch {
    fail('找不到 aliyun CLI。设置 ALIYUN_CLI_BIN，或安装 https://help.aliyun.com/zh/cli/')
  }
}

const CLI = findCli()
const common = [...(profile ? ['--profile', profile] : []), '--region', region, '--endpoint', `oss-${region}.aliyuncs.com`]
const cdnArgs = profile ? ['--profile', profile] : []

function run(args) {
  console.log(`> ${path.basename(CLI)} ${args.filter((arg) => !arg.startsWith('-----')).join(' ').slice(0, 160)}`)
  execFileSync(CLI, args, { stdio: 'inherit', cwd: ROOT })
}

if (!uploadOnly) {
  console.log('-> 构建静态站点')
  execFileSync('npm', ['run', 'build'], {
    stdio: 'inherit',
    cwd: ROOT,
    env: { ...process.env, SKIP_DEPLOY: '1', NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=8192' },
  })
}

if (!existsSync(path.join(PUBLIC_DIR, 'index.html'))) fail('缺少 dist/index.html，先跑 npm run build')

const target = `oss://${bucket}/`
console.log(`-> 上传 ${path.relative(ROOT, PUBLIC_DIR)} -> ${target}`)
// 1) 先整站上传，内容类型按扩展名推断（html/css/js/图片/字体/xml/txt 都正确）。
run(['oss', 'cp', `${PUBLIC_DIR}/`, target, '-r', '-f', '--disable-ignore-error', ...common])
// 2) JSON / Markdown 需要显式 charset，供浏览器与 AI 抓取正确解析。
run(['oss', 'cp', `${PUBLIC_DIR}/`, target, '-r', '-f', '--include', '*.json',
  '--meta', 'Content-Type:application/json; charset=utf-8', '--disable-ignore-error', ...common])
run(['oss', 'cp', `${PUBLIC_DIR}/`, target, '-r', '-f', '--include', '*.md',
  '--meta', 'Content-Type:text/markdown; charset=utf-8', '--disable-ignore-error', ...common])

console.log('-> 写入 OSS 静态网站配置')
run(['oss', 'website', '--method', 'put', `oss://${bucket}`, WEBSITE_XML, ...common])

if (!skipRefresh) {
  console.log(`-> 刷新 CDN 目录缓存 ${cdnUrl}/`)
  run(['cdn', 'RefreshObjectCaches', '--ObjectPath', `${cdnUrl}/`, '--ObjectType', 'Directory', ...cdnArgs])
}

console.log(`发布完成：${cdnUrl}/`)
