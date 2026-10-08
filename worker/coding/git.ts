import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { cliHome } from "./config";
import { ProjectFiles } from "./files";
const exec = promisify(execFile);
export class ProjectGit {
  constructor(
    readonly files: ProjectFiles,
    readonly approve: (text: string, signal: AbortSignal) => Promise<boolean>,
  ) {}
  async command(args: string[], signal?: AbortSignal) {
    const hooks = process.platform === "win32" ? "NUL" : "/dev/null";
    const result = await exec(
      "git",
      [
        "--no-optional-locks",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.hooksPath=" + hooks,
        "-c",
        "commit.gpgsign=false",
        "--literal-pathspecs",
        ...args,
      ],
      { cwd: this.files.root, timeout: 30000, maxBuffer: 1000000, signal },
    );
    return result.stdout;
  }
  async stage(paths: string[], signal: AbortSignal, unstage = false) {
    if (
      !Array.isArray(paths) ||
      !paths.length ||
      paths.length > 100 ||
      paths.some((p) => typeof p !== "string")
    )
      throw new Error("Choose 1–100 relative file paths");
    for (const p of paths) await this.files.location(p);
    if (
      !(await this.approve(
        (unstage ? "Unstage" : "Stage") + " these paths:\n" + paths.join("\n"),
        signal,
      ))
    )
      throw new Error("Git change denied");
    signal.throwIfAborted();
    for (const p of paths) await this.files.location(p);
    return this.command(
      unstage
        ? ["restore", "--staged", "--", ...paths]
        : ["add", "--", ...paths],
      signal,
    );
  }
  async commit(message: string, signal: AbortSignal) {
    if (typeof message !== "string" || !message.trim() || message.length > 4000)
      throw new Error("Provide a commit message under 4000 characters");
    const names = (
      await this.command(["diff", "--cached", "--name-only", "-z"], signal)
    )
      .split("\0")
      .filter(Boolean);
    if (!names.length) throw new Error("No staged files");
    for (const name of names) await this.files.location(name);
    const diff = await this.command(
      ["diff", "--cached", "--no-ext-diff", "--no-textconv"],
      signal,
    );
    if (diff.length > 60000)
      throw new Error(
        "Staged diff exceeds review limit; commit smaller groups",
      );
    const before = await this.command(["write-tree"], signal);
    if (
      !(await this.approve(
        "Commit staged changes with hooks and signing disabled?\n\n" +
          message +
          "\n\n" +
          diff,
        signal,
      ))
    )
      throw new Error("Commit denied");
    if ((await this.command(["write-tree"], signal)) !== before)
      throw new Error("Staged files changed during review");
    return this.command(
      ["commit", "--no-verify", "--no-gpg-sign", "-m", message],
      signal,
    );
  }
  async worktree(branch: string, signal: AbortSignal) {
    if (
      typeof branch !== "string" ||
      !/^[-a-zA-Z0-9][-_a-zA-Z0-9/]{0,79}$/.test(branch) ||
      branch.startsWith("-") ||
      branch.includes("//")
    )
      throw new Error("Invalid branch name");
    await this.command(["check-ref-format", "--branch", branch], signal);
    const parent = path.join(
        cliHome(),
        "worktrees",
        this.files.store.projectId,
      ),
      target = path.join(parent, crypto.randomUUID());
    if (
      !(await this.approve(
        "Create an isolated Git worktree on new branch " +
          branch +
          "?\n" +
          target,
        signal,
      ))
    )
      throw new Error("Worktree denied");
    await mkdir(parent, { recursive: true, mode: 0o700 });
    await this.command(
      ["worktree", "add", "-b", branch, target, "HEAD"],
      signal,
    );
    return { path: target, branch };
  }
}
