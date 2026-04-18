/*eslint-disable*/
import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class CloudinaryService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  uploadFile(file: Express.Multer.File): Promise<any> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: '404_sleep_not_found' }, // La carpeta que se creará en tu nube
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        },
      );

      // Convertimos el archivo de la memoria RAM a un "chorro de datos" (stream)
      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }
}
