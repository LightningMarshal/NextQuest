# 02 — Set up your computer

By the end of this chapter you'll have a terminal you're comfortable
opening, Node.js and git installed, and the stooge-log code on your
machine with its dependencies installed.

## Open a terminal

A **terminal** is a window where you type commands and press Enter to run
them. Everything in this guide that appears in a code box gets typed (or
pasted) into one.

- **Windows**: open the Start menu, type `powershell`, press Enter.
  ("Windows PowerShell" and "Terminal" both work — Terminal opens
  PowerShell inside it on modern Windows.)
- **macOS**: press <kbd>⌘ Cmd</kbd>+<kbd>Space</kbd>, type `terminal`,
  press Enter.
- **Linux**: usually <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd>, or find
  "Terminal"/"Console" in your applications menu.

Things to know:

- The line ending in a symbol like `>` or `$` is the **prompt** — the
  terminal waiting for you. You type after it.
- **Paste** with right-click or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd>
  on Windows/Linux, <kbd>⌘ Cmd</kbd>+<kbd>V</kbd> on macOS.
  (<kbd>Ctrl</kbd>+<kbd>V</kbd> alone often does nothing in terminals.)
- When a command fails, it prints an **error message**. Don't panic — read
  the last few lines; they usually name the problem, and the
  [troubleshooting chapter](11-troubleshooting.md) covers the ones this
  guide can cause.
- Commands only "happen" after you press <kbd>Enter</kbd>.

## Install Node.js

Node.js is the program that runs JavaScript outside a browser — it's what
executes the app locally and all the `npm …` commands. Install the **LTS**
("Long Term Support") version, 20 or newer:

- **Windows**: go to [nodejs.org](https://nodejs.org/), download the
  **LTS** Windows installer (`.msi`), run it, accept the defaults. Close
  and reopen your terminal afterwards so it notices the new install.
- **macOS**: go to [nodejs.org](https://nodejs.org/), download the **LTS**
  macOS installer (`.pkg`), run it, accept the defaults.
- **Linux**: your distribution's package may be outdated. The simplest
  reliable options are the
  [NodeSource setup script](https://github.com/nodesource/distributions)
  for Debian/Ubuntu/Fedora, or your package manager if it offers Node 20+
  (`sudo apt install nodejs npm` on recent Ubuntu).

Verify — both commands should print version numbers (Node 20.x or higher):

**All platforms**

```bash
node --version
npm --version
```

> [!NOTE]
> `npm` comes bundled with Node.js — no separate install. It's the tool
> that downloads the app's dependencies and runs project commands like
> `npm run dev`.

## Install git

git is the tool that downloads ("clones") the code and later pulls
updates.

- **Windows**: download and run the installer from
  [git-scm.com](https://git-scm.com/download/win). It asks many questions —
  the defaults are all fine. (It also installs "Git Bash"; you can ignore
  that, this guide uses PowerShell.)
- **macOS**: just run `git --version` in the terminal — if git isn't
  installed, macOS pops up an offer to install the "command line developer
  tools"; accept it.
- **Linux**: `sudo apt install git` (Debian/Ubuntu) or
  `sudo dnf install git` (Fedora).

Verify:

**All platforms**

```bash
git --version
```

## Get the code

Pick or make a folder for projects, then clone the repository and step
into it. Replace `<repo-url>` with the address of your copy of the repo
(on the GitHub page, the green **Code** button shows it — use the HTTPS
one):

**All platforms**

```bash
git clone <repo-url>
cd stooge-log-mega-branch
```

> [!NOTE]
> `cd` means "change directory". Every command in the rest of this guide
> assumes your terminal is *inside* the project folder. If you open a new
> terminal later, `cd` back into it first.

## Install the dependencies

The app builds on many open-source libraries. This downloads them all into
a `node_modules` folder (a few minutes and a lot of scrolling text —
warnings are normal, errors are not):

**All platforms**

```bash
npm install
```

## Checkpoint

Your computer is ready if this runs without an error (it checks the code
compiles — expect it to take a moment and end quietly):

**All platforms**

```bash
npm run typecheck
```

---

[← 01 — What you are about to do](01-what-you-are-about-to-do.md) · [Index](README.md) · Next: [03 — Cloudflare →](03-cloudflare.md)
