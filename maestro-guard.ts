import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const COCKPIT_FILE = "cockpit.json";
const COCKPIT_KEY = "ambientWorkingMessage";

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
