import 'module-alias/register';
import express, { type Request, type Response, type NextFunction } from 'express';
import compression from 'compression';
import { BlockBlobTier } from '@azure/storage-blob';
import { applog, readFile } from '@/lib/utils';
import BlobApi from '@/lib/blob-api';

const port = process.env.PORT || 3000;
const containerName = 'devcontainer0';
const app = express();

app.use(compression());

function asyncHandler(controller: (req: Request, res: Response) => Promise<void>) {
   return async (req: Request, res: Response, next: NextFunction) => {
      try {
         await controller(req, res);
      } catch (error) {
         console.error('Error in asyncHandler:', error);
         res.status(500).json({ error: 'Something went wrong' });
         res.end();
      } finally {
         next();
      }
   };
}

app.get('/list-containers', asyncHandler(async (req, res) => {
   await BlobApi.listContainers();
   res.json({ message: 'Check the logs' });
   res.end();
}));

app.get('/create-container', asyncHandler(async (req, res) => {
   await BlobApi.createContainer({ containerName });
   res.json('Check the logs');
}));

app.get('/delete-container', asyncHandler(async (req, res) => {
   await BlobApi.deleteContainer({ containerName });
   res.json('Check the logs');
}));

app.get('/upload-blob', asyncHandler(async (req, res) => {
   const body = readFile('cool-dog.jpg');
   if (!body) {
      applog('No data');
      res.json('No data');
      return;
   }
   await BlobApi.uploadBlob({
      containerName,
      blobName: 'cool-dog',
      body,
      options: {
         tier: BlockBlobTier.Hot,
         blobHTTPHeaders: {
            blobContentType: 'image/jpeg'
         },
         metadata: {
            filename: 'cool-dog.jpg',
         },
      }
   });
   res.json('Check the logs');
}));

app.get('/list-blobs', asyncHandler(async (req, res) => {
   await BlobApi.listBlobs({ containerName });
   res.json('Check the logs');
}));

app.get('/download-blob/:blobName', asyncHandler(async (req, res) => {
   const { blobName } = req.params;
   if (!blobName) throw new Error('Blob name is required');
   const download = await BlobApi.getBlobBuffer({ containerName, blobName });
   const filename = download.metadata?.filename || blobName;
   const contentType = download.contentType || download.metadata?.contentType || 'application/octet-stream';
   res
      .attachment(filename)
      .type(contentType)
      .send(download.buffer);
}));

app.get('/blob/:blobName', asyncHandler(async (req, res) => {
   const { blobName } = req.params;
   if (!blobName) throw new Error('Blob name is required');
   const download = await BlobApi.getBlobBufferStream({ containerName, blobName });
   const filename = download.metadata?.filename || blobName;
   const contentType = download.contentType || download.metadata?.contentType || 'application/octet-stream';
   res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"`,
   });
   if (download.bufferStream) {
      download.bufferStream.pipe(res, { end: true });
      download.bufferStream.on('end', () => {
         res.end();
      });
   } else {
      res.end();
   }
}));

app.get('/', async (req, res) => {

   res.type('html').send(`
<!DOCTYPE html>
<html lang="en">
<head>
   <meta charset="UTF-8">
   <meta name="viewport" content="width=device-width, initial-scale=1.0">
   <title>express-blob-storage</title>
</head>
<body>
   <style>
      ul > li { margin: 10px 0; }
   </style>
   <h1>express-blob-storage</h1>
   <ul>
      <li><button type="button" onclick="apiFetch('/list-containers')">list containers</a></li>
      <li><button type="button" onClick="apiFetch('/create-container')">create container</a></li>
      <li><button type="button" onClick="apiFetch('/delete-container')">delete container</a></li>
      <li><button type="button" onClick="apiFetch('/upload-blob')">upload blob</a></li>
      <li><button type="button" onClick="apiFetch('/list-blobs')">list blobs</a></li>
      <li><button type="button" onClick="apiFetch('/blob/cool-dog')">blob</a></li>
      <li><button type="button" onClick="apiFetch('/download-blob/cool-dog')">download blob</a></li>
   </ul>
   <script>
      function apiFetch(url) { 
         fetch(url)
            .then(res => res.json())
            .then(data => console.log(data))
            .catch(err => console.error(err));
      }
   </script>
</body>
</html>
   `);
});


var server = (function () {
   // initialize BlobApi
   const storageAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
   if (!storageAccountName) throw new Error('AZURE_STORAGE_ACCOUNT_NAME is required');
   new BlobApi({ storageAccountName });
   // start server
   return app.listen(port, () => {
      console.log(`Server started 🚀`);
      console.log(`url: http://localhost:${port}`);
      console.log(`env: ${process.env.NODE_ENV}`);
   });
})();

export default server;