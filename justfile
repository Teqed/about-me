default:
    @just --list

dev *args:
    wrangler dev {{ args }}

check: csp
    biome check

fmt:
    biome check --write

deploy: check
    wrangler deploy

csp:
    #!/usr/bin/env node
    const fs = require("node:fs");
    const script = fs.readFileSync("static/index.html", "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];
    const hash = `'sha256-${require("node:crypto").createHash("sha256").update(script).digest("base64")}'`;
    if (!fs.readFileSync("static/_headers", "utf8").includes(hash)) {
      console.error(`static/_headers: script-src needs ${hash} for the inline script in index.html`);
      process.exit(1);
    }

[working-directory('feed')]
feed-fmt:
    biome check --write .

[working-directory('feed')]
feed-check:
    wrangler types > /dev/null
    tsc -p .
    biome check .
    node --test 'test/*.test.ts'

[working-directory('feed')]
feed-dev *args:
    wrangler dev --test-scheduled {{ args }}

[working-directory('feed')]
feed-deploy: feed-check
    wrangler deploy
