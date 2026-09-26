# QuickMusic's own recipes, imported by the shared justfile.

# List the MPRIS players on this session bus through modules/mpris.js
mpris-check:
    gjs -m scripts/mpris-check.js

# Put a fake MPRIS player on the session bus, for trying the extension by hand
fake-player:
    gjs -m scripts/fake-player.js

# Needs a real session bus with players on it, so it never runs in CI.
# Run by test-live after the shared checks: probe the live players
live-extra: mpris-check
