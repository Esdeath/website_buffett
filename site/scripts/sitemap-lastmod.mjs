// 构建期 sitemap <lastmod> 数据源:从 git 历史推导每个页面「真实最后修改日期」。
//
// 只在 astro build 的 sitemap serialize 阶段被调用;astro dev 不会触发,因此不会拖慢开发。
// 内容 md 的 frontmatter 没有日期字段,所以日期取自文件最后一次 git 提交(%cs = YYYY-MM-DD)。
// 浅克隆(CI 默认 depth=1)会先尝试一次 `git fetch --unshallow` 补全历史;补全失败则
// 查不到对应文件的页省略 lastmod——绝不用构建当天日期编造。
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** article type(URL 段)→ 内容目录(复数)。与 src/lib/url.ts 的 DIR_TO_TYPE 互为逆映射。 */
const TYPE_TO_DIR = {
  "category-overview": "category-overviews",
  company: "companies",
  industry: "industries",
  person: "people",
  question: "questions",
  timeline: "timelines",
};

/** 原文(markdown)所在目录;URL 分组 interviews/letters/... 不直接对应目录,按文件名 slug 索引。 */
const SOURCE_DIRS = ["berkshire", "interview", "shareholders"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 检测浅克隆。普通仓库读 .git/shallow(零子进程);worktree / 子模块交给 git 判断。 */
function detectShallow(repoRoot) {
  const dotGit = join(repoRoot, ".git");
  try {
    if (existsSync(dotGit) && statSync(dotGit).isDirectory()) {
      return existsSync(join(dotGit, "shallow"));
    }
  } catch {
    /* fall through to git */
  }
  try {
    const out = execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim() === "true";
  } catch {
    return false;
  }
}

/** 浅克隆时尝试补全历史(CI 默认 depth=1)。只有确认真的是全量历史才返回 "ok"。 */
function tryUnshallow(repoRoot) {
  try {
    execFileSync("git", ["fetch", "--unshallow", "--quiet"], {
      cwd: repoRoot,
      stdio: "ignore",
      timeout: 120_000,
    });
  } catch {
    return "failed";
  }
  // git 2.44 在无 remote 等情况下 --unshallow 可能 0 退出但仍是浅克隆,必须复核。
  return detectShallow(repoRoot) ? "failed" : "ok";
}

/**
 * 单次 git log 读取全部历史,建立「文件 → 最后提交日期」映射 + 仓库最新提交日期。
 * 浅克隆会先尝试一次 `git fetch --unshallow`(Cloudflare Pages 等 CI 默认 depth=1),
 * 补全失败则退回「查不到就省略」,绝不编造日期。
 * 注意:浅克隆的 HEAD 被 graft 成根提交,`--name-only` 会把整棵树都列成新增,
 * 因此历史不完整时清空文件映射——否则会把所有内容误标成 HEAD 提交日期。
 * git 不可用时返回 null(调用方省略 lastmod)。
 */
export function readGitDates(repoRoot) {
  const shallow = detectShallow(repoRoot);
  const unshallow = shallow ? tryUnshallow(repoRoot) : "skipped";
  const completeHistory = !shallow || unshallow === "ok";

  let output;
  try {
    output = execFileSync("git", ["log", "--format=%cs", "--name-only"], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }

  const fileDates = new Map();
  let latest = null;
  let current = null;
  for (const raw of output.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    if (DATE_RE.test(line)) {
      // 日志按新→旧排列,每行的日期作用于其后的文件名。
      current = line;
      if (latest === null) latest = line;
      continue;
    }
    if (current !== null && !fileDates.has(line)) fileDates.set(line, current);
  }
  // 历史不完整时文件映射不可信(浅克隆的根提交会把整棵树都列成新增),清空之;
  // 聚合页仍可用 latest(= 仓库最新提交,等价 git log -1 --format=%cs)。
  if (!completeHistory) fileDates.clear();
  return { fileDates, latest, shallow, unshallow, completeHistory };
}

/** 扫描原文目录,建立「slug → 仓库相对路径」索引(内容校验保证文件名 === frontmatter slug)。 */
function indexSources(repoRoot) {
  const bySlug = new Map();
  for (const dir of SOURCE_DIRS) {
    let entries;
    try {
      entries = readdirSync(join(repoRoot, "buffett", dir), {
        recursive: true,
        encoding: "utf8",
      });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const rel = entry.split("\\").join("/");
      if (!rel.endsWith(".md")) continue;
      const slug = rel.slice(rel.lastIndexOf("/") + 1, -3);
      bySlug.set(slug, `buffett/${dir}/${rel}`);
    }
  }
  return bySlug;
}

/** URL(绝对 URL 或站内路径)→ 内容 md 的仓库相对路径;索引/聚合/生成页返回 null。 */
export function contentPathForUrl(url, sourceBySlug) {
  let pathname;
  try {
    pathname = new URL(url, "https://placeholder.invalid").pathname;
  } catch {
    return null;
  }
  const path = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  if (path === "") return null;
  const parts = path.split("/");

  // /keywords/<slug>/ → buffett/articles/keywords/<slug>.md
  if (parts.length === 2 && parts[0] === "keywords") {
    return `buffett/articles/keywords/${parts[1]}.md`;
  }
  // /articles/<type>/<slug>/ → buffett/articles/<复数列目录>/<slug>.md
  if (parts.length === 3 && parts[0] === "articles") {
    const dir = TYPE_TO_DIR[parts[1]];
    return dir ? `buffett/articles/${dir}/${parts[2]}.md` : null;
  }
  // /sources/<group>/<slug>/ → 按 slug 反查原文文件(分组 slug 与目录不一一对应)
  if (parts.length === 3 && parts[0] === "sources") {
    return sourceBySlug.get(parts[2]) ?? null;
  }
  return null;
}

/**
 * 创建 lastmod 解析器(lastmodFor(url) → YYYY-MM-DD | null)并累计命中统计。
 * 策略:
 *   - 内容页且有文件:用该文件最后提交日期;文件存在但 git 里查不到 → 省略(不编造)。
 *   - 索引 / 聚合 / 生成页(/, /categories/, /books/**, /graph/ 等):回退仓库最新提交日期。
 */
export function createLastmodResolver(repoRoot) {
  const git = readGitDates(repoRoot);
  if (!git) {
    return {
      lastmodFor: () => null,
      stats: () => ({
        mapped: 0,
        fallback: 0,
        omitted: 0,
        git: false,
        shallow: null,
        unshallow: null,
        completeHistory: false,
      }),
    };
  }

  const { fileDates, latest, shallow, unshallow, completeHistory } = git;
  const sourceBySlug = indexSources(repoRoot);
  const counts = { mapped: 0, fallback: 0, omitted: 0 };

  return {
    lastmodFor(url) {
      const path = contentPathForUrl(url, sourceBySlug);
      if (path !== null) {
        const date = fileDates.get(path);
        if (date) {
          counts.mapped += 1;
          return date;
        }
        counts.omitted += 1;
        return null;
      }
      if (latest) {
        counts.fallback += 1;
        return latest;
      }
      counts.omitted += 1;
      return null;
    },
    stats: () => ({ ...counts, git: true, shallow, unshallow, completeHistory }),
  };
}
