'use client';

import { AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Opportunity,
  Product,
  Recommendation,
  Room,
  RoomType,
  UserPreferences,
  Visualization,
} from '@/types/domain';
import { createId, humanise } from '@/lib/utils';
import { track } from '@/lib/analytics/analytics';
import {
  preferencesRepository,
  roomRepository,
  savedProductRepository,
  visualizationRepository,
  DEFAULT_PREFERENCES,
} from '@/lib/data/repositories';
import { analyseRoom, withRoomType, type AnalysisStage } from '@/lib/vision/analysis-service';
import { productRepository } from '@/lib/products/repository';
import { recommendForOpportunity } from '@/lib/products/recommendations';
import { describeIssue } from '@/lib/vision/quality';
import { visualizationProvider, VisualizationError } from '@/lib/visualize/provider';
import { Button, IconButton } from '@/components/ui/button';
import { ArrowLeftIcon, TrashIcon } from '@/components/ui/icons';
import { Chip } from '@/components/ui/surfaces';
import { ErrorState, ProgressNarrative } from '@/components/ui/states';
import { toast } from '@/components/ui/toast';
import { sharePreview } from '@/lib/share';
import { RoomCanvas } from './room-canvas';
import { Hotspot } from './hotspot';
import { RoomSheet } from './room-sheet';
import { PreviewBar } from './preview-bar';

/**
 * The room screen.
 *
 * The photograph is the interface. Everything else is either anchored to a
 * point in it (hotspots) or docked below it (the opportunity rail, the preview
 * controls), so the image is never covered by the tools for exploring it.
 *
 * Analysis runs here rather than during capture, so a scan survives a reload
 * and a room can be re-opened without re-analysing.
 */

const STAGE_COPY: Record<AnalysisStage, string> = {
  reading_photo: 'Reading your photo…',
  understanding_space: 'Understanding your space…',
  finding_opportunities: 'Finding the best places to start…',
  done: 'Almost there…',
};

/**
 * Once the analysing state is shown it stays for at least this long. Analysis
 * on-device can finish in under 100ms, and a state that flashes reads as a
 * glitch rather than as speed.
 */
const MIN_ANALYSING_MS = 700;

const ROOM_TYPE_CHOICES: RoomType[] = [
  'living_room',
  'bedroom',
  'dining_room',
  'home_office',
  'kitchen',
  'hallway',
];

type Phase =
  | { name: 'loading' }
  | { name: 'analysing'; stage: AnalysisStage }
  | { name: 'ready' }
  | { name: 'missing' }
  | { name: 'failed'; title: string; body: string };

interface PreviewState {
  recommendation: Recommendation;
  opportunity: Opportunity;
  visualization: Visualization;
}

