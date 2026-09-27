#!/usr/bin/env bash
#
# Tests for the parts of deploy/deploy.sh that decide which five images are live.
#
# These are the functions a mistake in is invisible until a deploy: the image
# derivation, the back-compat read of an old release record, and the component
# list. Everything else in the script is `docker compose` doing its job.
#
# Sourced from the real script rather than copied, so a change to the script is
# tested without a second copy going stale. The script is written to be safe to
# source: everything that acts happens in the numbered sections at the bottom,
# after a guard that returns rather than exiting when it is only being sourced.
#
#   bash deploy/test-deploy.sh
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SCRIPT="${SCRIPT_DIR}/deploy.sh"

pass=0
fail=0

ok()   { printf '  \033[32mok\033[0m   %s\n' "$1"; pass=$((pass + 1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; [ $# -gt 1 ] && printf '         expected: %s\n         actual:   %s\n' "$2" "$3"; fail=$((fail + 1)); }
group() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# Source the script's definitions without running the deploy.
FIXMATE_SOURCE_ONLY=1
export FIXMATE_SOURCE_ONLY
# shellcheck source=/dev/null
. "$DEPLOY_SCRIPT" 2>/dev/null || true

if ! declare -F sibling_image >/dev/null 2>&1; then
    printf '\033[1;31mCould not source %s - the guard is missing or the script exits early.\033[0m\n' "$DEPLOY_SCRIPT"
    exit 1
fi

# ---------------------------------------------------------------------------
group 'the image derivation'

# A tagged reference, which is what the pipeline passes.
IMAGE="ghcr.io/beahsan/fixmate/app:1.4.0"
check() {
    local name="$1" expected="$2" actual
    actual="$(sibling_image "$name")"
    [ "$actual" = "$expected" ] && ok "$name -> $actual" || bad "$name" "$expected" "$actual"
}

check user-app        "ghcr.io/beahsan/fixmate/user-app:1.4.0"
check worker-app      "ghcr.io/beahsan/fixmate/worker-app:1.4.0"
check admin-app       "ghcr.io/beahsan/fixmate/admin-app:1.4.0"
check super-admin-app "ghcr.io/beahsan/fixmate/super-admin-app:1.4.0"

# :latest
IMAGE="ghcr.io/beahsan/fixmate/app:latest"
check user-app "ghcr.io/beahsan/fixmate/user-app:latest"

# A pre-release tag, which must survive intact.
IMAGE="ghcr.io/beahsan/fixmate/app:2.0.0-rc1"
check user-app "ghcr.io/beahsan/fixmate/user-app:2.0.0-rc1"

# An untagged reference. The tag expansion returns the whole string when there is
# no colon, so without an explicit default this produced
# `user-app:ghcr.io/beahsan/fixmate/app` - a name nothing can pull.
IMAGE="ghcr.io/beahsan/fixmate/app"
check user-app "ghcr.io/beahsan/fixmate/user-app:latest"

# A registry that includes a port: the colon in the host is not the tag.
IMAGE="localhost:5000/fixmate/app:2.0.0"
check user-app "localhost:5000/fixmate/user-app:2.0.0"

# A digest-pinned reference is a different shape and is NOT derived from; it is
# only ever passed explicitly. Assert it is at least not silently mangled.
IMAGE="ghcr.io/beahsan/fixmate/app@sha256:abc123"
derived="$(sibling_image user-app)"
case "$derived" in
    *user-app:*) ok "a digest reference still produces a name ending in user-app (explicit form only)" ;;
    *) bad "a digest reference" "a *user-app:* name" "$derived" ;;
esac

# ---------------------------------------------------------------------------
group 'the four front ends keep one tag'

IMAGE="ghcr.io/beahsan/fixmate/app:1.4.0"
# `sibling_image` uses printf with no trailing newline, and `$(...)` strips one
# anyway, so the newline has to be re-added per iteration or the four tags arrive
# as one string. That was a bug in this test, not in the script.
tags="$(for c in user-app worker-app admin-app super-admin-app; do
    sibling_image "$c" | sed 's/.*://'
    printf '\n'
done | sort -u | tr '\n' ' ')"
[ "$tags" = "1.4.0 " ] && ok "all four share the app's tag" || bad "tags" "'1.4.0 '" "$tags"

# ---------------------------------------------------------------------------
group 'the component list'

count="$(printf '%s\n' $COMPONENTS | wc -l | tr -d ' ')"
[ "$count" = "5" ] && ok "five components" || bad "component count" "5" "$count"

for c in app user-app worker-app admin-app super-admin-app; do
    printf '%s\n' $COMPONENTS | grep -qx "$c" && ok "includes $c" || bad "components" "to include $c" "missing"
done

# Every component must resolve to an image. A component with no case in
# image_for would `die`, which is loud, but only at deploy time.
IMAGE="ghcr.io/beahsan/fixmate/app:1.4.0"
for c in $COMPONENTS; do
    resolved="$(image_for "$c" 2>/dev/null || true)"
    [ -n "$resolved" ] && ok "image_for $c resolves" || bad "image_for $c" "a reference" "(nothing)"
done

# A component must not inherit another's image.
user_img="$(image_for user-app)"; admin_img="$(image_for admin-app)"
[ "$user_img" != "$admin_img" ] && ok "each component has its own image" || bad "distinct images" "different" "both $user_img"

# ---------------------------------------------------------------------------
group 'reading a previous release'

# A set, in the new format: returned unchanged.
PREVIOUS_RELEASE="app=ghcr.io/x/app:1
user-app=ghcr.io/x/user-app:1"
loaded="$(load_previous)"
[ "$loaded" = "$PREVIOUS_RELEASE" ] && ok "a recorded set is returned unchanged" || bad "set round-trip" "unchanged" "$loaded"

# The old single-image format, which the first run after upgrading must still be
# able to roll back to. Expanded through the same derivation, so the two cannot
# disagree.
PREVIOUS_RELEASE="ghcr.io/beahsan/fixmate/app:1.4.0"
loaded="$(load_previous)"
expected_lines=5
actual_lines="$(printf '%s\n' "$loaded" | grep -c '=')"
[ "$actual_lines" = "$expected_lines" ] && ok "an old single-image record expands to five" \
    || bad "back-compat" "$expected_lines lines" "$actual_lines lines"

printf '%s\n' "$loaded" | grep -q '^app=ghcr.io/beahsan/fixmate/app:1.4.0$' \
    && ok "back-compat: app is the recorded image" || bad "back-compat app" "app=...:1.4.0" "$(printf '%s\n' "$loaded" | grep '^app=')"

printf '%s\n' "$loaded" | grep -q '^user-app=ghcr.io/beahsan/fixmate/user-app:1.4.0$' \
    && ok "back-compat: the front end is derived from it" || bad "back-compat user-app" "derived" "$(printf '%s\n' "$loaded" | grep '^user-app=')"

# The derivation used by back-compat must be the same one, so a change to the
# naming rule cannot leave this path behind.
IMAGE="ghcr.io/beahsan/fixmate/app:1.4.0"
PREVIOUS_RELEASE="ghcr.io/beahsan/fixmate/app:1.4.0"
[ "$(load_previous | grep '^admin-app=')" = "admin-app=$(sibling_image admin-app)" ] \
    && ok "back-compat uses the same derivation" || bad "back-compat derivation" "same" "differs"

# No record at all: empty, and rollback says so rather than restoring nonsense.
PREVIOUS_RELEASE=""
[ -z "$(load_previous)" ] && ok "no record yields nothing to restore" || bad "no record" "" "$(load_previous)"

# ---------------------------------------------------------------------------
group 'the timeout exceeds the health check's own detection time'

# A front end's Docker health check is interval 30s with 3 retries, so it needs
# up to ~90s to report unhealthy. A wait shorter than that calls a failure before
# Docker has noticed one. Measured from a real container, not assumed.
default_timeout="${COMPONENT_TIMEOUT:-180}"
[ "$default_timeout" -ge 120 ] \
    && ok "COMPONENT_TIMEOUT is ${default_timeout}s, above the ~90s a check needs" \
    || bad "COMPONENT_TIMEOUT" ">= 120" "$default_timeout"

# ---------------------------------------------------------------------------
group 'wait_for_component tells three outcomes apart'

# The caller dispatches on the return code, and the difference between "not
# serving" and "exited" is the difference between an operator looking at a
# service and an operator looking at a crash. So the codes are tested against the
# real function, with `docker` and `curl` stubbed - stubbing the collaborators
# rather than reimplementing the function, so this is a test of the shipped code.
#
# COMPONENT_TIMEOUT is dropped to 1s so the timeout case is quick; the real value
# is asserted separately above.
COMPONENT_TIMEOUT=1

# Every call is made as an `if` condition rather than bare. Sourcing the script
# leaves `set -e` active in this shell, and a function that ends in `return 1`
# would take the harness down with it - which is also exactly why the shipped call
# site is `if wait_for_component ...; then continue; fi` and not a bare call.
rc_of() { if "$@" >/dev/null 2>&1; then printf '0'; else printf '%s' "$?"; fi; }

# A healthy, serving component.
docker() { printf 'abc123\n'; }
curl()   { return 0; }
rc="$(rc_of wait_for_component user-app)"
[ "$rc" = "0" ] && ok "a serving component returns 0" || bad "serving" "0" "$rc"

# Running, but the address does not answer, and never does.
docker() { printf 'abc123\n'; }
curl()   { return 7; }
rc="$(rc_of wait_for_component user-app)"
[ "$rc" = "1" ] && ok "a component that never answers returns 1 (timeout)" || bad "timeout" "1" "$rc"

# The container has exited: that must not be reported as a timeout, because the
# operator needs to know it died rather than that it is slow.
docker() {
    case "$*" in
        *compose*ps*) printf 'abc123\n' ;;
        *inspect*)    printf 'exited' ;;
    esac
}
curl()   { return 7; }
rc="$(rc_of wait_for_component user-app)"
[ "$rc" = "2" ] && ok "an exited container returns 2, distinct from a timeout" || bad "exited" "2" "$rc"

