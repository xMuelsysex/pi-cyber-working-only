import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ensureCockpitDeferred, ensureCockpitPatched } from "../maestro-guard.ts";

const OLD_CALL = "ctx.ui.setWorkingMessage(workingMessage(state, now));";
const AMBIENT_CALL =
  "ambientSurfaces.setWorkingMessage((message) => ctx.ui.setWorkingMessage(message), workingMessage(state, now));";
const GUARD_MARK = "cyber-guard: ambient working message slot";
const ENV_AGENT_DIR = "PI_CODING_AGENT_DIR";

async function withAgentDir(run: (agentDir: string) => Promise<void>): Promise<void> {
  const agentDir = await mkdtemp(join(tmpdir(), "pi-cyber-guard-"));
  const previous = process.env[ENV_AGENT_DIR];
  process.env[ENV_AGENT_DIR] = agentDir;
  try {
    await run(agentDir);
  } finally {
    if (previous === undefined) delete process.env[ENV_AGENT_DIR];
    else process.env[ENV_AGENT_DIR] = previous;
    await rm(agentDir, { recursive: true, force: true });
  }
}

async function createCockpitFixture(agentDir: string, call: string): Promise<string> {
  const srcDir = join(agentDir, "npm", "node_modules", "pi-cockpit", "src");
  await mkdir(srcDir, { recursive: true });
  await Promise.all([
    writeFile(
      join(srcDir, "index.ts"),
      `function refreshAmbient() {\n\ttry {\n\t\t\t${call}\n\t}\n}\n`,
      "utf8",
    ),
    writeFile(
      join(srcDir, "types.ts"),
      "interface CockpitConfig {\n\tsidebar: SidebarConfig;\n}\n\nconst DEFAULT_CONFIG = {\n\tsidebar: { mode: \"off\", width: 40, density: \"comfortable\" },\n};\n",
      "utf8",
    ),
    writeFile(
      join(srcDir, "config.ts"),
      "\treturn {\n\t\ticons: { mode: iconsRaw && isIconMode(iconsRaw.mode) ? iconsRaw.mode : base.icons.mode },\n\t};\n",
      "utf8",
    ),
    writeFile(join(agentDir, "cockpit.json"), '{"enabled":true,"custom":"keep"}\n', "utf8"),
  ]);
  return srcDir;
}

test("keeps cockpit from writing the working slot for old and ambient surface paths", { concurrency: false }, async () => {
  for (const call of [OLD_CALL, AMBIENT_CALL]) {
    await withAgentDir(async (agentDir) => {
      const srcDir = await createCockpitFixture(agentDir, call);
      ensureCockpitDeferred();
      ensureCockpitPatched();

      const indexPath = join(srcDir, "index.ts");
      const typesPath = join(srcDir, "types.ts");
      const configPath = join(srcDir, "config.ts");
      const index = await readFile(indexPath, "utf8");
      const types = await readFile(typesPath, "utf8");
      const config = await readFile(configPath, "utf8");
      const cockpit = JSON.parse(await readFile(join(agentDir, "cockpit.json"), "utf8")) as Record<string, unknown>;

      assert.match(index, new RegExp(`if \\(config\\.ambientWorkingMessage\\)`));
      assert.equal(index.split(GUARD_MARK).length - 1, 1);
      assert.equal(index.split(call).length - 1, 1);
      assert.match(types, /ambientWorkingMessage: boolean;/);
      assert.match(types, /ambientWorkingMessage: true,/);
      assert.match(config, /ambientWorkingMessage: typeof o\.ambientWorkingMessage === "boolean"/);
      assert.equal(cockpit.ambientWorkingMessage, false);
      assert.equal(cockpit.custom, "keep");

      const snapshot = { index, types, config };
      ensureCockpitDeferred();
      ensureCockpitPatched();
      assert.deepEqual(
        {
          index: await readFile(indexPath, "utf8"),
          types: await readFile(typesPath, "utf8"),
          config: await readFile(configPath, "utf8"),
        },
        snapshot,
      );
    });
  }
});

test("leaves an absent cockpit config untouched", { concurrency: false }, async () => {
  await withAgentDir(async (agentDir) => {
    ensureCockpitDeferred();
    assert.equal(await readFile(join(agentDir, "cockpit.json"), "utf8").catch(() => undefined), undefined);
  });
});
