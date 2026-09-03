import assert from "node:assert/strict";
import {
    mkdtemp,
    mkdir,
    readFile,
    rm,
    symlink,
    writeFile
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";

import {
    bashTool,
    isReadOnlyCommand,
    truncateOutput
} from "../src/tools/bashTool.js";
import {fileEditTool} from "../src/tools/fileEditTool.js";
import {fileReadTool} from "../src/tools/fileReadTool.js";
import {fileWriteTool} from "../src/tools/fileWriteTool.js";
import {globTool} from "../src/tools/globTool.js";
import {grepTool} from "../src/tools/grepTool.js";
import {getEnabledTools, getToolsApiParams} from "../src/tools/index.js";
import {validatePath} from "../src/utils/paths.js";

async function createWorkspace(t: test.TestContext): Promise<string> {
    const workspace = await mkdtemp(join(tmpdir(), "ownai-tools-"));
    t.after(async () => {
        await rm(workspace, {recursive: true, force: true});
    });
    return workspace;
}

test("the registry exposes all six tools and API schemas", () => {
    assert.deepEqual(
        getEnabledTools().map((tool) => tool.name),
        ["Read", "Write", "Edit", "Bash", "Grep", "Glob"]
    );
    assert.deepEqual(
        getToolsApiParams().map((schema) => schema.name),
        ["Read", "Write", "Edit", "Bash", "Grep", "Glob"]
    );
});

test("validatePath accepts project files and rejects parent traversal", async (t) => {
    const workspace = await createWorkspace(t);

    assert.equal(
        await validatePath("src/new.ts", workspace),
        join(workspace, "src", "new.ts")
    );
    await assert.rejects(
        validatePath("../outside.txt", workspace),
        /outside the working directory/
    );
});

test("validatePath rejects a symbolic link that escapes the project", async (t) => {
    const workspace = await createWorkspace(t);
    const outside = await mkdtemp(join(tmpdir(), "ownai-outside-"));
    t.after(async () => {
        await rm(outside, {recursive: true, force: true});
    });
    await writeFile(join(outside, "secret.txt"), "secret", "utf-8");
    await symlink(
        outside,
        join(workspace, "link"),
        process.platform === "win32" ? "junction" : "dir"
    );

    await assert.rejects(
        validatePath("link/secret.txt", workspace),
        /symbolic link/
    );
});

test("Write creates parent folders and reports later overwrites", async (t) => {
    const workspace = await createWorkspace(t);
    const context = {cwd: workspace};

    const created = await fileWriteTool.call({
        file_path: "src/hello.ts",
        content: "console.log('first');\n"
    }, context);
    assert.equal(created.content, "Created file: src/hello.ts");

    const updated = await fileWriteTool.call({
        file_path: "src/hello.ts",
        content: "console.log('second');\n"
    }, context);
    assert.equal(updated.content, "Updated file: src/hello.ts");
    assert.equal(
        await readFile(join(workspace, "src", "hello.ts"), "utf-8"),
        "console.log('second');\n"
    );
});

test("Read uses the shared project boundary", async (t) => {
    const workspace = await createWorkspace(t);
    const outsideFile = join(workspace, "..", "outside-ownai-test.txt");
    await writeFile(outsideFile, "secret", "utf-8");
    t.after(async () => {
        await rm(outsideFile, {force: true});
    });

    const result = await fileReadTool.call(
        {file_path: "../outside-ownai-test.txt"},
        {cwd: workspace}
    );
    assert.equal(result.isError, true);
    assert.match(result.content, /outside the working directory/);
});

test("Edit changes one unique occurrence and preserves unrelated curly quotes", async (t) => {
    const workspace = await createWorkspace(t);
    const filePath = join(workspace, "quotes.ts");
    await writeFile(
        filePath,
        "const title = “hello”;\nconst other = “stay”;\n",
        "utf-8"
    );

    const result = await fileEditTool.call({
        file_path: "quotes.ts",
        old_string: "const title = \"hello\";",
        new_string: "const title = \"world\";"
    }, {cwd: workspace});

    assert.equal(result.isError, undefined);
    assert.equal(
        await readFile(filePath, "utf-8"),
        "const title = \"world\";\nconst other = “stay”;\n"
    );
});

test("Edit refuses an ambiguous replacement without changing the file", async (t) => {
    const workspace = await createWorkspace(t);
    const filePath = join(workspace, "duplicate.txt");
    await writeFile(filePath, "same\nsame\n", "utf-8");

    const result = await fileEditTool.call({
        file_path: "duplicate.txt",
        old_string: "same",
        new_string: "changed"
    }, {cwd: workspace});

    assert.equal(result.isError, true);
    assert.match(result.content, /appears 2 times/);
    assert.equal(await readFile(filePath, "utf-8"), "same\nsame\n");
});

test("Edit also treats overlapping matches as ambiguous", async (t) => {
    const workspace = await createWorkspace(t);
    const filePath = join(workspace, "overlap.txt");
    await writeFile(filePath, "aaa", "utf-8");

    const result = await fileEditTool.call({
        file_path: "overlap.txt",
        old_string: "aa",
        new_string: "b"
    }, {cwd: workspace});

    assert.equal(result.isError, true);
    assert.match(result.content, /appears 2 times/);
    assert.equal(await readFile(filePath, "utf-8"), "aaa");
});

test("Bash captures output and marks a non-zero exit as an error", async (t) => {
    const workspace = await createWorkspace(t);
    await writeFile(
        join(workspace, "fail.cjs"),
        "process.exit(7);\n",
        "utf-8"
    );

    const version = await bashTool.call(
        {command: "node --version"},
        {cwd: workspace}
    );
    assert.equal(version.isError, false);
    assert.match(version.content, /^v\d+/);

    const failed = await bashTool.call(
        {command: "node fail.cjs"},
        {cwd: workspace}
    );
    assert.equal(failed.isError, true);
    assert.match(failed.content, /^Exit code: 7/);
});

test("read-only command detection is conservative for compound commands", () => {
    assert.equal(isReadOnlyCommand("git status && node --version"), true);
    assert.equal(isReadOnlyCommand("git status && npm install"), false);
    assert.equal(isReadOnlyCommand("cat package.json > copy.json"), false);
    assert.equal(isReadOnlyCommand("git branch --delete old"), false);
});

test("long Bash output keeps its beginning and end", () => {
    const output = `START${"x".repeat(40_000)}END`;
    const truncated = truncateOutput(output);

    assert.match(truncated, /^START/);
    assert.match(truncated, /END$/);
    assert.match(truncated, /truncated/);
});

test("Grep searches contents and Glob searches file paths", async (t) => {
    const workspace = await createWorkspace(t);
    await mkdir(join(workspace, "src"), {recursive: true});
    await writeFile(
        join(workspace, "src", "alpha.ts"),
        "export const needle = 1;\n",
        "utf-8"
    );
    await writeFile(
        join(workspace, "src", "beta.json"),
        "{\"needle\": 2}\n",
        "utf-8"
    );

    const grepResult = await grepTool.call({
        pattern: "needle",
        path: "src",
        include: "*.ts"
    }, {cwd: workspace});
    assert.equal(grepResult.isError, undefined);
    assert.match(grepResult.content, /alpha\.ts:1:.*needle/);
    assert.doesNotMatch(grepResult.content, /beta\.json/);

    const globResult = await globTool.call({
        pattern: "**/*.ts",
        path: "."
    }, {cwd: workspace});
    assert.equal(globResult.isError, undefined);
    assert.match(globResult.content, /src\/alpha\.ts/);
    assert.doesNotMatch(globResult.content, /beta\.json/);
});
