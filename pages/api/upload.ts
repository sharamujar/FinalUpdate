import type { NextApiRequest, NextApiResponse } from "next";
import cloudinary from "cloudinary";
import formidable from "formidable";
import fs from "fs";

// Disable bodyParser to allow file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

// Configure Cloudinary
cloudinary.v2.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Parse the uploaded file
  const form = new formidable.IncomingForm();
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: "Error parsing form data" });

    const file = files.file?.[0] as formidable.File;
    const fileStream = fs.createReadStream(file.filepath);

    try {
      // Upload the file to Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.v2.uploader.upload_stream(
          { folder: "inventory" }, // Change folder name as needed
          (error, result) => (error ? reject(error) : resolve(result))
        );
        fileStream.pipe(uploadStream);
      });

      res.status(200).json({ imageUrl: (uploadResult as any).secure_url });
    } catch (error) {
      res.status(500).json({ error: "Cloudinary upload failed" });
    }
  });
}
