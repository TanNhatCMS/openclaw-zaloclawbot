import { logger } from "./util/logger.js";
export const SUPPORTED_HOST_MIN = "2026.4.10";
export function parseOpenClawVersion(version) {
    const base = version.trim().split("-")[0];
    const parts = base.split(".");
    if (parts.length !== 3)
        return null;
    const [year, month, day] = parts.map(Number);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day))
        return null;
    return { year, month, day };
}
export function compareVersions(a, b) {
    for (const key of ["year", "month", "day"]) {
        if (a[key] < b[key])
            return -1;
        if (a[key] > b[key])
            return 1;
    }
    return 0;
}
export function isHostVersionSupported(hostVersion) {
    const host = parseOpenClawVersion(hostVersion);
    if (!host)
        return false;
    const min = parseOpenClawVersion(SUPPORTED_HOST_MIN);
    return compareVersions(host, min) >= 0;
}
export function assertHostCompatibility(hostVersion) {
    if (!hostVersion || hostVersion === "unknown") {
        logger.warn(`[compat] Unknown host version; skipping compatibility check.`);
        return;
    }
    if (isHostVersionSupported(hostVersion)) {
        logger.info(`[compat] Host OpenClaw ${hostVersion} >= ${SUPPORTED_HOST_MIN}, OK.`);
        return;
    }
    throw new Error(`openclaw-zaloclawbot requires OpenClaw >=${SUPPORTED_HOST_MIN}, but found ${hostVersion}.`);
}
