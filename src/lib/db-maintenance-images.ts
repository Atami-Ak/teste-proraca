import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from './firebase'

export async function uploadMaintenanceImages(maintenanceId: string, files: File[]): Promise<string[]> {
  const urls: string[] = []
  for (const file of files) {
    const safeName = file.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '')
    const storageRef = ref(
      storage,
      `maintenance/${maintenanceId}/images/${Date.now()}-${safeName}`,
    )
    await uploadBytes(storageRef, file)
    const url = await getDownloadURL(storageRef)
    urls.push(url)
  }
  return urls
}
