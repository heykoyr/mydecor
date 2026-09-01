'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import type { AnalysisQualityIssue, CapturedImage, Room } from '@/types/domain';
import { createId } from '@/lib/utils';
import { track } from '@/lib/analytics/analytics';
import { roomRepository } from '@/lib/data/repositories';
import { ImagePrepareError, prepareCapture, validateFile } from '@/lib/image/prepare';
import { extractSignals } from '@/lib/vision/signals';
import { assessQuality, describeIssue, isWorthWarningAbout } from '@/lib/vision/quality';
import { Button, IconButton } from '@/components/ui/button';
import { ArrowLeftIcon, CameraIcon, ImageIcon } from '@/components/ui/icons';
import { ErrorState } from '@/components/ui/states';
import { CameraView } from './camera-view';

/**
 * The capture flow.
 *
 * choose → (camera) → preview → analysing
 *
 * The photograph is normalised and quality-checked the moment it arrives, so
 * the preview step can tell the user something useful about their shot rather
 * than just showing it back to them. Everything happens on-device; nothing is
 * uploaded here.
 */

type Stage =
  | { name: 'choose' }
  | { name: 'camera' }
  | { name: 'preview'; capture: PreparedCapture }
  | { name: 'saving' }
  | { name: 'error'; title: string; body: string };

interface PreparedCapture {
  image: CapturedImage;
  thumbnail: string;
  issues: AnalysisQualityIssue[];
}

export function CaptureFlow() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ name: 'choose' });
  const [working, setWorking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const accept = useCallback(
    async (source: Blob, origin: CapturedImage['source']) => {
      setWorking(true);
      try {
        const { image, thumbnail, element } = await prepareCapture(source, origin);

        // The same signal pass the analyser uses, so the warning the user sees
        // here is the one the analysis would have acted on.
        let issues: AnalysisQualityIssue[] = [];
        try {
          issues = assessQuality(extractSignals(element)).filter(isWorthWarningAbout);
        } catch {
          // Quality assessment is advisory; never block a capture on it.
        }

        track('photo_uploaded', { source: origin, bytes: image.byteSize, issues: issues.length });
        setStage({ name: 'preview', capture: { image, thumbnail, issues } });
      } catch (cause) {
        const message =
          cause instanceof ImagePrepareError
            ? cause.failure.message
            : 'Something went wrong opening that photo. Try another one.';
        setStage({ name: 'error', title: "We couldn't use that photo", body: message });
      } finally {
        setWorking(false);
      }
    },
    [],
  );

  const onFilePicked = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      const failure = validateFile(file);
      if (failure) {
        setStage({ name: 'error', title: "We can't read that file", body: failure.message });
        return;
      }
      void accept(file, 'upload');
    },
    [accept],
  );

  const confirm = useCallback(
    async (capture: PreparedCapture) => {
      setStage({ name: 'saving' });
      const room: Room = {
        id: createId('room'),
        // Renamed to the detected room type once analysis completes.
        name: 'New room',
        image: capture.image,
        thumbnail: capture.thumbnail,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      try {
        await roomRepository.save(room);
        track('room_saved', { roomId: room.id });
        router.replace(`/room/${room.id}`);
      } catch {
        setStage({
          name: 'error',
          title: "We couldn't save this room",
          body: 'This browser is blocking local storage, which is where rooms are kept. Private windows do this by default.',
        });
      }
    },
    [router],
  );

  return (
    <div className="min-h-[100dvh] bg-bg">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          onFilePicked(event.target.files?.[0]);
          // Allow re-picking the same file after a retake.
          event.target.value = '';
        }}
      />

      <AnimatePresence mode="wait">
        {stage.name === 'choose' && (
          <Fade key="choose">
            <Chooser
              working={working}
              onUseCamera={() => {
                track('photo_started', { method: 'camera' });
                setStage({ name: 'camera' });
              }}
              onUpload={() => {
                track('photo_started', { method: 'upload' });
                fileInputRef.current?.click();
              }}
              onDropFile={onFilePicked}
              onBack={() => router.push('/')}
            />
          </Fade>
        )}

        {stage.name === 'camera' && (
          <Fade key="camera">
            <CameraView
              onCapture={(frame) => void accept(frame, 'camera')}
              onCancel={() => setStage({ name: 'choose' })}
              onUploadInstead={() => {
                setStage({ name: 'choose' });
                fileInputRef.current?.click();
              }}
            />
          </Fade>
        )}

        {stage.name === 'preview' && (
          <Fade key="preview">
            <Preview
              capture={stage.capture}
              onRetake={() => {
                track('photo_retaken', {});
                setStage({ name: 'choose' });
              }}
              onConfirm={() => void confirm(stage.capture)}
            />
          </Fade>
        )}

        {stage.name === 'saving' && (
          <Fade key="saving">
            <div className="grid min-h-[100dvh] place-items-center px-6">
              <p className="text-body text-muted">Preparing your room…</p>
            </div>
          </Fade>
        )}

        {stage.name === 'error' && (
          <Fade key="error">
            <div className="grid min-h-[100dvh] place-items-center px-4">
              <ErrorState
                title={stage.title}
                body={stage.body}
                onRetry={() => setStage({ name: 'choose' })}
                retryLabel="Try another photo"
              />
            </div>
          </Fade>
        )}
      </AnimatePresence>
    </div>
  );
}

