# Keyword Article Template Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite four Buffett keyword articles so their evidence, structure, and content counts satisfy section 7.2 of the master TODO.

**Architecture:** Treat each topic as one article package consisting of a source matrix, quote cards, and canonical article. Expand evidence first, then rewrite the article, then validate all four packages together against the same structural contract.

**Tech Stack:** Markdown, ripgrep, shell-based structural validation, Git diff checks.

---

### Task 1: Expand Evidence for 纪律 and 逆向思维

**Files:**
- Modify: `docs/source-matrices/ji-lv.md`
- Modify: `docs/quote-cards/ji-lv.md`
- Modify: `docs/source-matrices/ni-xiang-si-wei.md`
- Modify: `docs/quote-cards/ni-xiang-si-wei.md`
- Read: `buffett/berkshire/gu-dong-xin/*.md`
- Read: `buffett/shareholders/*.md`
- Read: `buffett/interview/*.md`

- [ ] **Step 1: Search original materials for exact evidence**

Run:

```bash
rg -n "纪律|自律|不这么做|翻本|现实主义|独立思考|逆向|从众|随波逐流|恐惧|贪婪" buffett/berkshire buffett/shareholders buffett/interview
```

Expected: Multiple dated source passages, including the four passages already present in each matrix and at least one additional usable passage per topic.

- [ ] **Step 2: Add verified rows to both source matrices**

Each row must use this exact schema:

```markdown
| 来源 | 年份 | 类型 | 文件 | 关键原文 |
```

Add only passages whose wording can be located in the referenced `buffett/` file.

- [ ] **Step 3: Add matching quote cards**

Each new card must contain exactly these fields:

```markdown
- 原话：...
- 可用于：...
- 我的理解：...
```

Expected: Each topic has 5-7 verified quote cards and matching matrix rows.

### Task 2: Expand Evidence for 少即是多 and 不懂不做

**Files:**
- Modify: `docs/source-matrices/shao-ji-shi-duo.md`
- Modify: `docs/quote-cards/shao-ji-shi-duo.md`
- Modify: `docs/source-matrices/bu-dong-bu-zuo.md`
- Modify: `docs/quote-cards/bu-dong-bu-zuo.md`
- Read: `buffett/berkshire/gu-dong-xin/*.md`
- Read: `buffett/shareholders/*.md`
- Read: `buffett/interview/*.md`

- [ ] **Step 1: Search original materials for exact evidence**

Run:

```bash
rg -n "一个好主意|很少的时候|简单|太难|能力圈|不懂|搞不懂|难以预测|放弃机会" buffett/berkshire buffett/shareholders buffett/interview
```

Expected: Multiple dated passages supporting decision concentration, simplicity, the Too Hard pile, and capability boundaries.

- [ ] **Step 2: Add verified rows to both source matrices**

Use the same five-column source matrix schema and preserve exact repository-relative source paths.

- [ ] **Step 3: Add matching quote cards**

Expected: Each topic has 5-7 verified quote cards and matching matrix rows.

### Task 3: Rewrite 纪律 and 逆向思维

**Files:**
- Modify: `buffett/articles/keywords/ji-lv.md`
- Modify: `buffett/articles/keywords/ni-xiang-si-wei.md`

- [ ] **Step 1: Replace the current hybrid structure**

Use this exact level-two heading order:

```markdown
## 一句话定义
## 中心问题
## 原文依据概览
## 定义与起源
## 核心要义
## 主引用
## 思想演变
## 代表案例
## 常见误解
## 延伸阅读
## 常见问题
## 总结
```

- [ ] **Step 2: Fill every section from verified evidence**

Required counts per article: 3-5 core points, 5-7 quotations, 5 cases, 5 misunderstandings, 5 related topics, and 5 FAQs.

- [ ] **Step 3: Remove obsolete hybrid headings**

Run:

```bash
rg -n "^## (这类问题在巴菲特体系中的位置|关键词地图|判断框架|容易误解的地方|相关关键词|小结)$" buffett/articles/keywords/ji-lv.md buffett/articles/keywords/ni-xiang-si-wei.md
```

Expected: No matches.

### Task 4: Rewrite 少即是多 and 不懂不做

**Files:**
- Modify: `buffett/articles/keywords/shao-ji-shi-duo.md`
- Modify: `buffett/articles/keywords/bu-dong-bu-zuo.md`

- [ ] **Step 1: Replace the current hybrid structure**

Use the same 12-heading order defined in Task 3.

- [ ] **Step 2: Fill every section from verified evidence**

Required counts per article: 3-5 core points, 5-7 quotations, 5 cases, 5 misunderstandings, 5 related topics, and 5 FAQs.

- [ ] **Step 3: Remove obsolete hybrid headings**

Run:

```bash
rg -n "^## (这类问题在巴菲特体系中的位置|关键词地图|判断框架|容易误解的地方|相关关键词|小结)$" buffett/articles/keywords/shao-ji-shi-duo.md buffett/articles/keywords/bu-dong-bu-zuo.md
```

Expected: No matches.

### Task 5: Validate Evidence and Structure

**Files:**
- Test: `buffett/articles/keywords/ji-lv.md`
- Test: `buffett/articles/keywords/ni-xiang-si-wei.md`
- Test: `buffett/articles/keywords/shao-ji-shi-duo.md`
- Test: `buffett/articles/keywords/bu-dong-bu-zuo.md`
- Test: `docs/source-matrices/{ji-lv,ni-xiang-si-wei,shao-ji-shi-duo,bu-dong-bu-zuo}.md`
- Test: `docs/quote-cards/{ji-lv,ni-xiang-si-wei,shao-ji-shi-duo,bu-dong-bu-zuo}.md`

- [ ] **Step 1: Verify all heading sequences**

Run:

```bash
for f in buffett/articles/keywords/{ji-lv,ni-xiang-si-wei,shao-ji-shi-duo,bu-dong-bu-zuo}.md; do rg '^## ' "$f"; done
```

Expected: Each file prints the same 12 headings in the specified order.

- [ ] **Step 2: Verify content counts**

Run section-scoped searches for quote sources, numbered cases, numbered misunderstandings, related-topic bullets, and numbered FAQs.

Expected per article: 5-7 quote sources, 5 cases, 5 misunderstandings, 5 related-topic bullets, and 3-5 FAQs.

- [ ] **Step 3: Verify new quotation wording**

For every newly added matrix row, run an exact or distinctive-fragment `rg -n` search against the referenced source file.

Expected: Every passage has one matching source location.

- [ ] **Step 4: Run Markdown diff validation**

Run:

```bash
git diff --check
git status --short -- buffett/articles/keywords docs/source-matrices docs/quote-cards docs/superpowers
```

Expected: `git diff --check` exits with no output; status only reports intended files plus pre-existing unrelated changes.

### Task 6: Final State Sync

**Files:**
- Verify: `docs/keyword-registry.md`
- Verify: `docs/article-index.md`
- Verify: `docs/buffett-knowledge-base-master-todo.md`

- [ ] **Step 1: Confirm management files still point to the four canonical articles**

Run:

```bash
rg -n "纪律|逆向思维|少即是多|不懂不做" docs/keyword-registry.md docs/article-index.md docs/buffett-knowledge-base-master-todo.md
```

Expected: All four topics remain present with their canonical paths.

- [ ] **Step 2: Preserve verified status only after all checks pass**

If every Task 5 check passes, keep `status: "已核验"` and the existing management status. If any evidence check fails, set only the affected article and management entry to `初稿完成`.

- [ ] **Step 3: Do not commit without explicit user authorization**

Leave all changes unstaged and report the exact validation results.
