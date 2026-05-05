const CAMERA_MODULE_SPECIFIER = '@capacitor/camera';

export type CapturedLocation = {
  latitude: number;
  longitude: number;
  placeName?: string;
};

export type CapturePhotoResult = {
  uri: string;
  location?: CapturedLocation;
  capturedAt?: string;
};

const EXIF_MARKER_APP1 = 0xffe1;
const EXIF_HEADER = 'Exif';

type ExifMetadata = {
  capturedAt?: string;
  location?: CapturedLocation;
};

function getWindowCapacitor(): Record<string, unknown> | undefined {
  if (typeof window === 'undefined' || !(('Capacitor' in window))) return undefined;
  return window.Capacitor as unknown as Record<string, unknown>;
}

export function isNativePhotoCaptureAvailable(): boolean {
  const capacitor = getWindowCapacitor();
  if (!capacitor) return false;

  const isNativePlatform = capacitor.isNativePlatform;
  if (typeof isNativePlatform === 'function') {
    try {
      return Boolean(isNativePlatform());
    } catch {
      return true;
    }
  }

  return true;
}

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

function normalizeExifDateString(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(trimmed);
  if (!match) return undefined;

  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

function extractCapacitorCapturedAt(photo: Record<string, unknown>): string | undefined {
  const exif = photo.exif;
  if (!exif || typeof exif !== 'object') return undefined;
  const exifRecord = exif as Record<string, unknown>;

  const raw = typeof exifRecord.DateTimeOriginal === 'string'
    ? exifRecord.DateTimeOriginal
    : typeof exifRecord.dateTimeOriginal === 'string'
      ? exifRecord.dateTimeOriginal
      : typeof exifRecord.DateTimeDigitized === 'string'
        ? exifRecord.DateTimeDigitized
        : typeof exifRecord.DateTime === 'string'
          ? exifRecord.DateTime
          : undefined;

  return normalizeExifDateString(raw);
}

function pickCapacitorPhotoUri(photo: Record<string, unknown>): string | undefined {
  if (typeof photo.webPath === 'string' && photo.webPath) return photo.webPath;
  if (typeof photo.path === 'string' && photo.path) return photo.path;
  return undefined;
}

function readAscii(view: DataView, offset: number, length: number): string {
  let result = '';
  for (let index = 0; index < length; index += 1) {
    const code = view.getUint8(offset + index);
    if (code === 0) break;
    result += String.fromCharCode(code);
  }
  return result;
}

function getExifValueByteLength(type: number, count: number): number {
  switch (type) {
    case 1:
    case 2:
    case 7:
      return count;
    case 3:
      return count * 2;
    case 4:
    case 9:
      return count * 4;
    case 5:
    case 10:
      return count * 8;
    default:
      return 0;
  }
}

function parseRational(view: DataView, offset: number, littleEndian: boolean): number | undefined {
  const numerator = view.getUint32(offset, littleEndian);
  const denominator = view.getUint32(offset + 4, littleEndian);
  if (denominator === 0) return undefined;
  return numerator / denominator;
}

function parseGpsCoordinate(view: DataView, offset: number, littleEndian: boolean): number | undefined {
  const degrees = parseRational(view, offset, littleEndian);
  const minutes = parseRational(view, offset + 8, littleEndian);
  const seconds = parseRational(view, offset + 16, littleEndian);
  if (degrees === undefined || minutes === undefined || seconds === undefined) {
    return undefined;
  }
  return degrees + minutes / 60 + seconds / 3600;
}

function parseExifMetadata(buffer: ArrayBuffer): ExifMetadata {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) {
    return {};
  }

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset, false);
    offset += 2;

    if (marker === 0xffda || marker === 0xffd9) break;
    if (offset + 2 > view.byteLength) break;

    const segmentLength = view.getUint16(offset, false);
    if (segmentLength < 2 || offset + segmentLength > view.byteLength) break;

    if (marker === EXIF_MARKER_APP1) {
      const headerOffset = offset + 2;
      if (readAscii(view, headerOffset, EXIF_HEADER.length) !== EXIF_HEADER) {
        break;
      }

      const tiffStart = headerOffset + 6;
      const byteOrder = readAscii(view, tiffStart, 2);
      const littleEndian = byteOrder === 'II';
      if (!littleEndian && byteOrder !== 'MM') {
        return {};
      }

      const firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian);
      let exifIfdOffset: number | undefined;
      let gpsIfdOffset: number | undefined;

      const parseIfd = (ifdOffset: number, onEntry: (entryOffset: number, tag: number, type: number, count: number, valueOffset: number) => void) => {
        const directoryOffset = tiffStart + ifdOffset;
        if (directoryOffset + 2 > view.byteLength) return;
        const entryCount = view.getUint16(directoryOffset, littleEndian);
        for (let index = 0; index < entryCount; index += 1) {
          const entryOffset = directoryOffset + 2 + index * 12;
          if (entryOffset + 12 > view.byteLength) return;
          const tag = view.getUint16(entryOffset, littleEndian);
          const type = view.getUint16(entryOffset + 2, littleEndian);
          const count = view.getUint32(entryOffset + 4, littleEndian);
          const valueOffset = view.getUint32(entryOffset + 8, littleEndian);
          onEntry(entryOffset, tag, type, count, valueOffset);
        }
      };

      const getDataOffset = (entryOffset: number, type: number, count: number, valueOffset: number) => {
        const byteLength = getExifValueByteLength(type, count);
        return byteLength <= 4 ? entryOffset + 8 : tiffStart + valueOffset;
      };

      parseIfd(firstIfdOffset, (_entryOffset, tag, _type, _count, valueOffset) => {
        if (tag === 0x8769) exifIfdOffset = valueOffset;
        if (tag === 0x8825) gpsIfdOffset = valueOffset;
      });

      let capturedAt: string | undefined;
      let latitude: number | undefined;
      let longitude: number | undefined;
      let latitudeRef = 'N';
      let longitudeRef = 'E';

      if (exifIfdOffset !== undefined) {
        parseIfd(exifIfdOffset, (entryOffset, tag, type, count, valueOffset) => {
          if (tag !== 0x9003 || type !== 2) return;
          const dataOffset = getDataOffset(entryOffset, type, count, valueOffset);
          capturedAt = normalizeExifDateString(readAscii(view, dataOffset, count));
        });
      }

      if (gpsIfdOffset !== undefined) {
        parseIfd(gpsIfdOffset, (entryOffset, tag, type, count, valueOffset) => {
          const dataOffset = getDataOffset(entryOffset, type, count, valueOffset);

          if (tag === 0x0001 && type === 2) {
            latitudeRef = readAscii(view, dataOffset, count) || latitudeRef;
          }

          if (tag === 0x0002 && type === 5 && count >= 3) {
            latitude = parseGpsCoordinate(view, dataOffset, littleEndian);
          }

          if (tag === 0x0003 && type === 2) {
            longitudeRef = readAscii(view, dataOffset, count) || longitudeRef;
          }

          if (tag === 0x0004 && type === 5 && count >= 3) {
            longitude = parseGpsCoordinate(view, dataOffset, littleEndian);
          }
        });
      }

      return {
        capturedAt,
        location:
          latitude !== undefined && longitude !== undefined
            ? {
                latitude: latitudeRef === 'S' ? -latitude : latitude,
                longitude: longitudeRef === 'W' ? -longitude : longitude,
              }
            : undefined,
      };
    }

    offset += segmentLength;
  }

  return {};
}

export async function readPhotoFile(file: File): Promise<CapturePhotoResult> {
  const metadata = await file.arrayBuffer()
    .then((buffer) => parseExifMetadata(buffer))
    .catch((): ExifMetadata => ({}));

  return {
    uri: URL.createObjectURL(file),
    location: metadata.location,
    capturedAt: metadata.capturedAt ?? (file.lastModified ? new Date(file.lastModified).toISOString() : undefined),
  };
}

export async function capturePhoto(options?: {
  allowGallery?: boolean;
}): Promise<CapturePhotoResult | null> {
  if (isNativePhotoCaptureAvailable()) {
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
        capturedAt: extractCapacitorCapturedAt(photo),
      };
    } catch {
      return null;
    }
  }

  void options;
  return null;
}
