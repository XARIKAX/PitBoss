import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT = process.env.PINATA_JWT;

if (!JWT) {
  console.error('Set PINATA_JWT environment variable first');
  process.exit(1);
}

const dir = path.join(__dirname, 'pitbosses/images');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
console.log('Uploading', files.length, 'images...');

const formData = new FormData();
for (const f of files) {
  const buf = fs.readFileSync(path.join(dir, f));
  formData.append('file', new Blob([buf], { type: 'image/png' }), 'pitbosses-images/' + f);
}
formData.append('pinataMetadata', JSON.stringify({ name: 'pitbosses-images' }));

const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + JWT },
  body: formData,
});
const result = await res.json();
console.log('IMAGES CID:', result.IpfsHash || JSON.stringify(result));
