import { clawbotPlugin } from "./src/channel.js";
import { assertHostCompatibility } from "./src/compat.js";
import { setClawbotRuntime } from "./src/runtime.js";
export default {
    id: "openclaw-zaloclawbot",
    name: "Zalo ClawBot",
    description: "Zalo ClawBot channel plugin (QR-onboarded personal bot)",
    register(api) {
        assertHostCompatibility(api.runtime?.version);
        if (api.runtime) {
            setClawbotRuntime(api.runtime);
        }
        api.registerChannel({ plugin: clawbotPlugin });
    },
};
