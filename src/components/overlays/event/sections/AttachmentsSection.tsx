import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { EVENT_MAX_ATTACHMENTS } from '../../../../storage/storageBudget';
import { addAttachment, removeAttachment } from '../../../../engine';
import type { Event } from '../../../../types';

interface AttachmentsSectionProps {
  event: Event;
  eventId: string;
  isEditMode: boolean;
  addRequestNonce: number;
}

const CAMERA_MODULE_SPECIFIER = '@capacitor/camera';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
}

function estimateDataUrlSizeBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? '';
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function isImageAttachment(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

export function AttachmentsSection({ event, eventId, isEditMode, addRequestNonce }: AttachmentsSectionProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const isNativePlatform = useMemo(() => Capacitor.isNativePlatform(), []);

  const canAddAttachment = event.attachments.length < EVENT_MAX_ATTACHMENTS;

  useEffect(() => {
    if (addRequestNonce === 0 || isBusy || !canAddAttachment) return;

    if (isNativePlatform) {
      void handleNativePhoto('gallery');
      return;
    }

    fileInputRef.current?.click();
  }, [addRequestNonce, canAddAttachment, isBusy, isNativePlatform]);

  const commitAttachment = async (
    data: {
      uri: string;
      mimeType: string;
      label: string;
      sizeBytes: number;
      source: 'web-upload' | 'camera' | 'gallery';
    },
  ) => {
    if (!canAddAttachment) {
      setStatusMessage(`Attachment limit reached (${EVENT_MAX_ATTACHMENTS}).`);
      return;
    }

    if (data.sizeBytes > 200 * 1024) {
      setStatusMessage('Attachment is larger than 200 KB.');
      return;
    }

    const attachmentId = addAttachment(
      {
        type: isImageAttachment(data.mimeType) ? 'photo' : 'document',
        label: data.label,
        uri: data.uri,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        source: data.source,
      },
      eventId,
    );

    setStatusMessage(attachmentId ? 'Attachment added.' : `Attachment limit reached (${EVENT_MAX_ATTACHMENTS}).`);
  };

  const handleFileChange = async (eventValue: React.ChangeEvent<HTMLInputElement>) => {
    const file = eventValue.target.files?.[0];
    eventValue.target.value = '';
    if (!file) return;

    setIsBusy(true);
    setStatusMessage(null);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      await commitAttachment({
        uri: dataUrl,
        mimeType: file.type || 'application/octet-stream',
        label: file.name || 'Uploaded photo',
        sizeBytes: file.size,
        source: 'web-upload',
      });
    } catch {
      setStatusMessage('Unable to load that file.');
    } finally {
      setIsBusy(false);
    }
  };

  async function handleNativePhoto(source: 'camera' | 'gallery') {
    if (!isNativePlatform) {
      fileInputRef.current?.click();
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);

    try {
      const cameraModule = await import(/* @vite-ignore */ CAMERA_MODULE_SPECIFIER);
      const { Camera, CameraResultType, CameraSource } = cameraModule as {
        Camera: {
          getPhoto: (options: Record<string, unknown>) => Promise<Record<string, unknown>>;
        };
        CameraResultType: { DataUrl: string };
        CameraSource: { Camera: string; Photos: string };
      };

      const photo = await Camera.getPhoto({
        quality: 80,
        resultType: CameraResultType.DataUrl,
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      });

      const dataUrl = typeof photo.dataUrl === 'string' ? photo.dataUrl : '';
      const format = typeof photo.format === 'string' && photo.format ? photo.format : 'jpeg';
      if (!dataUrl) {
        setStatusMessage('No image was returned.');
        return;
      }

      await commitAttachment({
        uri: dataUrl,
        mimeType: `image/${format}`,
        label: source === 'camera' ? 'Camera photo' : 'Gallery photo',
        sizeBytes: estimateDataUrlSizeBytes(dataUrl),
        source,
      });
    } catch {
      setStatusMessage('Camera/gallery is unavailable here. Using photo upload instead.');
      fileInputRef.current?.click();
    } finally {
      setIsBusy(false);
    }
  }

  const handleRemoveAttachment = (attachmentId: string) => {
    removeAttachment(attachmentId, eventId);
    setStatusMessage('Attachment removed.');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
        Attachments
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        <input
          id={inputId}
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />

        {event.attachments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No attachments added
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {event.attachments.map((attachment) => {
              const isImage = isImageAttachment(attachment.mimeType);

              return (
                <div
                  key={attachment.id}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800/70"
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-900">
                    {isImage && attachment.uri ? (
                      <img src={attachment.uri} alt={attachment.label} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">DOC</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{attachment.label}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {attachment.source.replace('-', ' ')} · {Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB
                    </p>
                  </div>

                  {isEditMode && (
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(attachment.id)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      Delete
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isEditMode && (
          <div className="mt-auto rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/70">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Add attachment
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!canAddAttachment || isBusy}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
              >
                Upload photo
              </button>

              <button
                type="button"
                onClick={() => void handleNativePhoto('camera')}
                disabled={!canAddAttachment || isBusy || !isNativePlatform}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Camera
              </button>

              <button
                type="button"
                onClick={() => void handleNativePhoto('gallery')}
                disabled={!canAddAttachment || isBusy || !isNativePlatform}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Gallery
              </button>

              <button
                type="button"
                disabled
                className="rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-gray-400 dark:border-gray-600 dark:text-gray-500"
              >
                Document soon
              </button>
            </div>

            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {isNativePlatform ? 'Camera and gallery use Capacitor when available.' : 'Photo upload is available on web. Camera and gallery open in the mobile app.'}
            </p>

            {statusMessage && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{statusMessage}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}