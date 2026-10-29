# The Thistlewick kit

How to bring one of your GitHub repositories onto Code's Thistlewick lane. The setup app does it for you and asks before every change; the appendix gives each of its steps by hand.

## How the lane works

- **The integration branch** (`thistlewick` unless you rename it in Thistlewick's Settings › Code › GitHub & setup; an account connected earlier keeps `workbench`) is the lane's: sessions open pull requests into it, and the app merges them there with your passkey. It is never your default branch. You merge it into your own branches whenever you like.
- **`.thistlewick/` on the integration branch** holds what a launched session follows: `launch.md` (the launch core, kept exactly as the kit holds it: the app checks it is that file), `relay.md` (how it reports to the app), `price.md` (a price check, kept exactly as the kit holds it: the app checks it is that file), `steps.md` (the launch ticks), `agents/*.md` (the roles a launch can spawn: `planner`, `implementer`, `security-reviewer`, `validity-reviewer`, `simplicity-reviewer` and `ui-reviewer`) and `authors.json`. A session reads them at the integration branch's tip, which must be the commit your passkey approved. `steps.md` and the agents are yours to change, by a pull request with your review: a role is a `.md` file named with a lower-case letter, then up to 39 lower-case letters, digits and hyphens, at most 64 KB (a larger one is left out), and the folder holds at most 20.
- **The scheduled task runs on your default branch,** so your own `.claude/` and `CLAUDE.md` load first, as always.
- **Your session bot** pushes only `thistlewick-issue-<n>` (a launch's branch) and `claude/**` (your ordinary cloud sessions). A ruleset holds it off every other branch and every tag.
- **Code Owners review:** a pull request into the integration branch that changes `.thistlewick/` (or an earlier kit's `.workbench`), `.github/CODEOWNERS` or a session's boot files (`CLAUDE.md`, `CLAUDE.local.md`, `.claude/`, `.mcp.json`, at any depth) needs your review on GitHub, whoever opens it.

## The setup app

A small text app for macOS (Apple silicon), Windows (x64) and Linux (x64), downloaded from Settings › Code › GitHub & setup. It runs in a terminal window, signs you and your bot in to GitHub for that run only, connects claude.ai's cloud sessions to your bot, and sets up each repository you pick; it also changes a scheduled task's model and effort. The app itself talks only to GitHub, and downloads only from GitHub (gh) and claude.ai (Claude Code's installer), each when you agree; Claude Code, which it starts for `/web-setup` and for `/schedule`, talks to claude.ai. Nothing is sent to Thistlewick. Run it again whenever you like: after renaming the integration branch, or to take a newer kit.

## What the bot costs you

- **A second GitHub account,** which you make yourself: GitHub's terms require a human to create each account. It needs its own email address. On a provider with plus addressing, such as Gmail, a plus address of your own works, for example `name+bot@gmail.com` (tested with Gmail; only some providers support it); otherwise use an alias or another address you control. Never a disposable-mail service: GitHub sends the account's sign-in and recovery mail there. Give it two-factor authentication and a passkey, and turn its notifications off (Settings › Notifications), since every repository it joins would mail it.
- **Claude Code once,** for `/web-setup` as the bot; the setup app offers to install it. On a claude.ai Team or Enterprise plan, your organization's Owner turns on Quick setup first.
- A paid GitHub plan for private repositories; public repositories work on any plan.
- A paid claude.ai plan, for scheduled tasks.
- About 20 minutes once, and 10 per repository.

**Every claude.ai cloud session you start then acts as the bot,** not only launches. A claude.ai cloud session pushes, comments and opens pull requests as whichever GitHub account is connected to your claude.ai account, and there is one connection per account. That is why the bot exists: connected as the bot, a session holds only the bot's access (write, no `workflow` scope, and the bot ruleset's branches), not your own admin rights.

## Before you start (once)

1. **Make the bot,** as above.
2. **In Thistlewick's Settings › Code › GitHub & setup,** connect GitHub (the App on your own personal account, **Only select repositories**), add your first passkey within 15 minutes, and save your session bot.

## Run the setup app

### Download and check it

In Settings › Code › GitHub & setup, under **Thistlewick Setup**, download it for your computer. Settings shows each download's SHA-256 and the release it comes from. Before opening it:

- **macOS** (`assistant-setup-macos-arm64.zip`): Safari unpacks it to `Thistlewick Setup.app` (and may move the zip to the Bin: take it back to check its SHA-256); otherwise, double-click the zip. To check it (optional), in Terminal, in that folder:

  ```sh
  codesign -dv --verbose=2 "Thistlewick Setup.app"
  spctl -a -vv "Thistlewick Setup.app"
  ```

  `codesign` must show `Authority=Developer ID Application: … (BMXVW9JNQ9)` and `TeamIdentifier=BMXVW9JNQ9`, and `spctl` must show `source=Notarized Developer ID`.

- **Windows** (`assistant-setup-windows-x64.exe`): right-click it › **Properties** › **Digital Signatures**. The signer must be `__WINDOWS_PUBLISHER__`, with a timestamp. A tab that is missing means it is unsigned: don't run it.
- **The SHA-256** of the file you downloaded (the zip, the `.exe` or the `.tar.gz`) must match the one Settings shows: `shasum -a 256 <file>` on macOS, `sha256sum <file>` on Linux, `Get-FileHash <file>` in PowerShell. It must also match `SHA256SUMS.txt` on the kit repository's release that Settings names, on GitHub, reached by typing the kit repository's name rather than by a link. Its releases can't be changed once published.

### Open it

- **macOS:** double-click **Thistlewick Setup**. The first time, macOS asks whether to open an app downloaded from the internet: choose **Open**. The wizard opens in Terminal. If Terminal doesn't open, a dialog gives the command to run in Terminal instead, from the folder that holds Thistlewick Setup. Delete the app when you're done.
- **Windows:** double-click the `.exe`. SmartScreen may warn while the signing certificate is new and has no reputation yet: **More info** names the publisher; choose **Run anyway** only if it is `__WINDOWS_PUBLISHER__`.
- **Linux:** in a terminal, `tar -xzf assistant-setup-linux-x64.tar.gz`, then `./assistant-setup`.

Run it from an ordinary terminal session, not one with unusual environment variables set. With no terminal it stops before reading anything (the macOS app opens Terminal itself).

### What it does

In this order, one step to a screen, saying what it found at each step. Questions that change something take a letter then Enter, and Enter alone means No.

0. **The menu.** It asks `What would you like to do?`: **Set up a repository**, the steps below, or **Change a scheduled task's model and effort** ([below](#change-a-scheduled-tasks-model-and-effort)). An app that opens straight on the setup code predates the menu: download it again from Settings once a newer one is there.
1. **The setup code.** Paste the setup code from Settings › Code › GitHub & setup (**Copy**). It starts `thistlewick.`; an app downloaded before setup-v5 reads only older `asetup1.` codes, so if yours says it isn't a setup code, download the app again from Settings. It holds your GitHub id, your bot's, your App installation's, your integration branch's name and the relay host, nothing secret; a code copied before it held the relay host is refused the same way, so copy it again. The app shows the integration branch back when you choose a repository, and the relay host at the review.
2. **Tools.** It finds Claude Code, or offers to install it with Claude Code's official installer from claude.ai (no admin rights). It finds the GitHub CLI (`gh`) 2.40 or later, or offers to download gh for this run only, checked against the SHA-256 the app holds and deleted at the end. Your own `gh` and its sign-ins are never touched: the app uses a copy, with its own empty settings.
3. **Sign in as your bot.** Open a private window, sign in to GitHub there as the bot, go to `https://github.com/login/device` and enter the code the app shows. It checks the account is the bot the setup code names, with `repo` and none of `workflow`, `admin:*` or `delete_repo`. If it isn't, that sign-in is removed from this computer and the app offers to try it again, up to 3 times.
4. **Connect the cloud as your bot.** The app first warns that this makes your bot the GitHub author of all your claude.ai cloud sessions, including those you start outside Thistlewick; `y` then Enter goes on, Enter alone or `n` stops setup, and any other answer is asked again. Claude Code then starts in the app's own empty folder, signed in to GitHub as the bot. If it asks whether to trust the folder, choose **Yes**. If it asks, type `/login` and sign in with your claude.ai account. Type `/web-setup` and choose **Replace connection**; it warns there is no `workflow` scope, which is intended. Check it says it is connected as your bot, type `/exit`, and confirm in the app that it did. If Claude Code stops with an error, the app offers to open it again.
5. **Sign in as you.** Your browser opens `https://github.com/login/device`; enter the code the app shows, signed in as yourself. It checks the account is the setup code's owner, a personal account, with `repo`, `workflow` and `read:user`, and offers a retry as in step 3.
6. **Which repository?** It lists your own repositories that aren't archived. Type part of a name or URL to filter the list, choose with the arrow keys and press Enter (in a terminal that can't take keys one at a time, type a number).
7. **The repository.** It reads everything first: the repository, its secrets, the audit and what is set up already (appendix, steps 2 to 4), and stops there, before any change, on anything it refuses, then goes back to step 6. A repository with no commits yet needs one: once the secrets and environment checks pass, the app offers to add a first commit, a `README.md` on the repository's default branch, and shows the file, message and branch first. It never replaces a file: if someone committed meanwhile, it writes nothing and carries on. Once it has made that commit, a problem found later in the rules ends the run instead of going back to step 6, since something was written.
8. **Checks.** Choose the checks D2 should require. Checks D2 already requires stay ticked and can't be removed (setup stops instead if one can't be read, or comes from anything but GitHub Actions). Checks GitHub Actions ran on the default branch's latest commit are suggested, unticked: add only checks that run on pull requests into the integration branch, or merges wait for them. **A** adds names by hand. With none, the app asks you to confirm; then green means no failed or pending GitHub Actions run.
9. **Review.** A summary of the changes, with the relay host your `relay.md` will post to (check it matches the host your claude.ai environment's relay token is bound to) and any warnings (the integration branch may hold commits no one reviewed, a ruleset of ours that differs from the kit's is replaced in place, a ruleset with an earlier kit's `workbench-` name is renamed, a setup pull request waiting); **D** shows the exact list, and Esc goes back to the checks. It asks once, `Apply these changes? [y/N]`. A step already done is skipped. If nothing is left, it says the repository is already configured, asks nothing and goes on to the check.
10. **The writes,** in the appendix's order, a line and a count for each: the bot ruleset in its holding form, the integration branch, D3, D1, the files (or a pull request for you to merge, once D2 exists; an earlier kit's `.workbench/` moves to `.thistlewick/` in the same commit, your `steps.md` and agents unchanged; any kit role missing from `agents/` is added), D2, the tag ruleset, the settings, then the invitation, which it accepts as the bot.
11. **The Code App.** Your browser opens your App installation's page: **Only select repositories**, add the repository, **Save**, then press Enter. It adds the App to D1's bypass list and reads it back; if it isn't saved yet, press Enter again (up to 3 tries). Then it leaves the integration branch out of the bot ruleset.
12. **Check.** It reads every item again from GitHub and marks each verified, failed, or not verifiable from here (which repositories your App installation selects), then lists what is left, and points to Settings › Routines (Thistlewick's Settings › Code › Repositories & scheduled tasks) as where to finish connecting Claude ([the claude.ai side](#the-claudeai-side)).
13. **Set up another repository?** **R** goes back to step 6, without signing in again; Enter finishes. At the end it deletes the run's folder, its sign-ins and any download.

Press Ctrl-C, or close the window, to stop at any time (while Claude Code runs, Ctrl-C is Claude Code's). A stop says whether anything was changed; run it again and it picks up where it stopped.

### Change a scheduled task's model and effort

Thistlewick can't change a scheduled task's model or effort (claude.ai's fire API takes only the text), so this option has Claude Code's `/schedule` do it, on your own claude.ai sign-in. It needs no setup code and no GitHub sign-in. It finds Claude Code, or offers to install it as in step 2, then shows the request it sends and the steps: if Claude Code asks, type `/login` and sign in with your claude.ai account; pick the scheduled task, then its model and effort; check the change and say yes; type `/exit` to come back. Claude Code starts in an empty folder of the run's, with no GitHub sign-in and no tokens, with this request:

```text
/schedule Update one of my existing scheduled tasks. List them and ask me which one, then which model and effort level it should use. Set only job_config.ccr.session_context.model and job_config.ccr.session_context.effort_level. Show me the change and wait for my yes before saving. Change nothing else: not its prompt, schedule, repositories, environment, connectors, or its API trigger and token. Do not create, run or delete any task.
```

Claude Code lists your scheduled tasks and asks which one, then which model and effort, shows the change and waits for your yes. Nothing else changes: keep the API trigger and its token as they are, since a new token would stop the scheduled task you added in Thistlewick. After `/exit` the app goes back to the menu, with a warning if Claude Code stopped with an error. It never calls Thistlewick, stores nothing and changes no repository. Ctrl-C quits and deletes the run's folder, as in setup.

### What it can't do

- Make your bot's account (GitHub's terms).
- Set up your claude.ai environment or scheduled task, or Add scheduled task in Thistlewick: they have no API it can use. The guide in Settings › Code › Repositories & scheduled tasks takes you through them.
- See which repositories your App installation selects: a `gh` token can't read it, so its check says so. Check it on the installation's page.
- Run with its output redirected: it needs a terminal for both what you type and what it shows.

## The claude.ai side

1. **A claude.ai cloud environment** for your scheduled tasks: the relay host that Settings › Code › Relay tokens shows, in its allowed domains, and a relay token from Settings › Code › Relay tokens as a Network secret bound to that host only, pasted exactly as the app shows it once; claude.ai adds `Bearer` itself. One environment and its relay token serve every repository's routine. The token never enters a session: the proxy adds it.
2. **A scheduled task** per repository at https://claude.ai/code/routines › **New task** (from claude.ai/code: **Scheduled** › **New task**), as the guide under the repository in Thistlewick's Settings › Code › Repositories & scheduled tasks says (it is open while the repository has no routine): the repository, starting from its default branch (never a `claude/` or `thistlewick-issue-` branch), your cloud environment, a model of your choice (the coordinator's; the setup app can [change it and its effort](#change-a-scheduled-tasks-model-and-effort) later), and the prompt the guide shows, filled for your integration branch (**Copy**). Check the pasted prompt holds its `git fetch` and `git rev-parse` commands: they are the routine's check that a launch is at the integration branch's tip. Add an **API trigger**. Nothing about the routine goes into GitHub.
3. **Add scheduled task** in Thistlewick's Settings › Code › Repositories & scheduled tasks, under the repository, with a name, the trigger's fire URL and its token, and your passkey. The app fires the routine itself when you launch, and never shows the token again. If the repository has several routines, **Make default** on the one a launch should preselect. Note the token's renewal date.

## Check in the app

The repository shows in Code's sidebar, and its card in Thistlewick's Settings › Code › Repositories & scheduled tasks shows its checks verified. Create a throwaway issue, launch a Quick fix with your passkey, and check `started` arrives on the run page; once the bot's pull request into `<integration>` is green, merge it from the app.

## Appendix: what the setup app does, and by hand

Each step says what the app does, then how to do it by hand. By hand you need `gh` 2.40 or later signed in as you, with the `workflow` and `read:user` scopes (`gh auth login -h github.com`, then `gh auth refresh -h github.com -s workflow,read:user`), and `git` for the audit. Use your own values for `<owner>/<name>`, `<you>`, `<bot>`, `<default>` and `<integration>`.

### 1. Your accounts

The app signs you and your bot in with `gh`, each into its own throwaway folder made for the run and deleted at the end, never into your own `gh` or the system keychain. It checks you: the setup code's owner, a personal account, with `repo`, `workflow` and `read:user`; and your bot: the setup code's bot, with `repo` and none of `workflow`, `admin:*` or `delete_repo`. It then runs Claude Code with the bot's folder for `/web-setup`.

By hand, for `/web-setup` as the bot without signing the bot in to your own `gh`:

```sh
export GH_CONFIG_DIR="$(mktemp -d)"
GH_BROWSER=echo gh auth login -h github.com -p ssh --skip-ssh-key --web --insecure-storage
claude    # /web-setup, Replace connection, then /exit
rm -rf "$GH_CONFIG_DIR"; unset GH_CONFIG_DIR
```

Paste the one-time code `gh` shows into `https://github.com/login/device` in a private window signed in as the bot; `GH_BROWSER=echo` keeps `gh` from opening your default browser, which is signed in as you.

The `ssh` protocol keeps `gh` from giving the bot `workflow`, which it must not have, and from setting up git credentials; `--insecure-storage` keeps the token in that folder, not the keychain.

### 2. The repository

The app refuses a repository that isn't on your own personal account, an archived one, a private one on a free or unknown plan, an integration branch named as the default branch, an existing integration branch with commits `<default>` lacks, and a bot that is already a collaborator with a role other than write.

### 3. Secrets

The app stops on any Actions or Dependabot repository secret, on any environment with secrets that a bot branch could deploy from, and on an earlier kit's `routine-fire` environment with secrets ([Coming from an earlier kit](#coming-from-an-earlier-kit)). By hand: Settings › Secrets and variables › Actions and › Dependabot hold no repository secrets (move each into an environment, or delete it); every environment with secrets lists only literal branch names under **Deployment branches and tags** (no patterns, tags or protected-branches rule, and nothing under `claude/` or `thistlewick-issue-`); and no `routine-fire` environment is left from an earlier kit.

### 4. The audit

The app reads every workflow, on every branch and tag, over GitHub's API, and lists each line with `workflow_dispatch`, `repository_dispatch`, `pull_request_target`, `workflow_run`, `id-token: write` or `write-all`. On a public repository it stops on `pull_request_target` and `workflow_run`, and on a workflow file it can't read. With more than 1,000 branches and tags, or more workflow files than it can list, it stops and asks you to do the audit by hand:

```sh
git clone --bare https://github.com/<owner>/<name>.git audit.git
git -C audit.git for-each-ref --format='%(refname)' refs/heads refs/tags |
  while IFS= read -r ref; do
    git -C audit.git grep -n -E 'workflow_dispatch|repository_dispatch|pull_request_target|workflow_run|id-token: *write|write-all' "$ref" -- .github/workflows
  done
```

The App can dispatch any `workflow_dispatch` workflow: each one guards its jobs on the actor (`if: github.triggering_actor == '<you>'`) or is harmless when the App starts it (no secrets, no deploy, no writes).

The app also names each branch or tag that still holds an earlier kit's `.github/workflows/workbench-launch.yml` ([Coming from an earlier kit](#coming-from-an-earlier-kit)).

### 5. The bot ruleset, in its holding form

The app creates it first, leaving out only `thistlewick-issue-*` and `claude/**`; the integration branch is left out last (step 12). By hand: Settings › Rules › Rulesets › **New branch ruleset**, from `rulesets/bot.json`: `thistlewick-bot`, **Active**, all branches, excluding `refs/heads/thistlewick-issue-*` and `refs/heads/claude/**`; **Restrict creations**, **Restrict updates**, **Restrict deletions**; bypass **Repository admin**, **Always**.

It holds everyone without a bypass, GitHub Actions' own token and Dependabot or Renovate branches included: a workflow or tool that pushes a branch or a tag needs another way. To let a collaborator of yours through, add them to `thistlewick-bot`'s bypass list by hand. The app never adds one, and a later run replaces the ruleset with the kit's form, which drops them: add them again after each run.

### 6. The integration branch, D3 and D1

The app creates `<integration>` from `<default>`, then D3 and D1. On a rename, it creates the new branch before it moves the rulesets to it. By hand, create the branch, then from `rulesets/`:

| Ruleset          | Target                     | Rules                                         | Bypass                                            |
| ---------------- | -------------------------- | --------------------------------------------- | ------------------------------------------------- |
| `thistlewick-d3` | `refs/heads/<integration>` | Restrict creations and deletions              | Repository admin, Always                          |
| `thistlewick-d1` | `refs/heads/<integration>` | Restrict updates (no "allow fetch and merge") | Repository admin, Always; the Code App at step 11 |

### 7. The files

The app commits them to `<integration>` as you; once D2 exists, it opens a pull request for you to merge instead. It refuses a CODEOWNERS at the root or in `docs/`, a symlink, submodule or file where `.thistlewick/`, its `agents/` or `.github/` goes, a symlink, submodule or folder where `launch.md`, `relay.md`, `price.md`, `authors.json` or `.github/CODEOWNERS` goes, and a symlink where `steps.md` or a kit role goes. By hand, on `<integration>`:

- `files/dot-thistlewick/` becomes `.thistlewick/`. Copy `launch.md` and `price.md` as they are. In `relay.md` replace `__INGEST_HOST__` with the relay host Settings › Code › Relay tokens shows. In `authors.json` put your id as `owner_id`, `342955731` (the App's bot) as `app_bot_id`, your bot's id and login as `session_bot_id` and `session_bot_login`, ids as numbers, and `<integration>` as `integration`.
- If `<integration>` still has an earlier kit's `.workbench/`, move it in the same commit, `git mv .workbench .thistlewick`, then copy and fill the kit's files over it as above; your `steps.md` and agents stay as they are, and any kit role missing from `agents/` is copied in. The app stops instead when both folders exist, when `.workbench` isn't a folder (a file, symlink or submodule), or when `.workbench/` holds anything but the kit's files, `steps.md` and `.md` roles in `agents/`.
- `files/dot-github/CODEOWNERS`'s lines go last in `.github/CODEOWNERS` (created if absent), with `__OWNER_LOGIN__` as your login. If your CODEOWNERS is at the root or in `docs/`, move it to `.github/` first.

`steps.md` is added only when absent, and each kit role whose file is missing from `agents/`; an existing `steps.md` or role is never changed, and a kit role you deleted comes back on the next run. The app stops before any write when the roles it adds would take `agents/` past 20, the most a launch reads. A renamed integration branch starts from `<default>`, so edits you made to them on the old one don't carry over: bring them across by a pull request.

### 8. D2 and the tag ruleset

The app creates both, D2 with the checks you named. By hand, from `rulesets/`:

| Ruleset            | Target                     | Rules                                                                                                                                                                                                                        | Bypass                                                  |
| ------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `thistlewick-d2`   | `refs/heads/<integration>` | Require a pull request: 0 approvals, dismiss stale approvals, require review from Code Owners, approval of the most recent push off, merge and squash allowed; your required checks, from GitHub Actions; block force pushes | Repository admin, For pull requests only; never the App |
| `thistlewick-tags` | All tags                   | Restrict creations, updates and deletions                                                                                                                                                                                    | Repository admin, Always                                |

Approval of the most recent push stays off, since with 0 approvals GitHub refuses the App's merge of every session's pull request: your approval at the head still gates `.thistlewick/`, CODEOWNERS and the boot files in the app, and Code Owners review gates them on GitHub; leaving it off only stops GitHub requiring a non-pusher's approval on every pull request.

### 9. Settings

The app allows merge commits (the app merges with one), makes Actions' default token read-only and unable to approve pull requests, and on a public repository requires approval for every outside contributor's fork pull request runs. By hand: Settings › General › **Allow merge commits**; Settings › Actions › General › **Workflow permissions** and **Approval for running fork pull request workflows from contributors**.

### 10. The bot and the scheduled task

The app invites your bot with write and accepts the invitation as the bot, with the bot's own sign-in; if that fails, it says so, and you accept by hand. It leaves the scheduled task to you: its last screen points to Settings › Routines (Settings › Code › Repositories & scheduled tasks), whose guide gives the task's settings and prompt. By hand:

1. Settings › Collaborators › **Add people** › `<bot>`, with write. In a private window signed in as the bot, accept at `https://github.com/<owner>/<name>/invitations`.
2. The scheduled task and Add scheduled task: [the claude.ai side](#the-claudeai-side), steps 2 and 3. Its saved prompt is the one the guide shows under the repository, filled for `<integration>`.

### 11. The App

The app opens your installation's page, waits while you add the repository to it, then adds the App to D1's bypass list and reads it back. By hand: `https://github.com/settings/installations/<installation id>` › **Only select repositories** › add `<owner>/<name>` › **Save**; then `thistlewick-d1` › **Add bypass** › `thistlewick-for-github`, **Always**.

### 12. The bot ruleset's last exclusion

The app adds `refs/heads/<integration>` to `thistlewick-bot`'s exclusions, now that D1 and D3 hold the branch. By hand, edit `thistlewick-bot` and add it under **Exclude by pattern**.

## Coming from an earlier kit

- **`.workbench/` and `workbench-*` rulesets:** the kit's folder is now `.thistlewick/` and its rulesets `thistlewick-*`, and the app refuses a launch, a price check or a test on a repository whose integration branch still has anything at `.workbench`, saying its kit needs updating. Download the setup app again from Settings and run it on each repository: it moves `.workbench/` to `.thistlewick/`, keeping your `steps.md` and agents, and renames each `workbench-*` ruleset in place. Then replace each scheduled task's prompt for that repository with the one Settings › Code › Repositories & scheduled tasks shows (an old prompt stops at its first check), and merge the setup pull request it opens. If a run stops after writing the files it may not show that reminder again: replace the prompt anyway. Where a repository has both a `workbench-*` and a `thistlewick-*` ruleset of one kind, the app uses the new one and leaves the old: compare the old one's required checks with the new one's before you delete it.
- **`routine-fire`:** if the routine's trigger token was ever stored in GitHub (an earlier kit kept it in a `routine-fire` environment), **regenerate** it in the trigger's settings on claude.ai: regenerating revokes the old copy. Paste the new one into Settings › Code › Repositories & scheduled tasks, then delete `routine-fire` in Settings › Environments.
- **`workbench-issue-` branches:** a launch now works on `thistlewick-issue-<n>`, and the app no longer reads a pull request from `workbench-issue-<n>` as a session's. Before your next launch, run the setup app (`setup-v5` or later) again on each repository and merge the setup pull request it opens: it moves the bot ruleset's exclusion and `.workbench/` to the new name.
- **Launches after `setup-v5`:** a launch now takes the issue's newest 100 comments by any author, and reads the integration branch's name from `authors.json`, so `.workbench/launch.md` is the same file in every repository and the app checks it is this kit's. Until you run the setup app (`setup-v5` or later) again on each repository and merge the setup pull request it opens, a launch there says "This repository's kit needs updating to launch a session." On the app's own repository, don't launch between merging this change into the integration branch and deploying the app: the deployed app still sends the old payload, which the new launch core refuses after the run is claimed.
- **Testing a scheduled task:** `.workbench/launch.md` now recognises a scheduled task test (its step 9), so the app pins a new launch.md. Until you run the setup app again on each repository and merge the setup pull request it opens, a launch there says "This repository's kit needs updating to launch a session." and a test says "This repository's kit needs updating to test a scheduled task." On the app's own repository, don't launch between merging this change into the integration branch and deploying the app.
- **New kit roles:** running the setup app again on a repository already set up opens a setup pull request adding the kit's newer roles, such as `ui-reviewer`; merge it.
- **`workbench-launch.yml`:** delete `.github/workflows/workbench-launch.yml` from each branch or tag the app names, on `<integration>` by a pull request you merge: the app fires your routine itself now.

## Known limits

- **On a public repository** anyone can open an issue or comment on one, and a launch takes the issue and its newest 100 comments, by any author, into the session's task: read them on the issue page before you approve, since your passkey approves exactly those. The bot can approve strangers' fork runs, which get no secrets.
- **A stolen App key** meets Code Owners review only on `.thistlewick/`, CODEOWNERS and the boot files: it could still merge other pull requests into your integration branch with green checks.
- **The setup app takes the relay host from the pasted code,** and fills your `relay.md` with it: compare the host it shows at the review with the one your environment's relay token is bound to, since a code from someone else could name another.
- **The download links and their SHA-256 come from the app,** so a compromised app could show others: compare them with `SHA256SUMS.txt` on the kit repository's release and with the signature's publisher.
- **During a run, both sign-ins' tokens are on disk** in plain text, in the run's own folder, which only your user can read (on Windows it sits in your profile, relying on its permissions). They are deleted at the end, on Ctrl-C and when the window closes; a hard kill leaves them until the app's next run sweeps them.
- **Your own token stays valid on GitHub** after the run. Revoking it is optional: Settings › Applications › Authorized OAuth Apps › **GitHub CLI** › **Revoke** revokes every `gh` token of yours, on every computer, so your own `gh` signs in again. Never revoke the bot's: `/web-setup` connected claude.ai with it.
- **The Claude Code installer comes from claude.ai** over HTTPS; the app doesn't check it further.
- **The app ignores `NODE_OPTIONS`,** but some environment variables still reach it (`OPENSSL_CONF`, `NODE_EXTRA_CA_CERTS`, `NODE_V8_COVERAGE`, and `LD_PRELOAD` on Linux); on macOS the hardened runtime blocks library injection.
- **Repository secrets added after setup** reach push-triggered workflows on bot branches. Run the app again after adding one.
- **Files `CLAUDE.md` imports, and scripts that `.claude/settings.json` hooks call,** aren't code-owned unless they sit under the listed paths: keep them there, or add their paths to CODEOWNERS.
- **Renaming your GitHub login** leaves CODEOWNERS naming no one until you run the app again.
- **The bot's claude.ai connection's own scopes** aren't visible to the app.
- **No deploy** should run from a push to your branches except from an environment limited to the branch it deploys, and a cloud deploy's credential trust should be pinned to a branch.
