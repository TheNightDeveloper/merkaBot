"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withoutUndefined = withoutUndefined;
function withoutUndefined(value) {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    return Object.fromEntries(entries);
}
