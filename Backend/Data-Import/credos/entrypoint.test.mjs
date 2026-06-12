import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function withTempDir(callback) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "credos-entrypoint-"));

  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function runEntrypoint({ cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn("sh", [path.join(__dirname, "entrypoint.sh")], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", code => {
      resolve({ code, stdout, stderr });
    });
  });
}

test("passes configured heap only to the CREDOS importer node process", async () => {
  await withTempDir(async dir => {
    const binDir = path.join(dir, "bin");
    const inputDir = path.join(dir, "input");
    const sharedDir = path.join(dir, "shared");
    const logPath = path.join(dir, "node-args.log");
    const outputPath = path.join(sharedDir, "omock.json");

    await fs.mkdir(binDir);
    await fs.mkdir(inputDir);
    await fs.mkdir(sharedDir);

    await fs.writeFile(
      path.join(binDir, "node"),
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "${logPath}"\ncase "$*" in\n  *credosImporter.mjs*) printf '{"patient":[]}\\n' > "${outputPath}" ;;\nesac\nexit 0\n`,
      "utf8"
    );
    await fs.chmod(path.join(binDir, "node"), 0o755);
    await fs.writeFile(path.join(binDir, "tail"), "#!/bin/sh\nexit 0\n", "utf8");
    await fs.chmod(path.join(binDir, "tail"), 0o755);

    const result = await runEntrypoint({
      cwd: dir,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        OVIS_OMOCK_FILE: path.join(inputDir, "missing-omock.json"),
        CREDOS_EXPORT_DIR: path.join(inputDir, "CREDOSExportFiles"),
        CREDOS_OMOCK_OUTPUT: outputPath,
        OVIS_PREPROCESSOR_URL: "http://preprocessor.invalid/omock",
        CREDOS_IMPORTER_NODE_HEAP_MB: "777"
      }
    });

    assert.equal(result.code, 0, result.stderr);

    const nodeInvocations = (await fs.readFile(logPath, "utf8"))
      .trim()
      .split("\n");

    assert.deepEqual(nodeInvocations, [
      `credosImportMode.mjs validate ${path.join(inputDir, "CREDOSExportFiles")}`,
      "--max-old-space-size=777 credosImporter.mjs",
      "upload-omock.mjs"
    ]);
  });
});
