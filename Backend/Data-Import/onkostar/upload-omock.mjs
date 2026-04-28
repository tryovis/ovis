import { readFile } from 'node:fs/promises';

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

let body;
try {
  body = await readFile(file);
} catch (error) {
  console.error(`Failed to read ${file}: ${error.message}`);
  process.exit(1);
}

for (let attempt = 1; attempt <= 60; attempt += 1) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json'
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
