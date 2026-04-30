const CAMERA_MODULE_SPECIFIER = '@capacitor/camera';

type CapturedLocation = {
  latitude: number;
  longitude: number;
  placeName?: string;
};

type CapturePhotoResult = {
  uri: string;
  location?: CapturedLocation;
};

function extractCapacitorPhotoLocation(photo: Record<string, unknown>): CapturedLocation | undefined {
  const exif = photo.exif;
  if (!exif || typeof exif !== 'object') return undefined;
  const exifRecord = exif as Record<string, unknown>;

  const latitude = typeof exifRecord.latitude === 'number'
    ? exifRecord.latitude
    : typeof exifRecord.Latitude === 'number'
      ? exifRecord.Latitude
      : undefined;
  const longitude = typeof exifRecord.longitude === 'number'
    ? exifRecord.longitude
    : typeof exifRecord.Longitude === 'number'
      ? exifRecord.Longitude
      : undefined;
  const placeName = typeof exifRecord.placeName === 'string'
    ? exifRecord.placeName
    : typeof exifRecord.PlaceName === 'string'
      ? exifRecord.PlaceName
      : undefined;

  if (typeof latitude !== 'number' || typeof longitude !== 'number') return undefined;
  return { latitude, longitude, placeName };
}

function pickCapacitorPhotoUri(photo: Record<string, unknown>): string | undefined {
  if (typeof photo.webPath === 'string' && photo.webPath) return photo.webPath;
  if (typeof photo.path === 'string' && photo.path) return photo.path;
  return undefined;
}

function pickWebFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.position = 'fixed';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';

    const cleanup = () => {
      input.removeEventListener('change', handleChange);
      window.removeEventListener('focus', handleWindowFocus);
      if (input.parentNode) input.parentNode.removeChild(input);
    };

    const handleChange = () => {
      const file = input.files?.[0] ?? null;
      cleanup();
      resolve(file);
    };

    const handleWindowFocus = () => {
      window.setTimeout(() => {
        if (input.files?.length) return;
        cleanup();
        resolve(null);
      }, 300);
    };

    input.addEventListener('change', handleChange, { once: true });
    window.addEventListener('focus', handleWindowFocus, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

export async function capturePhoto(options?: {
  allowGallery?: boolean;
}): Promise<CapturePhotoResult | null> {
  if (typeof window !== 'undefined' && 'Capacitor' in window && window.Capacitor) {
    try {
      const cameraModule = await import(/* @vite-ignore */ CAMERA_MODULE_SPECIFIER);
      const { Camera, CameraResultType, CameraSource } = cameraModule as {
        Camera: {
          getPhoto: (options: Record<string, unknown>) => Promise<Record<string, unknown>>;
        };
        CameraResultType: { Uri: string };
        CameraSource: { Camera: string; Photos: string };
      };

      const photo = await Camera.getPhoto({
        quality: 80,
        resultType: CameraResultType.Uri,
        source: options?.allowGallery ? CameraSource.Photos : CameraSource.Camera,
      });

      const uri = pickCapacitorPhotoUri(photo);
      if (!uri) return null;

      return {
        uri,
        location: extractCapacitorPhotoLocation(photo),
      };
    } catch {
      return null;
    }
  }

  if (typeof document === 'undefined') return null;

  const file = await pickWebFile();
  if (!file) return null;

  return {
    uri: URL.createObjectURL(file),
    // Future enhancement: parse EXIF GPS metadata client-side without adding a library.
    location: undefined,
  };
}
