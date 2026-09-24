import { v2 as cloudinary } from 'cloudinary'

let configured = false

function ensureConfigured() {
  if (configured) return
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
  })
  configured = true
}

export type UploadResult = {
  publicId: string
  secureUrl: string
  bytes: number
  mimeType: string
}

export type UploadOptions = {
  folder: string
  resourceType?: 'image' | 'raw'
}

/** Transformation para imágenes: auto-quality + auto-format + max 1280px wide. */
const IMAGE_TRANSFORMATION = {
  quality: 'auto',
  fetch_format: 'auto',
  width: 1280,
  crop: 'limit',
}

/**
 * Sube un buffer a Cloudinary. Para imágenes aplica transformación de
 * optimización (quality auto, format auto, max 1280px). Para PDFs usa
 * resource_type 'raw' sin transformación.
 */
export function uploadBuffer(
  buffer: Buffer,
  _fileName: string,
  mimeType: string,
  options: UploadOptions
): Promise<UploadResult> {
  ensureConfigured()
  const resourceType = options.resourceType ?? 'image'

  return new Promise((resolve, reject) => {
    const uploadOptions: Record<string, unknown> = {
      folder: options.folder,
      resource_type: resourceType,
      ...(resourceType === 'image' ? { transformation: IMAGE_TRANSFORMATION } : {}),
    }

    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (err: unknown, result: unknown) => {
        if (err) return reject(err)
        if (!result) return reject(new Error('Cloudinary returned no result'))
        const r = result as {
          public_id: string
          secure_url: string
          bytes: number
        }
        resolve({
          publicId: r.public_id,
          secureUrl: r.secure_url,
          bytes: r.bytes,
          mimeType,
        })
      }
    )

    stream.end(buffer)
  })
}

/** Elimina un asset de Cloudinary por su public_id. */
export function deleteAsset(publicId: string): Promise<void> {
  ensureConfigured()
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(
      publicId,
      { resource_type: 'auto' },
      (err: unknown) => {
        if (err) return reject(err)
        resolve()
      }
    )
  })
}