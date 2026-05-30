"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addDays = addDays;
function addDays(base, days) {
    return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}
