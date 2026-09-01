'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconButton } from '@/components/ui/button';
import { CloseIcon } from '@/components/ui/icons';
import { ErrorState } from '@/components/ui/states';

/**
 * Live camera capture.
 *
 * The framing guidance is one line of text and four hairline corner marks. A
 * grid or a reticle would imply the system needs the shot aligned, which it
 * does not — what it actually benefits from is distance and a visible floor
 * line, so that is what the copy asks for.
 */

type CameraError =
  | { code: 'unsupported'; title: string; body: string }
  | { code: 'denied'; title: string; body: string }
  | { code: 'missing'; title: string; body: string }
  | { code: 'busy'; title: string; body: string };

function describe(error: unknown): CameraError {
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        code: 'denied',
        title: 'Camera access is blocked',
        body: 'Your browser is not letting this page use the camera. You can allow it in the address bar, or upload a photo instead.',
      };
    case 'NotFoundError':
    case 'OverconstrainedError':
      return {
        code: 'missing',
        title: 'No camera found',
        body: 'This device has no camera we can use. Uploading a photo works just as well.',
      };
    case 'NotReadableError':
    case 'AbortError':
      return {
        code: 'busy',
        title: 'The camera is in use',
        body: 'Another app or tab has hold of the camera. Close it and try again, or upload a photo.',
      };
    default:
      return {
        code: 'unsupported',
        title: "This browser can't open the camera",
        body: 'Camera capture needs a secure connection and a recent browser. Uploading a photo works everywhere.',
      };
  }
}

export function CameraView({
  onCapture,
  onCancel,
  onUploadInstead,
}: {
  onCapture: (frame: Blob) => void;
  onCancel: () => void;
  onUploadInstead: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<CameraError | null>(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(describe(new Error('unsupported')));
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // The rear camera on phones; harmless on laptops, which ignore it.
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
          setReady(true);
        }
      } catch (cause) {
        if (!cancelled) setError(describe(cause));
      }
    }

    void start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || capturing) return;
    setCapturing(true);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setCapturing(false);
      return;
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        setCapturing(false);
        if (blob) onCapture(blob);
      },
      'image/jpeg',
      0.92,
    );
  }, [capturing, onCapture]);

  if (error) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-bg px-4">
        <ErrorState
          title={error.title}
          body={error.body}
          onRetry={onUploadInstead}
          retryLabel="Upload a photo"
          secondary={
            <button
              type="button"
              onClick={onCancel}
              className="text-body-sm text-muted underline underline-offset-4"
            >
              Go back
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        aria-label="Camera preview"
        className="absolute inset-0 h-full w-full object-cover"
      />

      {ready && <FramingGuide />}

      <div
        className="absolute inset-x-0 top-0 flex justify-end p-4"
        style={{ paddingTop: 'max(16px, var(--inset-top))' }}
      >
        <IconButton label="Cancel" variant="overlay" onClick={onCancel}>
          <CloseIcon size={20} />
        </IconButton>
      </div>

      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-5 px-6 pb-8"
        style={{ paddingBottom: 'max(32px, calc(var(--inset-bottom) + 24px))' }}
      >
        <p className="text-center text-body-sm text-white/85 [text-shadow:0_1px_8px_rgb(0_0_0/0.5)]">
          Stand back far enough to see the floor.
        </p>

        <button
          type="button"
          onClick={capture}
          disabled={!ready || capturing}
          aria-label="Take photo"
          className="grid h-[74px] w-[74px] place-items-center rounded-full border-[3px] border-white/90 transition-transform duration-fast active:scale-95 disabled:opacity-40"
        >
          <span className="h-[58px] w-[58px] rounded-full bg-white transition-transform duration-fast" />
        </button>

        <button
          type="button"
          onClick={onUploadInstead}
          className="text-body-sm text-white/85 underline underline-offset-4"
        >
          Choose an existing photo
        </button>
      </div>
    </div>
  );
}

/** Four hairline corner marks. Present enough to frame by, quiet enough to ignore. */
function FramingGuide() {
  const corners = [
    'left-6 top-[22%] border-l border-t',
    'right-6 top-[22%] border-r border-t',
    'left-6 bottom-[26%] border-b border-l',
    'right-6 bottom-[26%] border-b border-r',
  ];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {corners.map((position) => (
        <span
          key={position}
          className={`absolute h-7 w-7 rounded-[3px] border-white/45 ${position}`}
        />
      ))}
    </div>
  );
}