# The caller reads `$?` straight after the call, and the losing form is
# `if ! cmd; then status=$?` - `!` inverts the status, so that read is always 0
# and the exited branch is dead code. Demonstrated here so the reason for the
# assertion below is on the page rather than folklore:
probe() { return 2; }
if ! probe; then :; fi
if [ "$?" = "0" ]; then
    ok "the '!' form does lose the exit status (which is why it is not used)"
else
    bad "the '!' form" "to lose the status" "it preserved $? - recheck the premise"
fi

# And then asserted against the shipped call site, which is the thing that
# actually matters. Grepping the source is the right instrument here: the bug is
# invisible at runtime until a container happens to die at the exact moment the
# check is polling, which is not something a test can arrange on demand.
if grep -q 'if ! wait_for_component' "$DEPLOY_SCRIPT"; then
    bad "the call site" "an un-negated 'if wait_for_component'" \
        "it still uses 'if ! wait_for_component', so \$? is always 0 and the exited branch is dead"
else
    ok "the call site reads \$? from an un-negated call"
fi

# The two branches must both still be reachable, i.e. the dispatch on the status
# is really there and not collapsed into one message.
for needed in 'status" = "2"' 'never reported healthy' 'exited during startup'; do
    grep -q "$needed" "$DEPLOY_SCRIPT" \
        && ok "the dispatch still distinguishes: $needed" \
        || bad "dispatch" "to mention '$needed'" "absent"
