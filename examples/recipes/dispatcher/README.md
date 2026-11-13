# 示例：一个 DSH 里，决策和干活各用不同模型

WorkBuddy 模型由本机已装的 `dsh-connect-workbuddy` 插件注册进 DSH（`workbuddy` 国内版 /
`workbuddy-global` 国际版）。本例用 **autoloop 内置 `dsh` 插件的 `model` 字段**给每个 Agent
指定模型：决策一轮用国内版 GLM-5.3，三条干活规则分别用国内版 DeepSeek-V4-Pro、国际版 Kimi-K3、
国际版 GPT-5.6。全部是同一个 `dsh` 二进制，只是每轮带不同的 `--patch` 覆盖默认模型。

用前把 `/绝对路径/work`、`worker` 名换成自己的，再：
  agent-autoloop check examples/recipes/dispatcher/rules.json

## 相对上游 autoloop 的改造

上游 `plugins/dsh/agent.ts` 里 `model` 是无效的（文档明说「用 DSH 自己的配置」）。本仓库改为：

- `model` 写成 `model-id`（沿用 DSH 默认 provider）或 `provider/model-id`（连 provider 一起换）；
- 插件在每轮自己的文件夹里生成 `dsh-model.yml`（一个只覆盖 `agent-default-model` 的
  `--patch` 覆盖层），并在 `dsh` 命令里加 `--patch <文件>`；
- 没写 `model` 时命令与改造前**逐字相同**，老配置不受影响；
- 会话续接（`--session-id`）照旧带 patch：patch 只设定新会话的默认模型，不会改掉已有会话的模型。

`--patch` 必须是 launcher flag：放在 `headless` 之前、`--json` 之前。实测（DSH 0.2.1-rc.5）
`dsh headless --patch p.yml --json "hi"` 生效，`dsh --profile headless --json --patch p.yml "hi"`
报 `unknown option '--patch'`。patch 只写 `model` 会把默认 `provider` 冲掉，所以只在写了
`provider` 时才输出 provider 行。

## 机制

- 决策规则（cron 或 `inbox/work.*`）→ `to: wb-decide`，模型 GLM-5.3；它在最后一条回复里附
  `agent-autoloop` 回执，`events[].type` 写 `task.wb` / `task.qoder` / `task.loomy`。
- 内核 `ingest()` 按 `when.source=dispatch + when.types` 再派给三条规则，各用各的 `model`。
- 事件里的 `detail` 只进 `context.json` 资料文件、不进提示词；「选谁」由规则的 `types` 决定，
  不由模型正文决定。`hops` 每层 +1，超过 8 层只记录不派发。

## 启用前要改

1. 把所有 `/绝对路径/work` 换成真实目录，`worker` 名换成 `config.json` 里的接单电脑名。
2. 把 `model` 换成 `dsh-connect-workbuddy` 目录里**实际存在**的模型：在 DSH 模型选择器里看，
   或跑 `dsh-connect-workbuddy doctor`。示例里的模型名来自插件 README 的目录，会随上游变。
3. 装 independent `dsh` 0.2.2+（autoloop 的 `dsh` 插件要求），并让 `dsh-connect-workbuddy`
   在 headless profile 里可见、能读到 `workbuddy-vault` 凭据——见本文件末尾「待讨论」。
4. `agent-autoloop check examples/recipes/dispatcher/rules.json`，然后 `agent-autoloop try`。

## 验证过的东西

- `node bin/agent-autoloop.ts check examples/recipes/dispatcher/rules.json` → 规则没问题
- `node --disable-warning=ExperimentalWarning --test tests/dsh.test.ts` → 10/10 通过，含
  「有 model 生成 patch / 无 model 保持原命令 / provider 拆分 / resume 仍带 patch」
- `tsc -p . --noEmit` 和 `prettier --check` 通过
- `receipt-example.mjs` → 三条 `task.*` 事件都能通过 `parseEvent`、命中 `emits` 白名单、
  各派给唯一一个 Agent
- 四个 Agent 各自生成不同的 `dsh-model.yml`（provider + model 均不同）
- 真实 DSH 侧：`--patch` 覆盖 `agent-default-model` 后 `--dump-config` 生效；启动后报
  `NO_ADAPTER: no adapter registered for provider "workbuddy"` 恰好证明模型选择真的被换掉了
  （临时 HOME 里没装插件，所以找不到该 provider）

## 待讨论 / 本机尚未跑通

1. **版本**：本机 `dsh` 是桌面 App 内的 `0.2.1-rc.5`，而 autoloop 的 `dsh` 插件要 0.2.2+
   （`check` 会查 `--approval-policy`）。PATH 里没有独立 npm 版 `dsh`。
2. **profile 隔离**：`dsh-connect-workbuddy` 装在 `~/.dsh/profiles/desktop`（Electron 独占，
   `dsh --profile desktop` 被拒），而 `dsh headless` 用独立的 `~/.dsh/profiles/headless`。
   要让 headless 会话看到 WorkBuddy 模型，得把插件装进 headless profile 或让它复用同一份
   `DSH_HOME` / `workbuddy-vault` 凭据；怎么共享最稳妥需要试。
3. **EPERM**：本机 `dsh headless` 试图建 `~/.dsh/profiles/headless` 时报
   `EPERM: mkdir`。可能是本会话沙箱限制，也可能是目录权限，得排查。
4. **权限档位**：改造后的命令仍带 `--permission-mode` / `--approval-policy`，这是 0.2.2+
   的参数；本机 0.2.1-rc.5 的 headless 没有它们。真机上要么升 DSH，要么把这两个参数做成
   可选（尚未做，避免影响现有 0.2.2+ 用户）。
5. **额度**：插件 README 自己写了「WorkBuddy 已开始限制非官方客户端请求」，且每次调用真实
   扣你自己账号积分。7×24 自动 loop 会烧额度，先 `try` 跑一轮确认，再调低 cron 频率。
