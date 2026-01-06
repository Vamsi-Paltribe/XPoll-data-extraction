import { S3Client } from '@aws-sdk/client-s3';
import multer from 'multer';
import multerS3 from 'multer-s3';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const s3 = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    }
});

const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_BUCKET_NAME || 'xpoll-bucket',
        // acl: 'public-read', // Removed as per bucket policy
        metadata: function (req: any, file: any, cb: any) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req: any, file: any, cb: any) {
            const fileExtension = path.extname(file.originalname);
            const fileName = `${Date.now().toString()}-${Math.round(Math.random() * 1000)}${fileExtension}`;
            cb(null, `uploads/${fileName}`);
        }
    })
});

export { s3, upload };
