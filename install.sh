#!/bin/sh
# Install the toolsuite: build it, put the binaries on your PATH, and install
# the Claude skills that ship with the tools.
#
#   ./install.sh                    everything (the default, and what you want)
#   ./install.sh forebrief          one tool, plus the library it needs
#   ./install.sh backbrief inbrief  some of them
#
# Everything on is the default deliberately: the tools are designed to be used
# together -- inbrief before work starts, forebrief at each decision, backbrief
# after a change lands -- and a partial install is the unusual case.
#
# IF YOU DEVELOP THESE TOOLS, DO NOT RUN THIS. This tree is generated and is
# wiped and rewritten on every publish, so binaries linked from here break the
# next time that happens. Link from the private development checkouts instead.
set -eu

cd "$(dirname "$0")"

TOOLS="${*:-backbrief forebrief inbrief}"

for t in $TOOLS; do
  case "$t" in
    backbrief|forebrief|inbrief) ;;
    *)
      echo "unknown tool: $t (expected backbrief, forebrief or inbrief)" >&2
      exit 1
      ;;
  esac
done

# --- prerequisites -----------------------------------------------------------
command -v node >/dev/null 2>&1 || { echo "node is required (>= 20)" >&2; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "npm is required" >&2; exit 1; }

node_major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$node_major" -lt 20 ]; then
  echo "node >= 20 is required (found $(node -v))" >&2
  exit 1
fi

# --- build -------------------------------------------------------------------
# The whole workspace builds, whichever tools were asked for: they all sit on
# the same library, and building only part of a project-references graph is more
# trouble than it saves.
echo "==> installing dependencies"
# The distribution carries a lockfile, so installation must reproduce it rather
# than silently rewriting dependency choices. None of the suite's dependencies
# needs an install hook; refusing lifecycle scripts narrows the clone-and-run
# trust boundary before our own explicit build starts.
npm ci --ignore-scripts

echo "==> building"
npm run build --silent

# --- binaries ----------------------------------------------------------------
# `npm link` on a workspace package puts its `bin` on PATH via the global
# prefix. If that prefix is not writable this is where it fails, loudly; set a
# user-writable one first (`npm config set prefix ~/.local`) and re-run.
for t in $TOOLS; do
  echo "==> linking $t"
  npm link --silent -w "@$t/cli"
done

# --- skills ------------------------------------------------------------------
# A tool's Claude skill is part of the tool. Symlinked rather than copied, so a
# `git pull` here updates the installed skill too.
SKILLS_DIR="${EET_SKILLS_DIR:-$HOME/.claude/skills}"
if [ -d skills ]; then
  mkdir -p "$SKILLS_DIR"
  for s in skills/*; do
    [ -d "$s" ] || continue
    name=$(basename "$s")
    case " $TOOLS " in
      *" $name "*) ;;
      *) continue ;;   # only install skills for tools being installed
    esac
    target="$SKILLS_DIR/$name"
    rm -rf "$target"
    ln -s "$(pwd)/$s" "$target"
    echo "==> skill installed: $name"
  done
fi

# --- report ------------------------------------------------------------------
echo
echo "installed:"
BIN_DIR="$(npm prefix -g)/bin"
for t in $TOOLS; do
  linked="$BIN_DIR/$t"
  if [ -e "$linked" ]; then
    if command -v "$t" >/dev/null 2>&1 && [ "$(command -v "$t")" = "$linked" ]; then
      printf '  %-11s %s\n' "$t" "$linked"
    else
      printf '  %-11s %s -- add %s to PATH\n' "$t" "$linked" "$BIN_DIR"
    fi
  else
    printf '  %-11s LINK FAILED -- expected %s\n' "$t" "$linked"
  fi
done

LACONIC_HOME_DIR="${LACONIC_HOME:-$HOME/.laconic}"
if [ -x "$LACONIC_HOME_DIR/bin/laconic-status" ]; then
  printf '\n%s\n' "recommended companion detected: Laconic"
  "$LACONIC_HOME_DIR/bin/laconic-status" || true
else
  cat <<'LACONIC'

STRONGLY RECOMMENDED: install Laconic
  Inbrief and Backbrief run without it, but demonstrated knowledge will not
  carry between projects and explanations cannot be calibrated against that
  history.

  In Claude Code:
    /plugin marketplace add https://github.com/yurug/laconic-skill
    /plugin install laconic@nomadic-labs

  Then start a new session and run ~/.laconic/bin/laconic-status.
  Details: https://github.com/yurug/laconic-skill
LACONIC
fi

cat <<'NOTE'

Each tool wants a per-repo state directory before it does anything; see
docs/ for the CLI reference of the tool you are using.

NOT INSTALLED BY THIS SCRIPT: the agent-side quality gates (the visual honesty
check and its Stop hook) ship with the authoring methodology, not with the
tools, and are not part of this repo.
NOTE