function Fade({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      {children}
    </motion.div>
  );
}

function Chooser({
  working,
  onUseCamera,
  onUpload,
  onDropFile,
  onBack,
}: {
  working: boolean;
  onUseCamera: () => void;
  onUpload: () => void;
  onDropFile: (file: File | undefined) => void;
  onBack: () => void;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className="mx-auto flex min-h-[100dvh] max-w-content flex-col px-4"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        onDropFile(event.dataTransfer.files[0]);
      }}
    >
      <header className="flex items-center py-3" style={{ paddingTop: 'max(12px, var(--inset-top))' }}>
        <IconButton label="Back" onClick={onBack} className="-ml-3 text-muted">
          <ArrowLeftIcon size={20} />
        </IconButton>
      </header>

      <div className="flex flex-1 flex-col justify-center pb-16">
        <h1 className="font-serif text-h1 text-ink">Scan your space</h1>
        <p className="mt-3 text-body-lg text-muted">
          One photo of the wall, window or corner you want to change.
        </p>

        <div
          className={`mt-8 rounded-xl border border-dashed p-6 transition-colors duration-fast ${
            dragging ? 'border-ink bg-sunken' : 'border-line'
          }`}
        >
          <div className="flex flex-col gap-3">
            <Button size="lg" fullWidth loading={working} onClick={onUseCamera} icon={<CameraIcon size={20} />}>
              Take a photo
            </Button>
            <Button
              size="lg"
              fullWidth
              variant="secondary"
              disabled={working}
              onClick={onUpload}
              icon={<ImageIcon size={20} />}
            >
              Choose a photo
            </Button>
          </div>

          <p className="mt-4 text-center text-body-sm text-faint">
            <span className="hidden md:inline">Or drop a photo here. </span>
            JPEG, PNG or WebP.
          </p>
        </div>
      </div>
    </div>
  );
}

function Preview({
  capture,
  onRetake,
  onConfirm,
}: {
  capture: PreparedCapture;
  onRetake: () => void;
  onConfirm: () => void;
}) {
  const warning = capture.issues[0] ? describeIssue(capture.issues[0]) : null;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-black">
      <div className="relative flex-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={capture.image.src}
          alt="The photo you just took, ready to analyse"
          className="absolute inset-0 h-full w-full object-contain"
        />
      </div>

      <div
        className="shrink-0 bg-bg px-4 pt-5"
        style={{ paddingBottom: 'max(20px, calc(var(--inset-bottom) + 12px))' }}
      >
        {warning && (
          <div className="mb-4 rounded-lg border border-line bg-sunken px-4 py-3">
            <p className="text-body-sm font-medium text-ink">{warning.title}</p>
            <p className="mt-0.5 text-body-sm text-muted">{warning.body}</p>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" size="lg" fullWidth onClick={onRetake}>
            Retake
          </Button>
          <Button size="lg" fullWidth onClick={onConfirm}>
            {warning ? 'Use anyway' : 'Use this photo'}
          </Button>
        </div>
      </div>
    </div>
  );
}
