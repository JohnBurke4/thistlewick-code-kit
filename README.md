# The Thistlewick kit

How to bring one of your GitHub repositories onto Code's Thistlewick lane. Every step is done on GitHub's and claude.ai's websites, and in Thistlewick's Settings › Code; nothing is installed on your computer. Do the steps under [Once](#once) a single time, then [each repository's steps](#each-repository) for every repository, in order.

## How the lane works

- **Every Claude session acts as you.** claude.ai connects to GitHub through the Claude GitHub App on your own account, so a cloud session pushes, comments and opens pull requests as you, launched or not. Nothing a session does on its own can merge into a gated branch: that takes your passkey. Without the gate, it can (see [Known limits](#known-limits)).
- **The integration branch** (`thistlewick` unless you rename it in Thistlewick's Settings › Code › GitHub & setup; an account connected earlier keeps `workbench`) is the lane's: sessions open pull requests into it, and you merge them, approving each with your passkey first where the gate is set. With the gate it can't be your default branch, since the gate needs two branches; without it, it may be. You merge it into your own branches whenever you like.
- **The passkey gate,** recommended, not required, and set per repository. Two rulesets, one on the integration branch and one on your default branch, each require a pull request, merge commits only, no force pushes, no deletion, and one check posted by the Thistlewick App: `thistlewick-gate/integration` on the integration branch, `thistlewick-gate/main` on the default branch. Neither has a bypass list, so they hold you and every session alike. The App posts the check, passing, on a pull request's head only when you approve that head with your passkey in Code › Pull requests; a later push needs a new approval. You then merge on GitHub (the app merges nothing). Without the gate, a session's green pull request reads "Checks passed into <branch>", and you review and merge it on GitHub: nothing waits for your passkey, and "Checks passed" means only that CI is green. A gate only partly set up (one ruleset of the two, say) stops every launch until you finish it or delete it.
- **`.thistlewick/` on the integration branch** holds what a launched session follows: `launch.md` (the launch core, kept exactly as the kit holds it: the app checks it is that file), `relay.md` (how it reports to the app), `price.md` (a price check, kept exactly as the kit holds it: the app checks it is that file), `issues.md` (a breakdown, Break into tickets on a backlog item and Break into items on a project, kept exactly as the kit holds it: the app checks it is that file), `preview.md` (a preview session, started from a repository's Sessions tab with no issue, kept exactly as the kit holds it: the app checks it is that file), `brief.md` (a brief, Draft a brief on a project's Context brief card, which also reads the project's other repositories, kept exactly as the kit holds it: the app checks it is that file), `steps.md` (the launch ticks), `preview-client.mjs` (the live preview's client, which the `preview` tick starts), `agents/*.md` (the roles a launch can spawn: `planner`, `implementer`, `security-reviewer`, `validity-reviewer`, `simplicity-reviewer` and `ui-reviewer`) and `authors.json`. A session reads them at the integration branch's tip, which must be the commit your passkey approved when you launched it (the launch's passkey binds the integration branch's head, with or without the gate). `steps.md`, `preview-client.mjs` and the agents are yours to change, by a pull request (approved with your passkey where the gate is set): a role is a `.md` file named with a lower-case letter, then up to 39 lower-case letters, digits and hyphens, at most 64 KB (a larger one is left out), and the folder holds at most 20.
- **The `preview` tick,** in no template, shows a launched session's app as a live preview on demo data, opened from the session's page in Code. Its wording in `steps.md` names your repository's own commands and port: the command that loads the demo data, the command that serves the app on it at 127.0.0.1, and the port. Fill them in before you tick it; until then a session says the preview can't start. The session runs them, then `preview-client.mjs`, which reaches the relay host your cloud environment already allows, so it needs nothing more than a Node with `--use-env-proxy` (24.5 or later, or 22.21 or later) in the environment. The preview ends at a deadline the relay sets, which only you extend, from the session's page.
- **The scheduled task runs on your default branch,** so your own `.claude/` and `CLAUDE.md` load first, as always. They bind a launched session too, one whose first prompt tells it to follow `.thistlewick/launch.md`, which your scheduled task starts: `launch.md` follows your `CLAUDE.md`, and a tick adds to your rules but never switches one off. So if your `CLAUDE.md` says to always plan, or one of your `.claude/agents/` descriptions says to use it on every task, a launch does that whatever you ticked. To let the ticks decide, scope those lines to the sessions you open, and give your `.claude/agents/` types names other than the launch roles, or say in their descriptions that they are not for launched sessions. For example, in your `CLAUDE.md`:
  > A launched session, one whose first prompt tells it to follow `.thistlewick/launch.md`, follows that file: its ticked steps decide whether it plans, and it spawns only the roles its run names, on their models and efforts. My planning and agent rules here are for the sessions I open. Without a plan I approved, a launched session asks me before doing anything a rule here allows only when a plan names it.

## What it needs

- **For the passkey gate, a GitHub plan that enforces rulesets.** On a private repository the gate needs GitHub Pro, Team or Enterprise: GitHub Free doesn't enforce rulesets on private repositories, so its gates would hold nothing. A private repository on GitHub Free works without the gate. A public repository can have it on any plan.
- A paid claude.ai plan, for scheduled tasks.
- About 15 minutes once, and 10 per repository. The ruleset import is easier on a computer than on a phone.

## Once

Settings › Code › GitHub & setup lists these, ticking what it can check.

1. **Connect GitHub** in Thistlewick's Settings › Code › GitHub & setup: the Thistlewick App on your own personal account, **Only select repositories**. Choose no repository yet if you like: each is added at its own step 1.
2. **Add a passkey** there, within 15 minutes of connecting.
3. **Connect claude.ai through the Claude GitHub App,** from claude.ai, signed in to GitHub as you. Choose no repository yet: each is added at its own [step 4](#4-add-the-repository-to-the-claude-github-app), after its gates if you set them up. Never use `/web-setup`. Every Claude session then acts as you.
4. **Pick or create a cloud environment that can reach the relay host:** Custom network access with the host in Allowed domains (keep Also include default list), or Full. No Network secret. An Owner can share one with the organization.

## Each repository

Its card in Settings › Code › Repositories & scheduled tasks shows the checks the app can read, the kit to download (with the setup prompt as a fallback) and the two ruleset downloads, all named for that repository.

### 1. Add the repository to the Thistlewick App

A new repository can start in Thistlewick: **New repository** on the Repositories page (`/code`, the deployed app only) creates it on your own personal account, private or public, with a README. If it then isn't on the Repositories page, add it as below.

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

Download the kit from the card: **Download the kit (.zip)** saves `thistlewick-kit.zip`, your `.thistlewick/` filled for your account. It holds no secret, only the relay host. Unzip it and add the `.thistlewick` folder at your repository's root, from your clone or on GitHub with **Add file** › **Upload files**, keeping your own `steps.md`, `preview-client.mjs` and agents if you changed them. Without the gate, commit it to the integration branch (or upload it there); with the gate, put it on a new branch and open a pull request into the integration branch. To update an older kit, do the same: it replaces the old files. On a Mac, Finder hides folders whose names start with a dot: press Cmd+Shift+. to show them.

**No local clone?** Open "No local clone? Copy the setup prompt into a Claude session" on the card, copy the prompt and paste it into a new Claude session on the repository (claude.ai/code, the repository, your default branch). The prompt checks the integration branch, fetches the kit from the public kit repository at the commit the app pins, and copies `.thistlewick/` from it byte for byte. It then fills `relay.md`'s relay host and `authors.json` for your account, and opens a pull request into the integration branch that changes nothing outside `.thistlewick/`.

**By hand instead:** on a new branch from the integration branch, copy the kit repository's `files/dot-thistlewick/` at the commit the card's README link names to `.thistlewick/`, byte for byte, keeping your own `steps.md`, `preview-client.mjs` and agents if you have them. In `relay.md`, replace `__INGEST_HOST__` with the relay host the card's prompt names. Write `authors.json` exactly as the card's prompt shows it: your GitHub id as `owner_id`, the Thistlewick App's bot as `app_bot_id` (both numbers), and the integration branch as `integration`. Open a pull request into the integration branch.

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

At claude.ai's scheduled tasks › **New task**, as the guide under the repository in Settings › Code › Repositories & scheduled tasks says (it is open while the repository has no scheduled task): the repository, starting from its default branch (never a `claude/`, `thistlewick-issue-` or `thistlewick-ticket-` branch), your cloud environment, the model you want as the coordinator (set there, on claude.ai: the app can't read or set it), and the prompt the guide shows, filled for your integration branch (**Copy**). Check the pasted prompt holds its `git fetch` and `git rev-parse` commands: they are the scheduled task's check that a launch is at the integration branch's tip. Add an **API trigger**. Nothing about the scheduled task goes into GitHub.

### 9. Add the scheduled task in Thistlewick

**Add scheduled task** under the repository in Settings › Code › Repositories & scheduled tasks, with a name, the trigger's fire URL and its token, and your passkey. The app fires the scheduled task itself when you launch, and never shows the token again. If the repository has several, **Make default** on the one a launch should preselect. Note the token's renewal date.

### 10. Try a Quick fix

Create a throwaway issue, launch a Quick fix on it with your passkey, and check `started` arrives on the session's page. Once its pull request into the integration branch is green, Code reads it "Needs approval into <branch>" with the gate: approve it in Code › Pull requests with your passkey, then merge it on GitHub. Without the gate it reads "Checks passed into <branch>": review it and merge it on GitHub.

A repository without CI never shows "Needs approval" or "Checks passed" outside the Pull requests tab: a pull request counts as green only with at least one passed check. With the gate, its pull requests wait only for your passkey there.

## Updating for live previews

The kit that brings live previews changes `relay.md`, so once the app holds it, each repository's launches, price checks, breakdowns and scheduled task tests are refused as outdated until its kit is updated. Once per repository, update it as [step 5](#5-add-the-kit) says (the setup prompt or the download) and merge it as step 6 says. If you keep your own `steps.md`, as the setup prompt does, copy the kit's `preview` section into it, its comment rules paragraph ("A comment is an extra request…") included: it is what limits what a preview comment can make a session do. Either way, fill in its commands and port. The setup prompt keeps the repository's own `preview-client.mjs` too, so copy the kit's over it, byte for byte: the app reads an older client as customised, and it offers no feedback overlay. A setup prompt hands out the overlay's client only once the kit that holds it is published. A repository already updated for live previews isn't refused: its previews just have no feedback until its `preview-client.mjs` and `preview` section are copied again. Launches started before the update can't preview.

The kit that brings preview sessions adds `preview.md` and changes `launch.md` and `relay.md`, so every repository's kit needs updating, as above: until it is, its issue launches read as kit outdated and are refused, as are its price checks, breakdowns and scheduled task tests, and no preview session can start on it. A preview session needs the `preview` tick in `steps.md`, its commands and port filled in.

## Updating for Code tickets

The kit that launches a session from a Code ticket changes `launch.md` and `relay.md`, so once the app holds it, each repository's launches, preview sessions, price checks, breakdowns and scheduled task tests are refused as outdated until its kit is updated. Once per repository, paste the setup prompt from its card into a new session (or use the download), as [step 5](#5-add-the-kit) says, and merge it as step 6 says. It keeps your own `steps.md`, `preview-client.mjs` and agents.

## Updating for estimates in hours

The kit that estimates in human developer hours changes `price.md` (`thistlewick-price@2`). For one release the app accepts the old `price.md` too, so a repository not yet updated keeps its price checks, estimated the old way, while its card reads its kit files as differing. Its in-house items can be estimated only once it is updated. Once per repository, paste the setup prompt from its card into a new session (or use the download), as [step 5](#5-add-the-kit) says, and merge it as step 6 says. It keeps your own `steps.md`, `preview-client.mjs` and agents. A later release stops accepting the old `price.md`.

## Updating for project estimates

The kit that estimates a project's items together changes `price.md` (`thistlewick-price@3`) and `relay.md`. For one release the app accepts the old `price.md` and `relay.md` too, so a repository not yet updated keeps its launches, price checks, breakdowns and scheduled task tests, its items estimated one at a time under `thistlewick-price@2`, while its card reads its kit files as differing. A project's items can be estimated together only once it is updated. Once per repository, paste the setup prompt from its card into a new session (or use the download), as [step 5](#5-add-the-kit) says, and merge it as step 6 says. It keeps your own `steps.md`, `preview-client.mjs` and agents. A later release stops accepting the old `price.md` and `relay.md`.

## Updating for drafted items and tickets

The kit that drafts tickets from a backlog item and backlog items from a project changes `issues.md` (`thistlewick-issues@2`). For one release the app accepts the old `issues.md` too, so a repository not yet updated keeps its launches, price checks and scheduled task tests, while its card reads its kit files as differing. Its items can be broken into tickets, and its projects into items, only once it is updated. Once per repository, paste the setup prompt from its card into a new session (or use the download), as [step 5](#5-add-the-kit) says, and merge it as step 6 says. It keeps your own `steps.md`, `preview-client.mjs` and agents. A later release stops accepting the old `issues.md`.

## Updating for ticket closes from merges

This kit changes only the wording of `launch.md`'s step 7. For one release the app accepts the old `launch.md` too, so a repository not yet updated keeps its launches, price checks, breakdowns, preview sessions and scheduled task tests, and its card reads its kit files as differing. Tickets close from merges either way. Once per repository, paste the setup prompt from its card into a new session (or use the download), as [step 5](#5-add-the-kit) says, and merge it as step 6 says.

## Updating for drafted dependencies

The kit whose drafted tickets may name the tickets they wait on changes `issues.md` (`thistlewick-issues@3`). For one release the app accepts the old `issues.md` too, so a repository not yet updated keeps its breakdowns, drafted without dependencies, while its card reads its kit files as differing. Once per repository, paste the setup prompt from its card into a new session (or use the download), as [step 5](#5-add-the-kit) says, and merge it as step 6 says. A later release stops accepting the old `issues.md`.

## Updating for change notes

This kit changes only `launch.md`'s step 8: an issue or ticket launch's final summary, and a preview session's, now starts with a one-line change note, what its pull request changed for the product, or `Change: none.` For one release the app accepts the old `launch.md` too, so a repository not yet updated keeps its launches, price checks, breakdowns, preview sessions and scheduled task tests, and its card reads its kit files as differing; its sessions just send no note. The `launch.md` from before ticket closes from merges is no longer accepted. Once per repository, paste the setup prompt from its card into a new session (or use the download), as [step 5](#5-add-the-kit) says, and merge it as step 6 says.

## Updating for briefs

The kit that drafts a project's context brief adds `brief.md` (`thistlewick-brief@1`) and changes `launch.md`'s step 0, which sends a brief to it. For one release the app accepts the old `launch.md` too, so a repository not yet updated keeps its launches, price checks, breakdowns, preview sessions and scheduled task tests, while its card reads its kit files as differing. A brief runs on a repository only once it is updated, and it reads the project's other repositories as they are: each needs only to be private, in the Claude GitHub App ([step 4](#4-add-the-repository-to-the-claude-github-app)) and to have the integration branch, whose tip the session reads, and needs no kit of its own. The `launch.md` from before change notes is no longer accepted. Once per repository, paste the setup prompt from its card into a new session (or use the download), as [step 5](#5-add-the-kit) says, and merge it as step 6 says.

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
- **Without the passkey gate,** a session acting as you is held only by your own GitHub rules. It can push to, force-push or delete the integration branch and your default branch, and merge its own pull request. It can also change what every later session starts with: your default branch's `.claude/` and `CLAUDE.md`, and the integration branch's `steps.md`, `preview-client.mjs` and agents. `launch.md` tells a session never to merge, push to those branches or force-push, but that is guidance, not a rule GitHub enforces. "Checks passed" means only that CI is green: nobody approved anything.
- **On a private repository, while GitHub refuses the app's rules read** (a 401 or 403, GitHub's secondary rate limit included), a gated repository reads as having no gate: the card shows the gate as recommended, a green session pull request reads "Checks passed" (and its one notification says so), and Approve is refused until a read works. GitHub still enforces the rulesets, so only the display is wrong: don't delete your rulesets to get unstuck; wait and reload.
- **Classic branch protection can't be read** by the app, which reads rulesets only. A gate set up that way reads as no gate, and Thistlewick offers no Approve, so a pull request it holds for the gate's check can't merge. Use the rulesets the card offers.
