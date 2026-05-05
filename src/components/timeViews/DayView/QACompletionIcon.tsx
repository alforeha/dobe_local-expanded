import { useState } from 'react';
import { IconDisplay } from '../../shared/IconDisplay';

interface QACompletionIconProps {
  iconKey: string;
  photoUri?: string;
  weatherIconKey?: string;
  offsetIndex: number;
  topPx: number;
  onClick: () => void;
}

export function QACompletionIcon({
  iconKey,
  photoUri,
  weatherIconKey,
  offsetIndex,
  topPx,
  onClick,
}: QACompletionIconProps) {
  const leftOffset = offsetIndex * 30;
  const [failedPhotoUri, setFailedPhotoUri] = useState<string | null>(null);

  const fallbackIconKey = weatherIconKey ?? iconKey;
  const showPhoto = Boolean(photoUri) && failedPhotoUri !== photoUri;

  return (
    <button
      type="button"
      aria-label={`Quick action completion ${fallbackIconKey}`}
      onClick={onClick}
      className="absolute flex h-7 w-7 items-center justify-center rounded-full bg-purple-500 text-sm shadow ring-2 ring-white transition-transform hover:bg-purple-600 active:scale-95"
      style={{ top: `${topPx}px`, left: `${leftOffset}px`, zIndex: 20 + offsetIndex }}
    >
      {showPhoto ? (
        <img
          src={photoUri}
          alt=""
          className="h-full w-full rounded-full object-cover"
          onError={() => setFailedPhotoUri(photoUri ?? null)}
        />
      ) : (
        <IconDisplay iconKey={fallbackIconKey} size={16} className="h-4 w-4 object-contain" alt="" />
      )}
    </button>
  );
}
