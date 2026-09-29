#!/usr/bin/env bash
# Project PreToolUse hook for Bash. Adds Studio OS specifics on top of the global destructive-guard.
#   deny = never runs.  A push must pass `scripts/verify.sh fast` first.
cmd=$(jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$cmd" ] && exit 0

emit() { # $1 = deny|ask, $2 = reason
  jq -n --arg d "$1" --arg r "$2" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$r}}'
  exit 0
}
has() { printf '%s' "$cmd" | grep -Eq -- "$1"; }

# The dev database holds his real account and test galleries. Prisma's reset/push paths drop data silently.
has 'prisma[[:space:]]+migrate[[:space:]]+reset'         && emit deny "prisma migrate reset drops the dev database (his real account lives there). Ask the user first. For a clean slate use the throwaway studio_os_test database."
has 'prisma[[:space:]]+db[[:space:]]+push'               && emit deny "db push skips migrations and can drop columns. Schema changes here are hand-written migrations applied with 'prisma migrate deploy' (see the migration-writer agent)."
has 'prisma[[:space:]]+migrate[[:space:]]+dev'           && emit deny "migrate dev refuses to run non-interactively and can offer a reset. Hand-write the migration and use 'migrate deploy'."
has 'DROP[[:space:]]+DATABASE[[:space:]]+(IF[[:space:]]+EXISTS[[:space:]]+)?"?studio_os"?([[:space:]]|;|$)' \
                                                         && emit deny "That is the dev database. Only studio_os_test is disposable."
has 'docker[[:space:]]+(rm|volume[[:space:]]+rm)[^;&|]*studio_os' \
                                                         && emit deny "studio_os_postgres / studio_os_minio hold his dev data. 'docker start' them; never remove them without asking."

# Nothing leaves the machine unless the fast gate is green.
if has '(^|[;&|[:space:]])git[[:space:]]+push([[:space:]]|$)'; then
  root=${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}
  if [ -x "$root/scripts/verify.sh" ]; then
    out=$("$root/scripts/verify.sh" fast 2>&1); rc=$?
    [ $rc -ne 0 ] && emit deny "scripts/verify.sh fast failed, so the push is blocked. Tail of output: $(printf '%s' "$out" | tail -15)"
  fi
fi
exit 0