done

# ---------------------------------------------------------------------------
group 'reading the release history'

# The history is blocks: a `--- <timestamp>` line then the five component lines.
# It has to be parsed as blocks. The previous script found the previous release
# with `grep -v "^${CURRENT}$" | tail -1`, and on a five-line record that pattern
# spans five lines, matches nothing, and yields an arbitrary line - which then
# gets handed to compose as an image name. It failed quietly, which is the worst
# way for a rollback to fail.
HISTORY_FILE="$(mktemp)"
trap 'rm -f "$HISTORY_FILE"' EXIT

cat > "$HISTORY_FILE" <<'HISTORY'
--- 2026-01-01T00:00:00Z
app=r/app:1
user-app=r/user-app:1
worker-app=r/worker-app:1
admin-app=r/admin-app:1
super-admin-app=r/super-admin-app:1
--- 2026-01-02T00:00:00Z
app=r/app:2
user-app=r/user-app:2
worker-app=r/worker-app:2
admin-app=r/admin-app:2
super-admin-app=r/super-admin-app:2
--- 2026-01-03T00:00:00Z
app=r/app:3
user-app=r/user-app:3
worker-app=r/worker-app:3
admin-app=r/admin-app:3
super-admin-app=r/super-admin-app:3
HISTORY

[ "$(history_count)" = "3" ] && ok "three releases on record" || bad "history_count" "3" "$(history_count)"

newest="$(history_set_at 1)"
[ "$(printf '%s\n' "$newest" | grep -c '=')" = "5" ] \
    && ok "the newest block holds all five components" \
    || bad "newest block" "5 lines" "$(printf '%s\n' "$newest" | grep -c '=') lines"

printf '%s\n' "$newest" | grep -q '^app=r/app:3$' \
    && ok "the newest block is the last one" || bad "newest" "app=r/app:3" "$(printf '%s\n' "$newest" | grep '^app=')"

previous="$(history_set_at 2)"
printf '%s\n' "$previous" | grep -q '^app=r/app:2$' \
    && ok "one back is the second release" || bad "previous" "app=r/app:2" "$(printf '%s\n' "$previous" | grep '^app=')"

third="$(history_set_at 3)"
printf '%s\n' "$third" | grep -q '^app=r/app:1$' \
    && ok "two back is the first release" || bad "third" "app=r/app:1" "$(printf '%s\n' "$third" | grep '^app=')"

# A block must never include the `---` line that delimits it, or the separator
# would be handed to compose as a component name.
for n in 1 2 3; do
    printf '%s\n' "$(history_set_at $n)" | grep -q '^--- ' \
        && bad "block $n is free of separators" "no '--- ' line" "found one" \
        || ok "block $n is free of separators"
