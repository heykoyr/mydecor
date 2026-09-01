import type { Metadata } from 'next';
import { CaptureFlow } from '@/components/capture/capture-flow';

export const metadata: Metadata = { title: 'Scan your space' };

export default function ScanPage() {
  return <CaptureFlow />;
}
