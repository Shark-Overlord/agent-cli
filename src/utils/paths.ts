import {access, realpath} from "node:fs/promises";
import {homedir} from "node:os";
import {
    dirname,
    isAbsolute,
    relative,
    resolve,
    sep
} from "node:path";

export function expandHome(filePath: string): string {
    if (filePath === "~") {
        return homedir();
    }

    if (filePath.startsWith(`~${sep}`) || filePath.startsWith("~/")) {
        return resolve(homedir(), filePath.slice(2));
    }

    return filePath;
}

export function resolvePath(filePath: string, cwd: string): string {
    const expanded = expandHome(filePath);
    return isAbsolute(expanded)
        ? resolve(expanded)
        : resolve(cwd, expanded);
}

function isInside(root: string, candidate: string): boolean {
    const rel = relative(root, candidate);
    return rel === "" || (
        rel !== ".." &&
        !rel.startsWith(`..${sep}`) &&
        !isAbsolute(rel)
    );
}

async function closestExistingPath(filePath: string): Promise<string> {
    let current = filePath;

    while (true) {
        try {
            await access(current);
            return current;
        } catch (error: unknown) {
            const parent = dirname(current);
            if (parent === current) {
                throw error;
            }
            current = parent;
        }
    }
}

/**
 * Resolve a user supplied path and ensure that it stays inside cwd.
 * realpath() also prevents an in-project symbolic link from escaping cwd.
 */
export async function validatePath(
    filePath: string,
    cwd: string
): Promise<string> {
    const lexicalRoot = resolve(cwd);
    const resolved = resolvePath(filePath, lexicalRoot);

    if (!isInside(lexicalRoot, resolved)) {
        throw new Error(
            `Path "${filePath}" resolves outside the working directory`
        );
    }

    const realRoot = await realpath(lexicalRoot);
    const existingPath = await closestExistingPath(resolved);
    const realExistingPath = await realpath(existingPath);

    if (!isInside(realRoot, realExistingPath)) {
        throw new Error(
            `Path "${filePath}" escapes the working directory through a symbolic link`
        );
    }

    return resolved;
}