export function RoomExperience({
  roomId,
  initialProductId,
}: {
  roomId: string;
  /** Set when arriving from discovery: preview this product on open. */
  initialProductId?: string;
}) {
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const previewRun = useRef(0);
  // Guards the arrive-with-a-product flow so it fires once per mount.
  const deepLinkHandled = useRef(false);

  /* -- Load, and analyse on first open ------------------------------------ */

  useEffect(() => {
    let active = true;

    async function start() {
      const [stored, prefs, saved] = await Promise.all([
        roomRepository.get(roomId),
        preferencesRepository.get().catch(() => DEFAULT_PREFERENCES),
        savedProductRepository.list().catch(() => []),
      ]);
      if (!active) return;

      setPreferences(prefs);
      setSavedIds(new Set(saved.map((entry) => entry.productId)));

      if (!stored) {
        setPhase({ name: 'missing' });
        return;
      }

      setRoom(stored);

      if (stored.analysis) {
        setPhase({ name: 'ready' });
        return;
      }

      setPhase({ name: 'analysing', stage: 'reading_photo' });
      const shownAt = performance.now();
      track('analysis_started', { roomId });

      try {
        const analysis = await analyseRoom({
          roomId,
          image: stored.image,
          onStage: (stage) => active && setPhase({ name: 'analysing', stage }),
        });
        if (!active) return;

        const named =
          analysis.roomType === 'other' ? stored.name : humanise(analysis.roomType);
        const updated: Room = {
          ...stored,
          name: named,
          analysis,
          updatedAt: new Date().toISOString(),
        };

        await roomRepository.save(updated).catch(() => undefined);
        track('analysis_completed', {
          roomId,
          provider: analysis.provider,
          heuristic: analysis.isHeuristic,
          objects: analysis.detectedObjects.length,
          opportunities: analysis.opportunities.length,
          durationMs: analysis.durationMs,
        });

        const elapsed = performance.now() - shownAt;
        if (elapsed < MIN_ANALYSING_MS) {
          await new Promise((resolve) => setTimeout(resolve, MIN_ANALYSING_MS - elapsed));
        }
        if (!active) return;

        setRoom(updated);
        setPhase({ name: 'ready' });
        track('hotspot_viewed', { roomId, count: analysis.opportunities.length });
      } catch {
        if (!active) return;
        track('analysis_failed', { roomId });
        setPhase({
          name: 'failed',
          title: "We couldn't read this room",
          body: 'The photo could not be analysed. This is usually a problem with the image rather than the room itself.',
        });
      }
    }

    void start();
    return () => {
      active = false;
    };
  }, [roomId]);

  /* -- Actions ------------------------------------------------------------- */

  const persist = useCallback(async (next: Room) => {
    setRoom(next);
    await roomRepository.save(next).catch(() => undefined);
  }, []);

  const chooseRoomType = useCallback(
    (roomType: RoomType) => {
      if (!room?.analysis) return;
      void persist({
        ...room,
        name: humanise(roomType),
        analysis: withRoomType(room.analysis, roomType),
        updatedAt: new Date().toISOString(),
      });
    },
    [room, persist],
  );

  const toggleSave = useCallback(
    (product: Product, opportunity: Opportunity) => {
      const isSaved = savedIds.has(product.id);
      const next = new Set(savedIds);

      if (isSaved) {
        next.delete(product.id);
        void savedProductRepository.remove(product.id);
        track('product_unsaved', { productId: product.id });
        toast('Removed from saved');
      } else {
        next.add(product.id);
        void savedProductRepository.add({
          productId: product.id,
          savedAt: new Date().toISOString(),
          fromRoomId: roomId,
          fromOpportunityId: opportunity.id,
        });
        track('product_saved', { productId: product.id, category: product.category });
        toast('Saved', { action: { label: 'View', onPress: () => router.push('/saved') } });
      }

      setSavedIds(next);
    },
    [savedIds, roomId, router],
  );

  const runPreview = useCallback(
    async (recommendation: Recommendation, opportunity: Opportunity) => {
      if (!room) return;
      const run = (previewRun.current += 1);
      const startedAt = performance.now();

      setSelected(null);
      setShowOriginal(false);

      const base: Visualization = {
        id: createId('viz'),
        roomId: room.id,
        opportunityId: opportunity.id,
        productId: recommendation.product.id,
        status: 'generating',
        provider: visualizationProvider.name,
        fidelity: 'indicative',
        createdAt: new Date().toISOString(),
        durationMs: 0,
      };

      setPreview({ recommendation, opportunity, visualization: base });
      track('preview_started', {
        productId: recommendation.product.id,
        opportunityType: opportunity.type,
      });

      try {
        const output = await visualizationProvider.render({
          roomImageSrc: room.image.src,
          product: recommendation.product,
          opportunity,
        });
        if (previewRun.current !== run) return;

        const done: Visualization = {
          ...base,
          status: 'ready',
          resultSrc: output.dataUrl,
          fidelity: output.fidelity,
          durationMs: Math.round(performance.now() - startedAt),
        };
        setPreview({ recommendation, opportunity, visualization: done });
        void visualizationRepository.save(done).catch(() => undefined);
        track('preview_completed', {
          productId: recommendation.product.id,
          durationMs: done.durationMs,
        });
      } catch (cause) {
        if (previewRun.current !== run) return;
        const reason =
          cause instanceof VisualizationError
            ? cause.message
            : 'Something went wrong composing the preview.';
        setPreview({
          recommendation,
          opportunity,
          visualization: { ...base, status: 'failed', failureReason: reason },
        });
        track('preview_failed', { productId: recommendation.product.id });
      }
    },
    [room],
  );

  /**
   * Arriving from discovery with a product in hand.
   *
   * The product names a category, not a place, so the room decides where it
   * goes: the highest-priority opportunity that actually asks for that
   * category. If this room has nowhere to put it, we say so rather than
   * placing it somewhere arbitrary.
   */
  useEffect(() => {
    if (!initialProductId || deepLinkHandled.current) return;
    if (phase.name !== 'ready' || !room?.analysis) return;
    deepLinkHandled.current = true;

    const analysis = room.analysis;
    void (async () => {
      const product = await productRepository.byId(initialProductId).catch(() => null);
      if (!product) return;

      const target = analysis.opportunities.find((opportunity) =>
        opportunity.recommendedCategories.includes(product.category),
      );

      if (!target) {
        toast(`There is nowhere for ${product.name.toLowerCase()} in this room.`);
        return;
      }

      const ranked = await recommendForOpportunity({
        opportunity: target,
        analysis,
        preferences,
      }).catch(() => []);

      const recommendation =
        ranked.find((entry) => entry.product.id === product.id) ??
        ({
          product,
          score: 0,
          factors: {
            categoryRelevance: 0,
            styleMatch: 0,
            paletteMatch: 0,
            sizeFit: 0,
            priceFit: 0,
            availability: 0,
            popularity: 0,
          },
          reason: 'You picked this from Discover.',
        } satisfies Recommendation);

      await runPreview(recommendation, target);
    })();
  }, [initialProductId, phase.name, room, preferences, runPreview]);

  const sharePreviewImage = useCallback(async () => {
    const source = preview?.visualization.resultSrc;
    if (!source || !room) return;

    track('share_clicked', { productId: preview.recommendation.product.id });
    const outcome = await sharePreview(source, {
      title: `${room.name} with ${preview.recommendation.product.name}`,
      text: `${preview.recommendation.product.name} in my ${room.name.toLowerCase()}.`,
    });

    if (outcome === 'downloaded') toast('Saved to your device');
    if (outcome === 'failed') toast("We couldn't share that image");
  }, [preview, room]);

  const deleteRoom = useCallback(async () => {
    if (!room) return;
    const snapshot = room;
    await roomRepository.remove(room.id).catch(() => undefined);
    track('room_deleted', { roomId: room.id });
    router.replace('/');
    toast('Room deleted', {
      action: {
        label: 'Undo',
        onPress: () => {
          void roomRepository.save(snapshot);
          router.push(`/room/${snapshot.id}`);
        },
      },
    });
  }, [room, router]);

  /* -- Render -------------------------------------------------------------- */

  if (phase.name === 'missing') {
    return (
      <Centred>
        <ErrorState
          title="That room is no longer here"
          body="It may have been deleted, or saved in a different browser. Rooms are kept on the device that scanned them."
          onRetry={() => router.push('/scan')}
          retryLabel="Scan a room"
        />
      </Centred>
    );
  }

  if (phase.name === 'loading' || !room) {
    return (
      <Centred>
        <ProgressNarrative message="Opening your room…" />
      </Centred>
    );
  }

  if (phase.name === 'analysing') {
    return (
      <div className="relative min-h-[100dvh] bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={room.thumbnail}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-35 blur-xl"
        />
        <div className="relative grid min-h-[100dvh] place-items-center px-6">
          <div className="rounded-xl bg-elevated/95 px-8 py-10 backdrop-blur-md">
            <ProgressNarrative message={STAGE_COPY[phase.stage]} />
          </div>
        </div>
      </div>
    );
  }

  if (phase.name === 'failed') {
    return (
      <Centred>
        <ErrorState
          title={phase.title}
          body={phase.body}
          onRetry={() => router.push('/scan')}
          retryLabel="Take another photo"
          secondary={
            <button
              type="button"
              onClick={() => void deleteRoom()}
              className="text-body-sm text-muted underline underline-offset-4"
            >
              Delete this room
            </button>
          }
        />
      </Centred>
    );
  }

  const analysis = room.analysis;
  const opportunities = analysis?.opportunities ?? [];
  const needsRoomType = Boolean(analysis && analysis.roomTypeConfidence < 0.5);
  const blockingIssue = analysis?.qualityIssues.find((issue) => issue === 'no_room_detected');
  const displaySrc =
    preview && !showOriginal && preview.visualization.resultSrc
      ? preview.visualization.resultSrc
      : room.image.src;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-black">
      <header
        className="absolute inset-x-0 top-0 z-hotspot flex items-center gap-2 bg-gradient-to-b from-black/55 to-transparent px-3 pb-8"
        style={{ paddingTop: 'max(12px, var(--inset-top))' }}
      >
        <IconButton label="Back" variant="overlay" size="sm" onClick={() => router.push('/')}>
          <ArrowLeftIcon size={19} />
        </IconButton>

        <h1 className="min-w-0 flex-1 truncate px-1 text-body font-medium text-white [text-shadow:0_1px_6px_rgb(0_0_0/0.5)]">
          {room.name}
        </h1>

        <IconButton
          label="Delete this room"
          variant="overlay"
          size="sm"
          onClick={() => void deleteRoom()}
        >
          <TrashIcon size={19} />
        </IconButton>
      </header>

      <RoomCanvas
        className="min-h-0 flex-1"
        src={displaySrc}
        alt={
          preview && !showOriginal
            ? `Your room with ${preview.recommendation.product.name} placed in it`
            : `Your room, with ${opportunities.length} suggested places to start`
        }
        aspectRatio={room.image.width / room.image.height}
        overlay={
          !preview && (
            <AnimatePresence>
              {opportunities.map((opportunity, index) => (
                <Hotspot
                  key={opportunity.id}
                  opportunity={opportunity}
                  index={index}
                  selected={selected?.id === opportunity.id}
                  onSelect={() => setSelected(opportunity)}
                />
              ))}
            </AnimatePresence>
          )
        }
      />

      {/*
        The dock swaps instantly rather than cross-fading. It carries the
        primary action for whichever state the screen is in, and an entrance
        animation here would mean that action starts invisible — and, with a
        wait-for-exit transition, arrives a fifth of a second after the preview
        it belongs to. Motion is reserved for the things it explains.
      */}
      {preview ? (
        <PreviewBar
            recommendation={preview.recommendation}
            visualization={preview.visualization}
            showOriginal={showOriginal}
            onShowOriginalChange={setShowOriginal}
            saved={savedIds.has(preview.recommendation.product.id)}
            onToggleSave={() =>
              toggleSave(preview.recommendation.product, preview.opportunity)
            }
          onRetry={() => void runPreview(preview.recommendation, preview.opportunity)}
          onShare={
            preview.visualization.resultSrc ? () => void sharePreviewImage() : undefined
          }
          onExit={() => setPreview(null)}
        />
      ) : (
        <div
          className="shrink-0 border-t border-line bg-bg px-4 pt-4"
          style={{ paddingBottom: 'max(16px, var(--inset-bottom))' }}
        >
          <div className="mx-auto w-full max-w-wide">
            {needsRoomType ? (
              <RoomTypePrompt onChoose={chooseRoomType} />
            ) : blockingIssue ? (
              <NoIdeas
                message={describeIssue(blockingIssue).body}
                onRescan={() => router.push('/scan')}
              />
            ) : opportunities.length === 0 ? (
              <NoIdeas
                message="We could not find anything worth changing in this shot. A wider photo that includes the floor usually gives us more to work with."
                onRescan={() => router.push('/scan')}
              />
            ) : (
              <OpportunityRail
                opportunities={opportunities}
                heuristic={analysis?.isHeuristic ?? false}
                onSelect={setSelected}
              />
            )}
          </div>
        </div>
      )}

      {analysis && (
        <RoomSheet
          opportunity={selected}
          analysis={analysis}
          preferences={preferences}
          savedIds={savedIds}
          onToggleSave={toggleSave}
          onPreview={(recommendation, opportunity) => void runPreview(recommendation, opportunity)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function Centred({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-[100dvh] place-items-center bg-bg px-4">{children}</div>;
}

/**
 * The list counterpart to the hotspots.
 *
 * Spatial marks are the better representation, but they are also easy to miss
 * on a busy photograph. Naming the same opportunities in a rail underneath
 * gives the eye somewhere to start without adding labels over the image.
 */
function OpportunityRail({
  opportunities,
  heuristic,
  onSelect,
}: {
  opportunities: Opportunity[];
  heuristic: boolean;
  onSelect: (opportunity: Opportunity) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <p className="text-body-sm text-muted">
          {opportunities.length} {opportunities.length === 1 ? 'place' : 'places'} to start
        </p>
        {heuristic && (
          <p className="text-caption text-faint">Surfaces only — no model connected</p>
        )}
      </div>

      <div className="rail -mx-4 flex gap-2 overflow-x-auto px-4">
        {opportunities.map((opportunity) => (
          <Chip
            key={opportunity.id}
            onClick={() => onSelect(opportunity)}
          >
            {opportunity.title}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function RoomTypePrompt({ onChoose }: { onChoose: (roomType: RoomType) => void }) {
  return (
    <div>
      <p className="mb-3 text-body-sm text-ink">
        Which room is this?{' '}
        <span className="text-muted">It sharpens what we suggest.</span>
      </p>
      <div className="rail -mx-4 flex gap-2 overflow-x-auto px-4">
        {ROOM_TYPE_CHOICES.map((roomType) => (
          <Chip key={roomType} onClick={() => onChoose(roomType)}>
            {humanise(roomType)}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function NoIdeas({ message, onRescan }: { message: string; onRescan: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-1">
      <p className="min-w-0 flex-1 text-body-sm text-muted">{message}</p>
      <Button size="sm" variant="secondary" onClick={onRescan}>
        Take another
      </Button>
    </div>
  );
}
