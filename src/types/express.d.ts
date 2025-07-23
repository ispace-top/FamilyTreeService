import { Request } from 'express';
import { Multer } from 'multer';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        openid: string;
      };
      file?: Multer.File;
      files?: Multer.File[];
    }
    namespace Multer {
      interface File {
        // Multer's default File interface properties
        fieldname: string;
        originalname: string;
        encoding: string;
        mimetype: string;
        size: number;
        destination: string;
        filename: string;
        path: string;
        buffer: Buffer;
      }
    }
  }
}