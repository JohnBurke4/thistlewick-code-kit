# The Thistlewick kit

How to bring one of your GitHub repositories onto Code's Thistlewick lane. Every step is done on GitHub's and claude.ai's websites, and in Thistlewick's Settings › Code; nothing is installed on your computer. Do the steps under [Once](#once) a single time, then [each repository's steps](#each-repository) for every repository, in order.

## How the lane works

- **Every Claude session acts as you.** claude.ai connects to GitHub through the Claude GitHub App on your own account, so a cloud session pushes, comments and opens pull requests as you, launched or not. Nothing a session does on its own can merge into a gated branch: that takes your passkey. Without the gate, it can (see [Known limits](#known-limits)).
- **The integration branch** (`thistlewick` unless you rename it in Thistlewick's Settings › Code › GitHub & setup; an account connected earlier keeps `workbench`) is the lane's: sessions open pull requests into it, and you merge them, approving each with your passkey first where the gate is set. With the gate it can't be your default branch, since the gate needs two branches; without it, it may be. You merge it into your own branches whenever you like.
- **The passkey gate,** recommended, not required, and set per repository. Two rulesets, one on the integration branch and one on your default branch, each require a pull request, merge commits only, no force pushes, no deletion, and one check posted by the Thistlewick App: `thistlewick-gate/integration` on the integration branch, `thistlewick-gate/main` on the default branch. Neither has a bypass list, so they hold you and every session alike. The App posts the check, passing, on a pull request's head only when you approve that head with your passkey in Code › Pull requests; a later push needs a new approval. You then merge on GitHub (the app merges nothing). Without the gate, a session's green pull request reads "Checks passed into <branch>", and you review and merge it on GitHub: nothing waits for your passkey, and "Checks passed" means only that CI is green. A gate only partly set up (one ruleset of the two, say) stops every launch until you finish it or delete it.
- **`.thistlewick/` on the integration branch** holds what a launched session follows: `launch.md` (the launch core, kept exactly as the kit holds it: the app checks it is that file), `relay.md` (how it reports to the app), `price.md` (a price check, kept exactly as the kit holds it: the app checks it is that file), `issues.md` (a breakdown, Work's Break into issues, kept exactly as the kit holds it: the app checks it is that file), `steps.md` (the launch ticks), `agents/*.md` (the roles a launch can spawn: `planner`, `implementer`, `security-reviewer`, `validity-reviewer`, `simplicity-reviewer` and `ui-reviewer`) and `authors.json`. A session reads them at the integration branch's tip, which must be the commit your passkey approved when you launched it (the launch's passkey binds the integration branch's head, with or without the gate). `steps.md` and the agents are yours to change, by a pull request (approved with your passkey where the gate is set): a role is a `.md` file named with a lower-case letter, then up to 39 lower-case letters, digits and hyphens, at most 64 KB (a larger one is left out), and the folder holds at most 20.
- **The scheduled task runs on your default branch,** so your own `.claude/` and `CLAUDE.md` load first, as always.

## What it needs

- **For the passkey gate, a GitHub plan that enforces rulesets.** On a private repository the gate needs GitHub Pro, Team or Enterprise: GitHub Free doesn't enforce rulesets on private repositories, so its gates would hold nothing. A private repository on GitHub Free works without the gate. A public repository can have it on any plan.
- A paid claude.ai plan, for scheduled tasks.
- About 15 minutes once, and 10 per repository. The ruleset import is easier on a computer than on a phone.

## Once

Settings › Code › GitHub & setup lists these, ticking what it can check.

1. **Connect GitHub** in Thistlewick's Settings › Code › GitHub & setup: the Thistlewick App on your own personal account, **Only select repositories**. Choose no repository yet if you like: each is added at its own step 1.
2. **Add a passkey** there, within 15 minutes of connecting.
3. **Connect claude.ai through the Claude GitHub App,** from claude.ai, signed in to GitHub as you. Choose no repository yet: each is added at its own [step 4](#4-add-the-repository-to-the-claude-github-app), after its gates if you set them up. Never use `/web-setup`. Every Claude session then acts as you.
4. **Create a cloud environment** at claude.ai for your scheduled tasks: the relay host that Settings › Code › Relay tokens shows, in its allowed domains, and a relay token as a Network secret bound to that host only (step 5).
5. **Add the relay token:** create one in Settings › Code › Relay tokens and paste it into the environment exactly as the app shows it once; claude.ai adds `Bearer` itself. One environment and its relay token serve every repository's scheduled task. The token never enters a session: the proxy adds it.

## Each repository

Its card in Settings › Code › Repositories & scheduled tasks shows the checks the app can read, the kit to download (with the setup prompt as a fallback) and the two ruleset downloads, all named for that repository.

### 1. Add the repository to the Thistlewick App

On GitHub, Settings › Applications › Installed GitHub Apps › the Thistlewick App › **Configure** › **Only select repositories** › add the repository › **Save**. Its card appears in Thistlewick's Settings › Code › Repositories & scheduled tasks.

### 2. Create the integration branch

On the repository's page on GitHub, open the branch menu, type the integration branch's name (the card names it), and choose **Create branch … from** your default branch. Its line on the card turns to ✓ ("… exists") once it does. With the passkey gate it can't be your default branch: if the card says it is, choose another name in Settings › Code › GitHub & setup. Without the gate it can: the card then says "<branch> is also your default branch." and marks it – (recommended, not counted).

### 3. Import both gate rulesets (recommended)

Recommended, not required. With the passkey gate, nothing merges into the integration branch or your default branch until you approve its exact head with your passkey. Without it, a session acting as you can merge, push to or delete those branches itself (see [Known limits](#known-limits)). To go without it, skip this step: the card shows the gate as – (recommended, not counted). On a private repository the gate needs GitHub Pro, Team or Enterprise. If you start, import both: one alone stops every launch until you import the other or delete it.

Download both from the card: `<repository>-gate-integration.json` and `<repository>-gate-main.json`, each filled with your branch names and the Thistlewick App's id. For each, on GitHub: the repository's **Settings** › **Rules** › **Rulesets** › **New ruleset** › **Import a ruleset**, choose the file, then **Create**.

- Confirm **Bypass list: empty** on both. The app can't read a bypass list, so this is yours to check, now and whenever you edit a ruleset.
- **Your CI checks,** if you have any: add each under **Require status checks to pass** in the ruleset of the branch its pull requests go into, with **GitHub Actions** as its source, so no one else's status can pass it. Add only checks that run on those pull requests, or merges wait for them.
- Leave the gate's own check as it is: it names the Thistlewick App as its source.

The card shows "Rules verified on" both branches once both hold, or names the gate still missing and offers "or delete the gate rulesets to go without one".

### 4. Add the repository to the Claude GitHub App

Every Claude session can push, as you, to any repository the Claude GitHub App reaches. If you set up the gate, do this after step 3. On GitHub, Settings › Applications › Installed GitHub Apps › **Claude** › **Configure** › **Only select repositories** › add the repository › **Save**. The app can't check this.

### 5. Add the kit

Download the kit from the card: **Download the kit (.zip)** saves `thistlewick-kit.zip`, your `.thistlewick/` filled for your account. It holds no secret: never your relay token, only the relay host. Unzip it and add the `.thistlewick` folder at your repository's root, from your clone or on GitHub with **Add file** › **Upload files**, keeping your own `steps.md` and agents if you changed them. Without the gate, commit it to the integration branch (or upload it there); with the gate, put it on a new branch and open a pull request into the integration branch. To update an older kit, do the same: it replaces the old files. On a Mac, Finder hides folders whose names start with a dot: press Cmd+Shift+. to show them.

**No local clone?** Open "No local clone? Copy the setup prompt into a Claude session" on the card, copy the prompt and paste it into a new Claude session on the repository (claude.ai/code, the repository, your default branch). The prompt checks the integration branch, fetches the kit from the public kit repository at the commit the app pins, and copies `.thistlewick/` from it byte for byte. It then fills `relay.md`'s relay host and `authors.json` for your account, and opens a pull request into the integration branch that changes nothing outside `.thistlewick/`.

**By hand instead:** on a new branch from the integration branch, copy the kit repository's `files/dot-thistlewick/` at the commit the card's README link names to `.thistlewick/`, byte for byte, keeping your own `steps.md` and agents if you have them. In `relay.md`, replace `__INGEST_HOST__` with the relay host the card's prompt names. Write `authors.json` exactly as the card's prompt shows it: your GitHub id as `owner_id`, the Thistlewick App's bot as `app_bot_id` (both numbers), and the integration branch as `integration`. Open a pull request into the integration branch.

### 6. Merge the kit's pull request

If the kit came by a pull request (the setup prompt opens one, and a gated integration branch takes nothing else):

- With the gate, open it in Thistlewick's Code › Pull requests, check its head is the commit you reviewed, and approve it with your passkey. The Thistlewick App posts the gate's check on that head; once your other checks are green, merge it on GitHub with a merge commit.
- Without the gate, review it and merge it on GitHub.

A kit you pushed straight to the integration branch needs nothing here. The card shows "Kit files match the kit" once it is in.

### 7. Check secrets and workflows

Sessions act as you, so anything a session can start runs with your rights. The app can't check these: do them yourself, on every repository, and again after adding a secret or a workflow.

- **Environment secrets only on limited environments.** Settings › Environments (`https://github.com/<owner>/<name>/settings/environments`): every environment with secrets lists only exact branch names under **Deployment branches and tags**, each your default branch or the integration branch: no patterns, no tags, no protected-branches rule. If one doesn't, change it to **Selected branches and tags** and name the branch, or move its secrets elsewhere.
- **No repository secrets.** Settings › Secrets and variables › **Actions** and › **Dependabot** (`…/settings/secrets/actions`, `…/settings/secrets/dependabot`) list no repository secrets. If one is there, move it into a limited environment, or delete it: any branch a session pushes could read it.
- **No workflow that hands a pull request's output to secrets.** In `.github/workflows/`, on every branch, no workflow triggered by `pull_request_target` or `workflow_run` uses a secret or an environment, or checks out or consumes a pull request's code or another run's output (artifacts, caches). If one does, remove that trigger, or split it so the privileged part never touches that code or output.
- **Every hand-started workflow harmless when a session starts it.** Each `workflow_dispatch` or `repository_dispatch` workflow either does nothing harmful when a session starts it (no deploy, no secrets, no writes), or is limited to an environment a session can't deploy from. A guard on the actor doesn't help: a session is you.

### 8. Create the scheduled task

At claude.ai's scheduled tasks › **New task**, as the guide under the repository in Settings › Code › Repositories & scheduled tasks says (it is open while the repository has no scheduled task): the repository, starting from its default branch (never a `claude/` or `thistlewick-issue-` branch), your cloud environment, the model you want as the coordinator (set there, on claude.ai: the app can't read or set it), and the prompt the guide shows, filled for your integration branch (**Copy**). Check the pasted prompt holds its `git fetch` and `git rev-parse` commands: they are the scheduled task's check that a launch is at the integration branch's tip. Add an **API trigger**. Nothing about the scheduled task goes into GitHub.

### 9. Add the scheduled task in Thistlewick

**Add scheduled task** under the repository in Settings › Code › Repositories & scheduled tasks, with a name, the trigger's fire URL and its token, and your passkey. The app fires the scheduled task itself when you launch, and never shows the token again. If the repository has several, **Make default** on the one a launch should preselect. Note the token's renewal date.

### 10. Try a Quick fix

Create a throwaway issue, launch a Quick fix on it with your passkey, and check `started` arrives on the session's page. Once its pull request into the integration branch is green, Code reads it "Needs approval into <branch>" with the gate: approve it in Code › Pull requests with your passkey, then merge it on GitHub. Without the gate it reads "Checks passed into <branch>": review it and merge it on GitHub.

A repository without CI never shows "Needs approval" or "Checks passed" outside the Pull requests tab: a pull request counts as green only with at least one passed check. With the gate, its pull requests wait only for your passkey there.

## Coming from the setup app

A repository the setup app set up has the old kit's rulesets, CODEOWNERS and session bot, and its sessions act as the bot. In this order:

1. **Accept the Thistlewick App's new Checks permission** on GitHub: Settings › Applications › Installed GitHub Apps › the Thistlewick App. Until you do, approving asks you to.
2. **Reconnect claude.ai as yourself** through the Claude GitHub App ([Once](#once), step 3), choosing no repository yet, in place of the bot's `/web-setup` connection. Then remove the bot's `/web-setup` connection in claude.ai, and revoke the bot's token on GitHub, signed in as the bot.
3. **Each repository:** follow [its steps](#each-repository) as for a new one, except:
   - After [step 3](#3-import-both-gate-rulesets-recommended), once both gates are imported (or straight away if you go without the gate), delete `thistlewick-bot`, `thistlewick-d2`, `thistlewick-d3` and `thistlewick-tags` (or their `workbench-` names) in the repository's Settings › Rules › Rulesets, before step 4 adds the repository to the Claude GitHub App.
   - After step 6, delete `.github/CODEOWNERS` on the integration branch by a pull request merged on GitHub (approved first with your passkey in Code › Pull requests where the gate is set), then remove the session bot as a collaborator: Settings › Collaborators › the bot › **Remove**.
   - At steps 8 and 9, keep the scheduled task the repository already has rather than creating a new one.

## Known limits

- **On a public repository** anyone can open an issue or comment on one, and a launch takes the issue and its newest 100 comments, by any author, into the session's task: read them on the issue page before you approve, since your passkey approves exactly those.
- **A bypass list can't be read** by the app: a ruleset with one still reads as verified. Keep both bypass lists empty.
- **A stolen App key** can post the gate's check and open pull requests, but can't push or merge.
- **After you approve a head,** any session (it acts as you), or anyone with write access, can merge it before you do. The approval binds that commit and base for good: a reopened or new pull request at the same commit and base merges too. A later push needs a new approval.
- **Repository secrets added after setup** reach workflows on every branch a session pushes: check [step 7](#7-check-secrets-and-workflows) again after adding one.
- **No deploy** should run from a push to your branches except from an environment limited to the branch it deploys, and a cloud deploy's credential trust should be pinned to a branch.
- **Without the passkey gate,** a session acting as you is held only by your own GitHub rules. It can push to, force-push or delete the integration branch and your default branch, and merge its own pull request. It can also change what every later session starts with: your default branch's `.claude/` and `CLAUDE.md`, and the integration branch's `steps.md` and agents. `launch.md` tells a session never to merge, push to those branches or force-push, but that is guidance, not a rule GitHub enforces. "Checks passed" means only that CI is green: nobody approved anything.
- **On a private repository, while GitHub refuses the app's rules read** (a 401 or 403, GitHub's secondary rate limit included), a gated repository reads as having no gate: the card shows the gate as recommended, a green session pull request reads "Checks passed" (and its one notification says so), and Approve is refused until a read works. GitHub still enforces the rulesets, so only the display is wrong: don't delete your rulesets to get unstuck; wait and reload.
- **Classic branch protection can't be read** by the app, which reads rulesets only. A gate set up that way reads as no gate, and Thistlewick offers no Approve, so a pull request it holds for the gate's check can't merge. Use the rulesets the card offers.
