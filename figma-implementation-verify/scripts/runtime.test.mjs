import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { chromium } from "playwright-core";

import { createDraft, featurePaths } from "./core.mjs";

const chromePath = process.env.FIGMA_VERIFY_CHROME_PATH;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:20px;font-family:Arial}.card{width:320px;height:180px;padding:20px;border:1px solid #ddd;border-radius:16px;background:#fff}.title{font-size:20px;font-weight:700;color:rgb(15, 23, 42)}</style></head><body><section class="card" data-card><div class="title">Sales overview</div></section></body></html>`;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function buildProject() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "figma-verifier-runtime-"));
  const featureDir = path.join(rootDir, "docs/design/demo");
  fs.mkdirSync(path.join(featureDir, "snapshots"), { recursive: true });
  const serverPath = path.join(rootDir, "server.mjs");
  fs.writeFileSync(serverPath, `import http from "node:http";\nconst html = ${JSON.stringify(html)};\nconst port = Number(process.env.PORT);\nhttp.createServer((_req,res)=>{res.writeHead(200,{"content-type":"text/html"});res.end(html)}).listen(port,"127.0.0.1");\n`);
  fs.writeFileSync(path.join(featureDir, "implementation-spec.md"), "# Implementation Spec\n");

  const baselineServer = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(html);
  });
  const baselinePort = await listen(baselineServer);
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${baselinePort}`);
    await page.locator("[data-card]").screenshot({ path: path.join(featureDir, "snapshots/default.png") });
    await context.close();
  } finally {
    await browser.close();
    await close(baselineServer);
  }
  fs.writeFileSync(path.join(featureDir, "snapshots/default.json"), `${JSON.stringify({
    id: "default",
    image_path: "snapshots/default.png",
    required: "yes",
    original_width: 320,
    original_height: 180,
    figma_node_id: "1:2",
  }, null, 2)}\n`);

  execFileSync("git", ["init"], { cwd: rootDir });
  execFileSync("git", ["config", "user.email", "prototype@example.com"], { cwd: rootDir });
  execFileSync("git", ["config", "user.name", "Prototype"], { cwd: rootDir });
  execFileSync("git", ["add", "."], { cwd: rootDir });
  execFileSync("git", ["commit", "-m", "fixture"], { cwd: rootDir });
  return { rootDir, featureDir };
}

test("CLI seal, verify, and check produce tamper-evident PASS evidence", { skip: !chromePath }, async () => {
  const { rootDir, featureDir } = await buildProject();
  const probe = http.createServer();
  const port = await listen(probe);
  await close(probe);

  const { draft } = createDraft(rootDir, "demo");
  draft.runtime.start_command = `PORT=${port} node server.mjs`;
  draft.runtime.base_url = `http://127.0.0.1:${port}`;
  draft.platform.browser_executable = chromePath;
  draft.guardrails.calibrated = true;
  draft.scenarios[0].route = "/";
  draft.scenarios[0].target.locator.value = "[data-card]";
  draft.scenarios[0].assertions[0].target.value = "[data-card]";
  draft.scenarios[0].assertions.push({
    id: "title-text",
    type: "text",
    target: { by: "css", value: ".title" },
    expected: "Sales overview",
    source: "ui-understanding.md",
  });
  const paths = featurePaths(rootDir, "demo");
  fs.writeFileSync(paths.draftPath, `${JSON.stringify(draft, null, 2)}\n`);
  const cliPath = new URL("./figma-implementation-verify.mjs", import.meta.url);
  const cli = (command, extra = []) => execFileSync(process.execPath, [cliPath.pathname, command, "--root", rootDir, "--feature", "demo", ...extra], {
    cwd: rootDir,
    encoding: "utf8",
  });
  assert.match(cli("seal", ["--approved-by", "user"]), /sealed:/);
  assert.match(cli("verify"), /outcome: PASS/);
  assert.match(cli("check"), /outcome: PASS/);
  const result = JSON.parse(fs.readFileSync(paths.resultPath, "utf8"));
  assert.equal(result.outcome, "PASS");
  assert.equal(result.scenarios[0].baseline_one.ratio, 0);
  assert.equal(result.scenarios[0].baseline_two.ratio, 0);
  assert.equal(result.scenarios[0].stability.ratio, 0);
  assert.ok(result.scenarios[0].assertions_one.every((item) => item.status === "pass"));
  fs.appendFileSync(paths.reportPath, "\nmanual edit\n");
  assert.throws(() => cli("check"), (error) => error.status === 3 && error.stderr.includes("edited or is stale"));
});
