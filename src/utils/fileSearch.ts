import {opendir, stat} from "node:fs/promises";
import {basename, relative} from "node:path";

const SKIPPED_DIRECTORIES = new Set([".git", "node_modules"]);

function escapeRegex(character: string): string {
    return /[\\^$.*+?()[\]{}|]/.test(character)
        ? `\\${character}`
        : character;
}

export function globToRegExp(pattern: string): RegExp {
    const normalized = pattern.replace(/\\/g, "/");
    let source = "^";

    for (let index = 0; index < normalized.length; index++) {
        const character = normalized[index];

        if (character === "*") {
            const isDoubleStar = normalized[index + 1] === "*";
            if (isDoubleStar) {
                index++;
                if (normalized[index + 1] === "/") {
                    index++;
                    source += "(?:.*/)?";
                } else {
                    source += ".*";
                }
            } else {
                source += "[^/]*";
            }
        } else if (character === "?") {
            source += "[^/]";
        } else {
            source += escapeRegex(character);
        }
    }

    return new RegExp(`${source}$`);
}

export function matchesGlob(filePath: string, pattern: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, "/");
    const matcher = globToRegExp(pattern);
    return matcher.test(normalizedPath) || matcher.test(basename(normalizedPath));
}

export async function* walkFiles(
    rootPath: string,
    abortSignal?: AbortSignal
): AsyncGenerator<string> {
    abortSignal?.throwIfAborted();

    const rootStat = await stat(rootPath);
    if (rootStat.isFile()) {
        yield rootPath;
        return;
    }

    const directory = await opendir(rootPath);
    const entries = [];
    for await (const entry of directory) {
        entries.push(entry);
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
        abortSignal?.throwIfAborted();
        const entryPath = `${rootPath}/${entry.name}`;

        if (entry.isDirectory()) {
            if (!SKIPPED_DIRECTORIES.has(entry.name)) {
                yield* walkFiles(entryPath, abortSignal);
            }
        } else if (entry.isFile()) {
            yield entryPath;
        }
    }
}

export function displayPath(filePath: string, cwd: string): string {
    const rel = relative(cwd, filePath);
    return (rel || ".").replace(/\\/g, "/");
}
