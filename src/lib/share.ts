'use client';

/**
 * Sharing a preview.
 *
 * Uses the Web Share API where the platform has one — on a phone that opens the
 * system sheet, which is where "send this to my partner" actually happens. Where
 * it does not exist, the same image is saved to the device instead, which is the
 * honest desktop equivalent rather than a disabled button.
 */

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed';

async function toFile(dataUrl: string, filename: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}

function download(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function sharePreview(
  dataUrl: string,
  { title, text }: { title: string; text: string },
): Promise<ShareOutcome> {
  const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.jpg`;

  try {
    const file = await toFile(dataUrl, filename);

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    }

    download(dataUrl, filename);
    return 'downloaded';
  } catch (cause) {
    // Dismissing the system share sheet rejects with AbortError; that is a
    // choice the user made, not a failure to report back to them.
    if (cause instanceof DOMException && cause.name === 'AbortError') return 'cancelled';
    try {
      download(dataUrl, filename);
      return 'downloaded';
    } catch {
      return 'failed';
    }
  }
}