done

# Asking for a release that does not exist must fail, not return the last one.
# Returning something plausible is how a rollback silently becomes a no-op.
if history_set_at 4 >/dev/null 2>&1; then
    bad "history_set_at 4" "to fail" "it returned a value"
else
    ok "asking for a fourth release fails rather than repeating the third"
fi

# An empty or absent history must not produce a block.
: > "$HISTORY_FILE"
if history_set_at 1 >/dev/null 2>&1; then
    bad "empty history" "to fail" "it returned a value"
else
    ok "an empty history yields nothing"
fi

# ---------------------------------------------------------------------------
group 'applying a recorded set'

# Every component in a recorded set must reach its own compose variable. A
# mapping that misses one is how a rollback restores four front ends and quietly
# leaves the fifth on the new version - the exact failure a set record exists to
# prevent. So this asserts the variable, not just the text.
RECORD='app=r/app:9
user-app=r/user-app:9
worker-app=r/worker-app:9
admin-app=r/admin-app:9
super-admin-app=r/super-admin-app:9'

(
    use_release_set "$RECORD" >/dev/null 2>&1
    for pair in "APP_IMAGE r/app:9" \
                "USER_APP_IMAGE r/user-app:9" \
                "WORKER_APP_IMAGE r/worker-app:9" \
                "ADMIN_APP_IMAGE r/admin-app:9" \
                "SUPER_ADMIN_APP_IMAGE r/super-admin-app:9"; do
        var="${pair%% *}"; want="${pair#* }"
        got="${!var:-}"
        [ "$got" = "$want" ] || { printf '  \033[31mFAIL\033[0m %s is "%s", expected "%s"\n' "$var" "$got" "$want"; exit 1; }
    done
    printf '  \033[32mok\033[0m   all five images reach their own compose variable\n'
) && pass=$((pass + 1)) || fail=$((fail + 1))

# A record that is not a set must be refused loudly. Treating a bare string as an
# image name is the failure the old rollback script had.
#
# Each is run in its own subshell and judged by its exit status. `die` calls
# `exit`, so inside a subshell it takes the *whole subshell* down - a test that
# printed its verdict after the call would print nothing at all on the very cases
# it exists to check, and would look like a crash rather than a pass.
if ( use_release_set "r/app:1.4.0" ) >/dev/null 2>&1; then
    bad "a bare image string" "to be refused" "it was accepted"
else
    ok "a bare image string is refused rather than half-applied"
fi

if ( use_release_set "" ) >/dev/null 2>&1; then
    bad "an empty record" "to be refused" "it was accepted"
else
    ok "an empty record is refused"
fi

# ---------------------------------------------------------------------------
group 'the sibling scripts parse, under the shell the VPS has'

# rollback.sh and status.sh are part of the deploy path and are written in bash,
# so a syntax error in either is a deploy-path failure. They are checked here
# rather than only in review because nothing else in either CI gate ever loads
# them. `bash -n` does not execute, so this needs nothing but the interpreter.
for sibling in rollback.sh status.sh; do
    path="${SCRIPT_DIR}/${sibling}"
    if [ ! -f "$path" ]; then
        bad "${sibling} exists" "the file" "missing"
        continue
    fi
    if bash -n "$path" 2>/dev/null; then
        ok "${sibling} parses"
    else
        bad "${sibling} parses" "no syntax error" "$(bash -n "$path" 2>&1 | head -1)"
    fi
done

# They source deploy.sh rather than copying from it. A copy of the
# component-to-variable mapping is how the two drift, and the drift is invisible
# until a rollback restores the wrong front ends.
for sibling in rollback.sh status.sh; do
    if grep -q 'FIXMATE_SOURCE_ONLY=1 . "${SCRIPT_DIR}/deploy.sh"' "${SCRIPT_DIR}/${sibling}"; then
        ok "${sibling} sources deploy.sh instead of copying it"
    else
        bad "${sibling} reuses deploy.sh" "FIXMATE_SOURCE_ONLY source" "not found"
    fi
done

# And the source guard has to be a return, not an exit. An `exit` there would
# take the sourcing script down with it, so `bash rollback.sh` would work and
# sourcing would silently kill the caller.
guard_line="$(grep -n 'FIXMATE_SOURCE_ONLY' "$DEPLOY_SCRIPT" | head -1 | cut -d: -f1)"
next_few="$(sed -n "$((guard_line + 1)),$((guard_line + 2))p" "$DEPLOY_SCRIPT" | tr -d '[:space:]')"
[ "$next_few" = "return0fi" ] \
    && ok "the source guard returns rather than exits" \
    || bad "the source guard" "return 0 / fi" "got: $next_few"

# ---------------------------------------------------------------------------
printf '\n\033[1m%d passed, %d failed\033[0m\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
