#!/usr/bin/env node
// 决策派单的回执样例（内核 ingest 会按 type 再派给对应规则）。
// 跑法：node dispatcher/examples/receipt-example.mjs
import { parseRules } from "../../../protocol/rules.ts";
import { parseEvent } from "../../../protocol/validate.ts";
import { typeMatches } from "../../../kernel/rules.ts";

const receipt = {
  events: [
    {
      id: "job-2026-11-13-1",
      type: "task.wb",
      subject: "repo/app#42",
      summary: "修复登录页空指针并补测试",
      detail: "登录页提交空表单时崩溃，见 issue 42；改完跑 npm test。",
      link: "https://github.com/example/app/issues/42",
    },
    {
      id: "job-2026-11-13-2",
      type: "task.qoder",
      subject: "repo/big#7",
      summary: "梳理 20 万行仓库的模块依赖",
      detail: "按 Qoder 擅长的长上下文，输出模块依赖清单。",
    },
    {
      id: "job-2026-11-13-3",
      type: "task.loomy",
      subject: "weekly-2026w46",
      summary: "把本周会议纪要整理成周报草稿",
      detail: "读 docs/meetings 下本周纪要，写草稿到 briefs/。",
    },
  ],
};

// 1) 每个事件都能通过中台的 parseEvent（字段、长度、字符约束）。
for (const e of receipt.events) {
  const parsed = parseEvent(e);
  console.log(`✓ parseEvent ok  ${parsed.type.padEnd(12)} id=${parsed.id}`);
}

// 2) 决策规则的 emits 白名单 + 三条干活规则的 when.types 都能匹配上。
const rules = parseRules(
  await (await import("node:fs/promises")).readFile(new URL("./rules.json", import.meta.url), "utf8"),
  Date.now(),
  "Asia/Shanghai",
);
const decide = rules.rules.find((r) => r.name === "每日决策派单");
const workers = rules.rules.filter((r) => ["派给 WorkBuddy", "派给 Qoder", "派给 Loomy"].includes(r.name));
for (const e of receipt.events) {
  const allowed = decide.emits && decide.emits.source === "dispatch" && typeMatches(decide.emits.types, e.type);
  const targets = workers.filter((r) => r.when.source === "dispatch" && typeMatches(r.when.types, e.type)).map((r) => r.to);
  console.log(`  ${e.type.padEnd(12)} emits白名单=${allowed}  派给=${targets.join(",") || "（无）"}`);
  if (!allowed || targets.length !== 1) throw new Error(`路由不对：${e.type}`);
}
console.log("\n全部通过：决策回执 → 内核 → 三个干活 Agent 各接各的。");
