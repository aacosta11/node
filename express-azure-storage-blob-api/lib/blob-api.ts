import { applog, streamToBuffer, getContentLength, readFile } from '@/lib/utils';
import { DefaultAzureCredential } from '@azure/identity';
import {
   BlobServiceClient,
   HttpRequestBody,
   BlockBlobTier,
   type BlockBlobUploadOptions,
   type ContainerClient,
   type ContainerCreateResponse,
   type ContainerDeleteResponse,
   type BlockBlobClient,

} from '@azure/storage-blob';




interface BlobApi {
   storageAccountName: string;
   blobServiceClient: BlobServiceClient;
   containerClients: Record<string, ContainerClient>;

   constructor(args: { storageAccountName: string }): void;

   // private methods
   removeContainerClient(args: { containerName: string }): void;
   // public methods
   getContainerClient(args: { containerName: string }): ContainerClient;
   getBlobClient(args: { containerName: string, blobName: string }): BlockBlobClient;
   listContainers(): void;
   listBlobs(args: { containerName: string }): void;
   createContainer(args: { containerName: string }): ContainerCreateResponse;
   uploadBlob(args: { containerName: string, blobName: string, body: HttpRequestBody, options?: BlockBlobUploadOptions }): void;
   getBlobProperties(args: { containerName: string, blobName: string }): void;
   getBlobBufferStream(args: { containerName: string, blobName: string }): void;
   getBlobBuffer(args: { containerName: string, blobName: string }): void;
   deleteContainer(args: { containerName: string }): ContainerDeleteResponse;
   deleteBlob(args: { containerName: string, blobName: string }): void;
}

class BlobApi implements BlobApi {
   static storageAccountName: string;
   static blobServiceClient: BlobServiceClient;
   static containerClients: Record<string, ContainerClient> = {};

   constructor({ storageAccountName }: { storageAccountName: string }) {
      BlobApi.storageAccountName = storageAccountName;
      const defaultAzureCredential = new DefaultAzureCredential();
      BlobApi.blobServiceClient = new BlobServiceClient(
         `https://${storageAccountName}.blob.core.windows.net`,
         defaultAzureCredential
      );
   }

   // private methods

   static #removeContainerClient({ containerName }: { containerName: string }) {
      delete BlobApi.containerClients[containerName];
   }

   // public methods

   static getContainerClient({ containerName }: { containerName: string }) {
      if (!BlobApi.containerClients[containerName]) {
         const containerClient = BlobApi.blobServiceClient.getContainerClient(containerName);
         BlobApi.containerClients[containerName] = containerClient;
      }
      return BlobApi.containerClients[containerName];
   }

   static getBlobClient({ containerName, blobName }: { containerName: string, blobName: string }) {
      const containerClient = BlobApi.getContainerClient({ containerName });
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      return blockBlobClient;
   }

   static async listContainers() {
      applog('Containers:');
      let i = 0;
      for await (const container of BlobApi.blobServiceClient.listContainers()) {
         applog(`Container ${++i}: ${container.name}`);
      }
      if (i === 0) {
         applog('No containers found');
      }
   }

   static async listBlobs({ containerName }: { containerName: string }) {
      const containerClient = BlobApi.getContainerClient({ containerName });
      if (!(await containerClient.exists())) {
         applog(`Container ${containerName} does not exist`);
         return;
      }
      applog(`Blobs in "${containerName}":`);
      let i = 0;
      for await (const blob of containerClient.listBlobsFlat()) {
         const tempBlockBlobClient = containerClient.getBlockBlobClient(blob.name);
         const { metadata, etag, contentType, requestId, } = await tempBlockBlobClient.getProperties();
         applog(`Blob ${++i}: ${blob.name}\nMetadata: ${JSON.stringify(metadata)}\nETag: ${etag}\nContentType: ${contentType}\nRequestId: ${requestId}`);
      }
      if (i === 0) {
         applog('No blobs found');
      }
   }

   static async createContainer({ containerName }: { containerName: string }) {
      const containerClient = BlobApi.getContainerClient({ containerName });
      if ((await containerClient.exists())) {
         applog(`Container ${containerName} already exists`);
         return;
      }
      const createContainerResponse = await containerClient.create();
      applog(`Created container ${containerName} successfully`, createContainerResponse.requestId);
      return createContainerResponse;
   }

   static async uploadBlob({ containerName, blobName, body, options }: {
      containerName: string,
      blobName: string,
      body: HttpRequestBody,
      options?: BlockBlobUploadOptions
   }) {
      const blockBlobClient = BlobApi.getBlobClient({ containerName, blobName });
      const blockBlobExists = await blockBlobClient.exists();
      if (blockBlobExists) {
         applog(`Block blob ${blobName} already exists, updating...`);
      }
      const uploadBlobResponse = await blockBlobClient.upload(body, (await getContentLength(body)), options);
      applog(`${blockBlobExists ? "Updated" : "Uploaded"} block blob ${blobName} successfully |`, uploadBlobResponse.requestId);
   }

   static async getBlobProperties({ containerName, blobName }: { containerName: string, blobName: string }) {
      const containerClient = BlobApi.getContainerClient({ containerName });
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      const { metadata, etag, contentType, requestId } = await blockBlobClient.getProperties();
      return { metadata, etag, contentType, requestId };
   }

   static async getBlobBufferStream({ containerName, blobName }: { containerName: string, blobName: string }) {
      const blockBlobClient = BlobApi.getBlobClient({ containerName, blobName });
      const { metadata, etag, contentType, requestId } = await blockBlobClient.getProperties();
      const downloadBlockBlobResponse = await blockBlobClient.download();
      applog(`Downloaded blob ${blobName} successfully |`, downloadBlockBlobResponse.requestId);
      return {
         metadata,
         etag,
         contentType,
         requestId,
         bufferStream: downloadBlockBlobResponse.readableStreamBody
      }
   }

   static async getBlobBuffer({ containerName, blobName }: { containerName: string, blobName: string }) {
      const { bufferStream, ...getBlobBufferStreamResponse } = await BlobApi.getBlobBufferStream({ containerName, blobName });
      const buffer = await streamToBuffer(bufferStream);
      return { ...getBlobBufferStreamResponse, buffer }
   }

   static async deleteContainer({ containerName }: { containerName: string }) {
      const containerClient = BlobApi.getContainerClient({ containerName });
      if (!(await containerClient.exists())) {
         applog(`Container ${containerName} does not exist`);
         return;
      }
      const deleteContainerResponse = await containerClient.delete();
      BlobApi.#removeContainerClient({ containerName });
      applog(`Deleted container ${containerName} successfully`, deleteContainerResponse.requestId);
      return deleteContainerResponse;
   }

   static async deleteBlob({ containerName, blobName }: { containerName: string, blobName: string }) {
      const blockBlobClient = BlobApi.getBlobClient({ containerName, blobName });
      const deleteBlobResponse = await blockBlobClient.delete();
      applog(`Deleted blob ${blobName} successfully |`, deleteBlobResponse.requestId);
      return deleteBlobResponse;
   }
}

export default BlobApi;