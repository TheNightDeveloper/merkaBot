"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDb = createDb;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const sql_js_1 = require("drizzle-orm/sql-js");
const sql_js_2 = __importDefault(require("sql.js"));
const schema = __importStar(require("./schema"));
async function createDb(config) {
    const absolutePath = node_path_1.default.resolve(config.sqlitePath);
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(absolutePath), { recursive: true });
    const SQL = await (0, sql_js_2.default)({
        locateFile: (file) => require.resolve(`sql.js/dist/${file}`)
    });
    const existing = node_fs_1.default.existsSync(absolutePath) ? node_fs_1.default.readFileSync(absolutePath) : undefined;
    const sqlite = existing ? new SQL.Database(existing) : new SQL.Database();
    const db = (0, sql_js_1.drizzle)(sqlite, { schema });
    const persist = async () => {
        const data = sqlite.export();
        await node_fs_1.default.promises.writeFile(absolutePath, Buffer.from(data));
    };
    return {
        db,
        sqlite,
        persist,
        close: async () => {
            await persist();
            sqlite.close();
        }
    };
}
