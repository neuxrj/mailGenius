import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let client: Client;
let transport: StdioClientTransport;
let dbPath = "";

before(async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    dbPath = path.join(repoRoot, "gmail.sqlite");
    await access(dbPath);

    transport = new StdioClientTransport({
        command: process.execPath,
        args: ["--import", "tsx", "mcp/mcp.ts"],
        cwd: process.cwd(),
        env: { GMAIL_DB_PATH: dbPath },
        stderr: "pipe",
    });

    client = new Client({ name: "mcp-test", version: "1.0.0" });
    await client.connect(transport);
});

after(async () => {
    await client?.close();
});

test("lists MCP tools", async () => {
    const { tools } = await client.listTools();
    const toolNames = tools.map((tool) => tool.name);

    assert.ok(toolNames.includes("gmail_query"));
    assert.ok(toolNames.includes("gmail_query_by_date"));
    assert.ok(toolNames.includes("gmail_query_by_sender"));
    assert.ok(toolNames.includes("gmail_query_by_keyword"));
    assert.ok(toolNames.includes("gmail_query_unread"));
    assert.ok(toolNames.includes("gmail_query_by_subject"));
    assert.ok(toolNames.includes("gmail_query_by_recipient"));
});

test("calls gmail_query_unread", async () => {
    const result = await client.callTool({
        name: "gmail_query_unread",
        arguments: {},
    });

    assert.equal(result.isError, undefined);
    assert.ok(result.content?.[0]?.type === "text");

    const text = result.content?.[0]?.text ?? "";
    console.log(text);
    assert.ok(text.startsWith("Summary for unread emails"));
});
