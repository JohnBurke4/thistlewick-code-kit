# Relay

How a launched session sends its short structured updates to the app's run page: one `curl` POST per event to the relay ingest's MCP endpoint, by the script below. Only for a session started by the launch routine, after `.thistlewick/launch.md`'s step 1, `.thistlewick/price.md`'s step 1, `.thistlewick/issues.md`'s step 1, or the payload check of `launch.md`'s step 9 (a scheduled task test), passed. Nothing goes on GitHub: never post an event as a comment, by `gh api` or any other way.

The relay token is not in this session and never is: the cloud environment's Network secret, bound to the ingest host alone, adds it on the way out. Never add an `Authorization` header, and never look for the token.

## The event

Write the event with your Write tool to `/tmp/assistant-launch/event.json`, as a JSON object of `event`, `summary`, and `link` or `pr` where the table allows them, and nothing else:

- `event` is one of the events below;
- `link` only where the table allows it; `pr` as a number, only where the table allows it;
- `summary` as the rules below say.

The run's id and key are not in it: the script adds them from `/tmp/assistant-launch/run.json`, which `launch.md`'s step 1 (or, for a price check, `price.md`'s step 1, for a breakdown, `issues.md`'s step 1, and for a scheduled task test, `launch.md`'s step 9) wrote once the payload passed. They never go into a command, a file you write, a summary or the chat. Without `run.json`, send nothing.

## Events

| Event        | When                                                                   | `link`                     | `pr`                                           |
| ------------ | ---------------------------------------------------------------------- | -------------------------- | ---------------------------------------------- |
| `started`    | The launch checks passed, before any work; summary: see Coordinator    | The session link           | No                                             |
| `question`   | You are waiting for the owner's answer in the session                  | Optional, the session link | No                                             |
| `answered`   | Right after the owner answers your `question` in the session           | No                         | No                                             |
| `plan_ready` | A plan is ready and you are waiting for the owner's approval           | Optional, the session link | No                                             |
| `artifact`   | After you publish an artifact (the plan's, before `plan_ready`)        | The published artifact     | No                                             |
| `stages`     | Right after the owner approves the plan (no plan: before first change) | No                         | No                                             |
| `stage`      | When a stage starts                                                    | No                         | No                                             |
| `stage_done` | When a stage is finished                                               | No                         | No                                             |
| `done`       | The work is finished                                                   | Optional, the session link | Your PR into the integration branch, once open |
| `failed`     | The launch checks failed, or the work stopped and can't go on          | Optional, the session link | Your PR into the integration branch, if open   |

## Rules

- `link` is only the session link, or `https://claude.ai/artifact/<id>` or `https://claude.ai/code/artifact/<uuid>` of an artifact you made in this session, shared or private. Never any other URL.
- `pr` is only the number of the PR you opened into the integration branch from `thistlewick-issue-<issue>`.
- The summary is plain text, 1 to 1,000 characters (a breakdown's `done` excepted, below), in your own words: no Markdown, HTML or URLs, no `<`, no secrets, tokens or environment values, and no quoted issue or comment text. Tokens here are credentials; the Usage block's token counts are allowed. The one exception to environment values is the Coordinator line's model name and effort word, nothing else.
- For `stages`, the summary is the stages in order, one per line: 2 to 10 lines, each 1 to 60 characters with something visible. For `stage`, it starts with the stage's number in that list and `. `, then what the stage is doing. Send `stages` again if the stages change (it clears the marks), then `stage_done` for each stage already finished and `stage` for the one in progress.
- For `stage_done`, the summary has the `stage` grammar: the stage's number in that list and `. `, then what was finished.
- For `answered`, the summary says only that the answer arrived, in your own words; never the answer itself or any part of it.
- For a launched run's `started`, the summary is exactly the line the Coordinator script prints, never written by hand; on `FAIL`, a sentence in your own words. A price check's, a breakdown's and a scheduled task test's `started` summaries are the fixed ones their scripts write.
- For a price check's `done`, the summary is the estimate as one line of JSON, which `price.md`'s answer check writes.
- For a breakdown's `done`, the summary is the answer as one line of JSON, up to 8,000 characters, which `issues.md`'s answer check writes. Its `quote`s are whole lines of the request's notes, which that answer may carry: the own-words rule above is about issue and comment text.
- A launched run's `done` or `failed` summary ends with the Usage block (see Usage).

Examples of `event.json`:

```json
{ "event": "answered", "summary": "The answer arrived; carrying on with the work." }
```

```json
{ "event": "stages", "summary": "Plan the change\nWrite the code\nReview the diff\nOpen the PR" }
```

```json
{ "event": "stage", "summary": "2. Writing the parser and its tests." }
```

```json
{ "event": "stage_done", "summary": "2. Parser and its tests committed." }
```

```json
{
  "event": "done",
  "pr": 42,
  "summary": "The parser and its tests are in the PR into the integration branch."
}
```

The session link, for `started`, comes from `CLAUDE_CODE_REMOTE_SESSION_ID` (its `cse_` prefix becomes `session_`). Run this verbatim and use the URL it prints; on `FAIL`, leave `link` out:

```sh
node -e '
const s = (process.env.CLAUDE_CODE_REMOTE_SESSION_ID || "").replace(/^cse_/, "session_");
console.log(/^session_[0-9A-Za-z]{1,64}$/.test(s) ? "https://claude.ai/code/" + s : "FAIL");
'
```

## Send

Run this verbatim after each `event.json` you write. It builds one JSON-RPC call of the ingest's `relay` tool in a file readable by you alone, adds the run's id and key from `run.json`, posts the file with `curl --data @file`, deletes it, and prints one line: `Recorded.`, `Not recorded.`, or `Refused <field>`.

```sh
node -e '
const fs = require("fs"), cp = require("child_process");
const OUT = "/tmp/assistant-launch/";
const ENDPOINT = "https://__INGEST_HOST__/mcp";
const FIELDS = ["run_id", "run_key", "event", "link", "pr", "summary", "arguments"];
const say = (w) => { console.log(w); process.exit(0); };
let run, ev;
try {
  run = JSON.parse(fs.readFileSync(OUT + "run.json", "utf8"));
  ev = JSON.parse(fs.readFileSync(OUT + "event.json", "utf8"));
} catch { say("Not recorded."); }
if (ev === null || typeof ev !== "object" || Array.isArray(ev) || !Object.keys(ev).every((k) => ["event", "link", "pr", "summary"].includes(k))) say("Refused arguments");
const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "relay", arguments: { ...ev, run_id: run.run_id, run_key: run.run_key } } };
fs.writeFileSync(OUT + "relay-body.json", JSON.stringify(body), { mode: 0o600 });
let answer = "";
try {
  answer = cp.execFileSync("curl", ["-q", "-sS", "--max-time", "20", "-X", "POST", "-H", "content-type: application/json", "--data", "@" + OUT + "relay-body.json", ENDPOINT], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 65536 });
} catch { answer = ""; }
fs.rmSync(OUT + "relay-body.json", { force: true });
let a = null;
try { a = JSON.parse(answer); } catch {}
const res = a && typeof a === "object" && a.result && typeof a.result === "object" ? a.result : null;
const first = res && Array.isArray(res.content) ? res.content[0] : null;
const text = first && first.type === "text" && typeof first.text === "string" ? first.text : "";
if (res && res.isError !== true && text === "Recorded.") say("Recorded.");
const field = res && res.isError === true ? FIELDS.find((f) => text.startsWith(f + " ")) : undefined;
say(field ? "Refused " + field : "Not recorded.");
'
```

1. Count your events, resends included. Send at most 50, keeping the last of them for `done` or `failed`; after the 50th, send no more.
2. `Recorded.` means the event landed.
3. `Refused <field>` names a field (`run_id`, `run_key`, `event`, `link`, `pr`, `summary` or `arguments`) whose rule the event broke, and nothing was recorded. Write that event once more, corrected: leave `link` or `pr` out rather than invent one, and rewrite the summary in your own words. For a `done` or `failed` that carries the Usage block, rewrite only your own text and keep the block unchanged. If the resend is refused too, go on as in 4. `started` is the exception: it is never resent.
4. Anything else (`Not recorded.`, the host unreachable, a timeout): carry on with the work, silently. Never resend, since a resend can record an event twice, and never fall back to a GitHub comment or any other way of sending it. The one exception is `started`: `launch.md`'s step 4 (for a price check, `price.md`'s step 2, for a breakdown, `issues.md`'s step 2, and for a scheduled task test, `launch.md`'s step 9) stops the session unless it printed `Recorded.`.

## Coordinator

Run this verbatim right before you write a launched run's `started`; never on a price check, a breakdown or a scheduled task test, whose `started` summaries are fixed. It reads the model of the newest assistant message in this session's own transcript (never a subagent's) and the effort from `CLAUDE_EFFORT`, and prints one line, `Coordinator: <model>, <effort> effort.`, or `FAIL`. It reads nothing else, and prints `FAIL` if the file it would read is a symlink or not what it should be.

```sh
node -e '
const os = require("os"), fs = require("fs"), path = require("path");
const coordinator = () => {
  if (!fs.existsSync("/tmp/assistant-launch/checked.env")) return "FAIL";
  const id = process.env.CLAUDE_CODE_SESSION_ID || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return "FAIL";
  const effort = process.env.CLAUDE_EFFORT || "";
  if (!["low", "medium", "high", "xhigh", "max"].includes(effort)) return "FAIL";
  const at = (p) => { try { const s = fs.lstatSync(p); return s.isDirectory() ? "dir" : s.isFile() && s.size <= 67108864 ? "file" : "bad"; } catch (e) { return e && e.code === "ENOENT" ? "none" : "bad"; } };
  const root = path.join(os.homedir(), ".claude", "projects");
  if (at(root) !== "dir") return "FAIL";
  let model = "", when = -Infinity;
  for (const slug of fs.readdirSync(root).sort()) {
    const dir = path.join(root, slug), f = path.join(dir, id + ".jsonl");
    if (at(dir) !== "dir" || at(f) === "none") continue;
    if (at(f) !== "file") return "FAIL";
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      let r;
      try { r = JSON.parse(line); } catch { continue; }
      const m = r && r.type === "assistant" ? r.message : null;
      const t = r && typeof r.timestamp === "string" ? Date.parse(r.timestamp) : NaN;
      if (!m || typeof m !== "object" || typeof m.model !== "string" || m.model === "<synthetic>" || !(t >= when)) continue;
      model = m.model;
      when = t;
    }
  }
  const NAME = /^claude-(opus|sonnet|haiku|fable)(-[0-9]{1,2}){1,3}(-[0-9]{8})?$/;
  return NAME.test(model) ? "Coordinator: " + model + ", " + effort + " effort." : "FAIL";
};
let out = "FAIL";
try { out = coordinator(); } catch {}
console.log(out);
'
```

1. If it prints a line starting with `Coordinator: `, that line, unchanged, is the `started` summary.
2. On `FAIL`, write the summary in your own words instead, and say nothing about the model or effort.

## Usage

Run this verbatim right before you write a launched run's `done` or `failed`; never on a price check, a breakdown or a scheduled task test. It adds up the token counts in this session's own transcript and its subagents', and prints a block of at most five lines (the total, then one line per model, largest first) or `FAIL`. It reads nothing else, and prints `FAIL` if any file or folder it would read is a symlink or not what it should be.

```sh
node -e '
const os = require("os"), fs = require("fs"), path = require("path");
const usage = () => {
  if (!fs.existsSync("/tmp/assistant-launch/checked.env")) return "FAIL";
  const id = process.env.CLAUDE_CODE_SESSION_ID || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return "FAIL";
  const at = (p) => { try { const s = fs.lstatSync(p); return s.isDirectory() ? "dir" : s.isFile() && s.size <= 67108864 ? "file" : "bad"; } catch (e) { return e && e.code === "ENOENT" ? "none" : "bad"; } };
  const has = (p, want) => { const k = at(p); if (k !== "none" && k !== want) throw new Error(); return k === want; };
  const root = path.join(os.homedir(), ".claude", "projects");
  if (at(root) !== "dir") return "FAIL";
  const files = [];
  for (const slug of fs.readdirSync(root).sort()) {
    const dir = path.join(root, slug);
    if (at(dir) !== "dir") continue;
    if (has(path.join(dir, id + ".jsonl"), "file")) files.push(path.join(dir, id + ".jsonl"));
    const sub = path.join(dir, id, "subagents");
    if (!has(path.join(dir, id), "dir") || !has(sub, "dir")) continue;
    for (const n of fs.readdirSync(sub).sort()) if (/^agent-[A-Za-z0-9_-]{1,64}\.jsonl$/.test(n) && has(path.join(sub, n), "file")) files.push(path.join(sub, n));
  }
  const count = (v) => (v === undefined ? 0 : Number.isSafeInteger(v) && v >= 0 ? v : -1);
  const seen = new Map();
  for (const f of files) {
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      let r;
      try { r = JSON.parse(line); } catch { continue; }
      const m = r && r.type === "assistant" ? r.message : null;
      if (!m || typeof m !== "object" || typeof m.id !== "string" || m.model === "<synthetic>") continue;
      const u = m.usage;
      if (!u || typeof u !== "object" || Array.isArray(u)) continue;
      const c = [u.input_tokens, u.cache_creation_input_tokens, u.cache_read_input_tokens, u.output_tokens].map(count);
      if (!c.includes(-1)) seen.set(m.id, { model: m.model, c });
    }
  }
  if (seen.size === 0) return "FAIL";
  const NAME = /^claude-(opus|sonnet|haiku|fable)(-[0-9]{1,2}){1,3}(-[0-9]{8})?$/;
  const total = [0, 0, 0, 0], groups = new Map();
  for (const { model, c } of seen.values()) {
    const k = typeof model === "string" && NAME.test(model) ? model : "";
    const g = groups.get(k) || [0, 0, 0, 0];
    c.forEach((x, i) => { g[i] += x; total[i] += x; });
    groups.set(k, g);
  }
  const sum = (g) => g[0] + g[1] + g[2] + g[3];
  const named = [...groups].filter(([k]) => k !== "").sort((a, b) => sum(b[1]) - sum(a[1]) || (a[0] < b[0] ? -1 : 1));
  const rest = named.slice(3).map(([, g]) => g).concat(groups.has("") ? [groups.get("")] : []);
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const line = (g) => fmt(sum(g)) + " tokens: " + fmt(g[0]) + " input, " + fmt(g[1]) + " cache writes, " + fmt(g[2]) + " cache reads, " + fmt(g[3]) + " output.";
  const out = ["Used " + line(total)].concat(named.slice(0, 3).map(([k, g]) => k + ": " + line(g)));
  if (rest.length > 0) out.push("other models: " + line(rest.reduce((a, g) => a.map((x, i) => x + g[i]))));
  return out.join("\n");
};
let out = "FAIL";
try { out = usage(); } catch {}
console.log(out);
'
```

1. If it prints a block starting with `Used `, append the whole block, unchanged, as the summary's last lines, after your own text and a line feed.
2. If the summary would pass 1,000 characters, shorten your own text, never the block.
3. On `FAIL`, leave the block out and say nothing about it.
4. Never edit the block, and never write token counts by hand.
