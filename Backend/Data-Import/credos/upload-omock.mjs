import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { Readable } from "node:stream";

const file = process.env.OMOCK_TO_UPLOAD;
const url = process.env.OVIS_PREPROCESSOR_URL;
const uploadTimeoutMs = Number.parseInt(process.env.OVIS_UPLOAD_TIMEOUT_MS || "30000", 10);

if (!file) {
  console.error("OMOCK_TO_UPLOAD is not set");
  process.exit(1);
}

if (!url) {
  console.error("OVIS_PREPROCESSOR_URL is not set");
  process.exit(1);
}

let fileStat;
try {
  fileStat = await stat(file);
} catch (error) {
  console.error(`Failed to stat ${file}: ${error.message}`);
  process.exit(1);
}

if (!fileStat.isFile() || fileStat.size === 0) {
  console.error(`Failed to read ${file}: file is empty`);
  process.exit(1);
}

try {
  const handle = await open(file, "r");
  try {
    const sample = Buffer.alloc(Math.min(fileStat.size, 4096));
    const { bytesRead } = await handle.read(sample, 0, sample.length, 0);
    const firstNonWhitespace = sample.subarray(0, bytesRead).toString("utf8").match(/\S/)?.[0];
    if (firstNonWhitespace !== "{") {
      console.error(`Failed to validate ${file}: expected a JSON object`);
      process.exit(1);
    }
  } finally {
    await handle.close();
  }
} catch (error) {
  console.error(`Failed to validate ${file}: ${error.message}`);
  process.exit(1);
}

for (let attempt = 1; attempt <= 60; attempt += 1) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), uploadTimeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      body: Readable.toWeb(createReadStream(file)),
      duplex: "half",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "content-length": String(fileStat.size)
      }
    });

    if (response.ok) {
      console.log("CREDOS omock.json uploaded");
      process.exit(0);
    }

    console.error(`Upload attempt ${attempt} failed: HTTP ${response.status}`);
  } catch (error) {
    console.error(`Upload attempt ${attempt} failed: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }

  await new Promise(resolve => setTimeout(resolve, 2000));
}

console.error("ERROR: Failed to upload CREDOS omock.json after 60 attempts");
process.exit(1);
