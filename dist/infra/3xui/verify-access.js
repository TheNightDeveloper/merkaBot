"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPanelAccess = verifyPanelAccess;
async function verifyPanelAccess(gateway) {
    await gateway.verifyAccess();
}
