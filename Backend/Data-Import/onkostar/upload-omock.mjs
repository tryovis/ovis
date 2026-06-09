import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

const file = process.env.OMOCK_TO_UPLOAD;
const url = process.env.OVIS_PREPROCESSOR_URL;

if (!file) {
  console.error('OMOCK_TO_UPLOAD is not set');
  process.exit(1);
}

if (!url) {
  console.error('OVIS_PREPROCESSOR_URL is not set');
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
  console.error(`Failed to upload ${file}: file is missing or empty`);
  process.exit(1);
}

for (let attempt = 1; attempt <= 60; attempt += 1) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: Readable.toWeb(createReadStream(file)),
      duplex: 'half',
      headers: {
        'content-type': 'application/json',
        'content-length': String(fileStat.size)
      }
    });

    if (response.ok) {
      console.log('ONKOSTAR omock.json uploaded');
      process.exit(0);
    }

    console.error(`Upload attempt ${attempt} failed: HTTP ${response.status}`);
  } catch (error) {
    console.error(`Upload attempt ${attempt} failed: ${error.message}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));
}

console.error('ERROR: Failed to upload ONKOSTAR omock.json after 60 attempts');
process.exit(1);
