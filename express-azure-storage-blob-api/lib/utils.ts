
import { HttpRequestBody } from '@azure/storage-blob';
import fs from 'fs';

export const applog = (...args: any[]) => console.log('[api]', ...args)
export const appwarn = (...args: any[]) => console.warn('[api]', ...args)
export const apperror = (...args: any[]) => console.error('[api]', ...args)

export function timestamp(): string {
   return new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
}

export const readFile = (...args: Parameters<typeof fs.readFileSync>) => {
   try {
      const file = fs.readFileSync(...args);
      return file;
   } catch (e) {
      appwarn('readFile', e);
   }
   return null;
}
export const writeFile = fs.writeFileSync;

export async function streamToBuffer(readableStream?: NodeJS.ReadableStream): Promise<Buffer> {
   return new Promise((resolve, reject) => {
      if (!readableStream) {
         appwarn('readableStream is undefined' + timestamp());
         return [];
      }
      const chunks: Buffer[] = [];
      readableStream.on("data", (data) => {
         chunks.push(data instanceof Buffer ? data : Buffer.from(data));
      });
      readableStream.on("end", () => {
         resolve(Buffer.concat(chunks));
      });
      readableStream.on("error", reject);
   });
}

export async function getContentLength(data: HttpRequestBody): Promise<number> {
   switch (typeof data) {
      case 'string':
         return data.length;
      case 'object':
         if (data instanceof Blob) {
            return data.size;
         } else if (data instanceof Buffer) {
            return data.length;
         }
         return 0;
      case 'function':
         const stream = data();
         return (await streamToBuffer(stream)).length;
      default:
         return 0;
   }
}
