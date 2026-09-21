import os from "node:os";
import path from "node:path";
export function resolveStateDir() {
    return (process.env.OPENCLAW_STATE_DIR?.trim() ||
        path.join(os.homedir(), ".openclaw"));
}
export function resolveClawbotStateDir() {
    return path.join(resolveStateDir(), "openclaw-zaloclawbot");
}
