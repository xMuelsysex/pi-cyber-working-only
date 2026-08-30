import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const COCKPIT_FILE = "cockpit.json";
const COCKPIT_KEY = "ambientWorkingMessage";
const GUARD_MARK = "cyber-guard: ambient working message slot";

/**
 * pi-cockpit (companion package of pi-maestro-flow) periodically writes the
 * working message by default, stealing cyber's display slot. This guard keeps
 * cockpit.json's ambientWorkingMessage false — touching only that field and
 * preserving the user's other settings — so cyber stays effective even after
 * reinstalls or environment changes.
 */
export function ensureCockpitDeferred(): void {
  try {
    const path = join(getAgentDir(), COCKPIT_FILE);
    if (!existsSync(path)) return;
    let doc: unknown;
    try {
      doc = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      // Corrupt config: do not overstep, leave as-is.
      return;
    }
    if (typeof doc !== "object" || doc === null || Array.isArray(doc)) return;
    const config = doc as Record<string, unknown>;
    if (config[COCKPIT_KEY] === false) return;
    config[COCKPIT_KEY] = false;
    writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf8");
  } catch {
    // Self-heal failure must not break cyber itself.
  }
}

/**
 * Cockpit 0.12+ removed the ambientWorkingMessage config key (upstream), so the
 * config guard alone stops working after an upgrade. Re-inject the guard into
 * cockpit's source: wrap the ambient working-message write (legacy direct or
 * newer AmbientSurface call) so the slot stays free when cockpit.json sets
 * ambientWorkingMessage false, and restore the type/merge plumbing for that
 * key. Idempotent via GUARD_MARK; skips entirely when the file is absent or
 * already patched.
 */
export function ensureCockpitPatched(): void {
  try {
    const srcDir = join(getAgentDir(), "npm", "node_modules", "pi-cockpit", "src");
    const indexPath = join(srcDir, "index.ts");
    if (!existsSync(indexPath)) return;
    let index = readFileSync(indexPath, "utf8");
    if (index.includes(GUARD_MARK)) return;
    const eol = index.includes("\r\n") ? "\r\n" : "\n";
    const calls = [
      `ctx.ui.setWorkingMessage(workingMessage(state, now));`,
      `ambientSurfaces.setWorkingMessage((message) => ctx.ui.setWorkingMessage(message), workingMessage(state, now));`,
    ];
    const call = calls.find((candidate) => index.includes(candidate));
    if (!call) return;
    const guarded = `${tab(3)}if (config.ambientWorkingMessage) {${eol}${tab(4)}${call}${eol}${tab(3)}}`;
    // The original line's leading tabs stay before the replaced text, so the
    // mark line must not carry its own indentation.
    index = index.replace(call, `// ${GUARD_MARK}${eol}${guarded}`);

    const typesPath = join(srcDir, "types.ts");
    if (existsSync(typesPath)) {
      let types = readFileSync(typesPath, "utf8");
      if (!types.includes(GUARD_MARK)) {
        const field = `${tab(1)}/** ${GUARD_MARK}. */${eol}${tab(1)}${COCKPIT_KEY}: boolean;`;
        if (types.includes(`${tab(1)}sidebar: SidebarConfig;`)) {
          types = types.replace(`${tab(1)}sidebar: SidebarConfig;`, `${tab(1)}sidebar: SidebarConfig;${eol}${field}`);
        }
        const def = `${tab(1)}${COCKPIT_KEY}: true,`;
        if (types.includes(`${tab(1)}sidebar: { mode: "off", width: 40, density: "comfortable" },`)) {
          types = types.replace(
            `${tab(1)}sidebar: { mode: "off", width: 40, density: "comfortable" },`,
            `${tab(1)}sidebar: { mode: "off", width: 40, density: "comfortable" },${eol}${def}`,
          );
        }
        writeFileSync(typesPath, types, "utf8");
      }
    }

    const configPath = join(srcDir, "config.ts");
    if (existsSync(configPath)) {
      let config = readFileSync(configPath, "utf8");
      if (!config.includes(GUARD_MARK)) {
        const merge = `${tab(2)}${COCKPIT_KEY}: typeof o.${COCKPIT_KEY} === "boolean"${eol}${tab(3)}? o.${COCKPIT_KEY}${eol}${tab(3)}: base.${COCKPIT_KEY},`;
        const anchor = `${tab(2)}icons: { mode: iconsRaw && isIconMode(iconsRaw.mode) ? iconsRaw.mode : base.icons.mode },`;
        if (config.includes(anchor)) {
          config = config.replace(anchor, `${anchor}${eol}${merge}`);
          writeFileSync(configPath, config, "utf8");
        }
      }
    }

    writeFileSync(indexPath, index, "utf8");
  } catch {
    // Patch failure must not break cyber itself.
  }
}

function tab(n: number): string {
  return "\t".repeat(n);
}
