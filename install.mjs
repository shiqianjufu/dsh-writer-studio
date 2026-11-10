// install.mjs — 把写作台装进本机 DSH desktop profile。
//
// 只做四件事：复制插件、登记依赖、登记 bundle、建 node_modules 联接。
// 不碰 profile 里任何别的插件；package.json 修改前先备份。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DSH_HOME = process.env.DSH_HOME ? path.resolve(process.env.DSH_HOME) : path.join(os.homedir(), '.dsh');
// DSH_PROFILE 可能是名字（desktop）也可能是绝对路径；优先用宿主给的 DSH_PROFILE_DIR。
const PROFILE = process.env.DSH_PROFILE_DIR
  ? path.resolve(process.env.DSH_PROFILE_DIR)
  : process.env.DSH_PROFILE && path.isAbsolute(process.env.DSH_PROFILE)
    ? path.resolve(process.env.DSH_PROFILE)
    : path.join(DSH_HOME, 'profiles', process.env.DSH_PROFILE || 'desktop');
const NAME = 'dsh-writer-studio';
const TARGET = path.join(DSH_HOME, 'plugins', NAME);

function log(message) {
  console.log(`[writer-studio] ${message}`);
}

function backup(file) {
  if (!fs.existsSync(file)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(file, `${file}.bak-writer-studio-${stamp}`);
}

if (!fs.existsSync(path.join(PROFILE, 'package.json'))) {
  console.error(`找不到 DSH profile：${PROFILE}\n可以用 DSH_PROFILE=C:\\path\\to\\profile 指定。`);
  process.exit(1);
}

if (path.resolve(HERE) === path.resolve(TARGET)) {
  console.error('请不要从安装目录里运行 install.mjs（它会先删掉自己）。请在源码目录运行。');
  process.exit(1);
}

// 1. 复制（排除测试残留）
fs.rmSync(TARGET, { recursive: true, force: true });
fs.mkdirSync(TARGET, { recursive: true });
fs.cpSync(HERE, TARGET, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(HERE, src);
    if (!rel) return true;
    if (rel.startsWith(`.tmp-`)) return false;
    if (rel === 'node_modules' || rel === '.git') return false;
    if (rel.endsWith('.log')) return false;
    return true;
  },
});
log(`已复制到 ${TARGET}`);

// 2. 登记 package.json
const pkgPath = path.join(PROFILE, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.dependencies = pkg.dependencies || {};
pkg.dependencies[NAME] = `link:${TARGET.replace(/\\/g, '/')}`;
pkg.dsh = pkg.dsh || {};
pkg.dsh.profile = pkg.dsh.profile || {};
pkg.dsh.profile.bundles = pkg.dsh.profile.bundles || [];
if (!pkg.dsh.profile.bundles.includes(NAME)) pkg.dsh.profile.bundles.push(NAME);
backup(pkgPath);
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
log('已登记依赖与 bundles');

// 3. node_modules 联接
const modules = path.join(PROFILE, 'node_modules');
fs.mkdirSync(modules, { recursive: true });
const linkPath = path.join(modules, NAME);
let removed = false;
try {
  const stat = fs.lstatSync(linkPath);
  if (stat.isSymbolicLink()) {
    fs.unlinkSync(linkPath);
    removed = true;
  } else {
    console.warn(`[writer-studio] ${linkPath} 已存在且不是联接，跳过创建。请先手动移走它。`);
  }
} catch { /* 不存在 */ }
if (!fs.existsSync(linkPath)) {
  fs.symlinkSync(TARGET, linkPath, 'junction');
  log(`已建立联接：${linkPath}`);
} else if (!removed) {
  log('node_modules 联接未改动');
}

console.log('');
console.log('安装完成。完全退出并重启 DeepSeek Harness（不是刷新页面）。');
console.log('重启后右侧栏引导页会出现「写作台」。');
