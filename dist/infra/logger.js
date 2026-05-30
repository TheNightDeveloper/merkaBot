"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
function log(level, message, meta) {
    const payload = {
        time: new Date().toISOString(),
        level,
        message,
        ...(meta ? { meta } : {})
    };
    const line = JSON.stringify(payload);
    if (level === "error") {
        console.error(line);
        return;
    }
    if (level === "warn") {
        console.warn(line);
        return;
    }
    console.log(line);
}
exports.logger = {
    info: (message, meta) => log("info", message, meta),
    warn: (message, meta) => log("warn", message, meta),
    error: (message, meta) => log("error", message, meta)
};
