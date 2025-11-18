"use client";
// Barcode/QR scanner component using html5-qrcode. Handles camera selection,
// start/stop lifecycle, resize responsiveness, and surfaces friendly errors.
import { useEffect, useRef, useState, useId } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onCancel: () => void;
}

export default function BarcodeScanner({ onScan, onCancel }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const divRef = useRef<HTMLDivElement | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startedRef = useRef<boolean>(false);
  const [status, setStatus] = useState<'idle' | 'starting' | 'scanning' | 'stopped' | 'error'>('idle');
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }> | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const transitioningRef = useRef<boolean>(false);

  // Stable, unique id for the scan region (avoid duplicates in StrictMode)
  const reactId = useId();
  const regionId = `barcode-scan-region-${reactId.replace(/[:]/g, '-')}`;
  const initializedRef = useRef<boolean>(false);

  // Stop the active scanner and clear DOM artifacts (idempotent)
  const stopScanner = async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    if (!startedRef.current) return; // nothing to stop
    if (transitioningRef.current) return; // avoid overlapping transitions
    transitioningRef.current = true;
    try {
      await scanner.stop();
    } catch (_) {
      // swallow stop errors (e.g., already stopped/not running)
    } finally {
      startedRef.current = false;
      setActive(false);
      // Attempt to clear DOM elements to prevent duplicated video/canvas on next start
      try { await scanner.clear(); } catch (_) {}
      setStatus('stopped');
      transitioningRef.current = false;
    }
  };

  // Start scanner with a specific camera or environment-facing default.
  // Retries once on transient internal state transition issues.
  const startScanner = async (cameraId?: string, retry = 0) => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    if (startedRef.current) return; // already running
    if (transitioningRef.current) return; // avoid overlapping transitions
    setError(null);
    setStatus('starting');
    transitioningRef.current = true;
    try {
  const cameraConfig: any = cameraId ? cameraId : { facingMode: 'environment' };
      // Build a list of formats to support; prefer QR and include common barcodes when available
      const F: any = Html5QrcodeSupportedFormats as any;
      const candidateKeys = [
        'QR_CODE',
        'CODE_128',
        'CODE_39',
        'CODE_93',
        'EAN_13',
        'EAN_8',
        'UPC_A',
        'UPC_E',
        'ITF',
        'PDF_417',
        'DATA_MATRIX',
      ];
      const formats = candidateKeys.map(k => F?.[k]).filter((v: any) => typeof v !== 'undefined');
      // Responsive square box size (mobile/tablet/desktop). Reintroduce boxed scan region.
      const viewport = typeof window !== 'undefined' ? window.innerWidth : 360;
      const box = Math.max(220, Math.min(400, Math.round(viewport * 0.6))); // clamp for consistency
      const options: any = {
        fps: 10,
        qrbox: { width: box, height: box },
        formatsToSupport: (formats && formats.length) ? formats : [Html5QrcodeSupportedFormats.QR_CODE],
      };
      // Use native BarcodeDetector when supported (improves linear barcode detection)
      options.experimentalFeatures = { useBarCodeDetectorIfSupported: true };

      await scanner.start(
        cameraConfig,
        options,
        (decoded: string) => {
          if (!startedRef.current) return; // spurious callback after stop
          // Stop scanning immediately to avoid duplicate scans
          stopScanner();
          onScan(decoded.trim());
        },
        (_err: string) => {
          // ignore frequent scan failures, only surface permission errors via catch below
        }
      );
      startedRef.current = true;
      setActive(true);
      setStatus('scanning');
    } catch (e: any) {
  // Camera start failed or permission denied
      const raw = e?.message || String(e) || 'Camera start failed';
      let friendly = raw;
      if (/NotAllowedError|denied/i.test(raw)) friendly = 'Camera permission denied. Please allow access and try again.';
      if (/NotFoundError|no camera/i.test(raw)) friendly = 'No camera found. Plug in a camera or switch device.';
      if (/NotReadableError|track.*ended/i.test(raw)) friendly = 'Camera is busy or in use by another app. Close other apps and retry.';
      // Handle html5-qrcode internal state transition races gracefully
      if (/Cannot transition to a new state, already under transition/i.test(raw) && retry < 2) {
        // Small backoff then retry once or twice
        setTimeout(() => {
          // Clear transitioning flag before retrying
          transitioningRef.current = false;
          startScanner(cameraId, retry + 1);
        }, 150);
        return;
      }
      setError(friendly);
      startedRef.current = false;
      setActive(false);
      setStatus('error');
      // Fallback: if facingMode failed, try enumerating cameras and start first available
      if (!cameraId) {
        try {
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length) {
            const list = devices.map(d => ({ id: d.id, label: d.label }));
            setCameras(list);
            const first = list[0].id;
            setSelectedCameraId(first);
            // clear transitioning flag before new attempt
            transitioningRef.current = false;
            await startScanner(first);
            return;
          }
        } catch (_) {
          // ignore
        }
      }
    }
    // Only clear transitioning flag if we’re not in the special retry path above
      transitioningRef.current = false;
  };

  // Initialize scanner on mount and subscribe to cameras; cleanup on unmount
  useEffect(() => {
    if (!divRef.current) return;
    // Ensure the div has a stable id and create scanner once
    if (!initializedRef.current) {
      divRef.current.id = regionId;
      // Ensure empty container (avoid duplicate DOM from prior mounts)
      try { divRef.current.innerHTML = ''; } catch (_) {}
      const html5Qrcode = new Html5Qrcode(regionId);
      scannerRef.current = html5Qrcode;
      initializedRef.current = true;
    }
    // Start scanning on mount
    (async () => {
      // pre-enumerate cameras to improve success rate and show selector
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length) {
          const list = devices.map(d => ({ id: d.id, label: d.label }));
          setCameras(list);
          // Prefer back camera if label suggests it
          const env = list.find(c => /back|rear|environment/i.test(c.label));
          const firstId = (env?.id) || list[0].id;
          setSelectedCameraId(firstId);
          await startScanner(firstId);
          return;
        }
      } catch (_) {
        // ignore
      }
      await startScanner();
    })();
    return () => {
      // Best-effort stop and clear on unmount
      (async () => {
        await stopScanner();
        const scanner = scannerRef.current;
        if (scanner) {
          try { await scanner.clear(); } catch (_) {}
        }
      })();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adjust qrbox size on resize (debounced) for better multi-device experience
  useEffect(() => {
    let resizeTimeout: any = null;
    const onResize = () => {
      if (!startedRef.current) return; // only restart if active
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(async () => {
        await stopScanner();
        if (divRef.current) divRef.current.innerHTML = '';
        scannerRef.current = new Html5Qrcode(regionId);
        await startScanner(selectedCameraId || undefined);
      }, 250);
    };
    if (typeof window !== 'undefined') window.addEventListener('resize', onResize);
    return () => {
      if (typeof window !== 'undefined') window.removeEventListener('resize', onResize);
      if (resizeTimeout) clearTimeout(resizeTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCameraId]);

  return (
    <Card className="p-4 glass-card glow-border space-y-4">
      <h3 className="text-lg font-semibold">Scan Mode</h3>
      <p className="text-xs text-muted-foreground">Align the item's barcode/QR inside the square.</p>
  <div ref={divRef} className="relative mx-auto rounded overflow-hidden bg-black/10 aspect-square w-full max-w-[460px]" />
      <div className="text-xs text-muted-foreground min-h-[1rem]">
        {status === 'starting' && 'Starting camera…'}
        {status === 'scanning' && 'Scanning – hold steady'}
        {status === 'stopped' && 'Scanner stopped'}
        {status === 'error' && !error && 'Scanner error'}
      </div>
      {error && (
        <div className="text-destructive text-sm space-y-1">
          <div>{error}</div>
          {typeof window !== 'undefined' && !window.isSecureContext && typeof location !== 'undefined' && location.hostname !== 'localhost' && (
            <div>
              Camera access may be blocked on non-HTTPS pages. Please use https or localhost.
            </div>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          variant="outline"
          onClick={async () => {
            // Stop scanner and bubble cancellation to parent
            await stopScanner();
            onCancel();
          }}
        >
          Cancel
        </Button>
        {!active && (
          <Button
            className="flex-1"
            onClick={async () => {
              setError(null);
              // Recreate scanner instance to avoid split/overlay artifacts
              const existing = scannerRef.current;
              if (existing && startedRef.current) {
                await stopScanner();
              }
              // Ensure container is empty
              if (divRef.current) {
                divRef.current.innerHTML = '';
              }
              // Rebuild scanner instance (cleared in stopScanner already)
              scannerRef.current = new Html5Qrcode(regionId);
              await startScanner(selectedCameraId || undefined);
            }}
          >
            Rescan
          </Button>
        )}
        {!active && (status === 'idle' || status === 'error') && (
          <Button
            className="flex-1"
            variant="secondary"
            onClick={async () => {
              setError(null);
              await startScanner(selectedCameraId || undefined);
            }}
          >
            Start Camera
          </Button>
        )}
      </div>
      {cameras && cameras.length > 1 && (
        <div className="mt-3 space-y-1">
          <label className="text-xs font-medium">Camera</label>
          <select
            className="w-full h-8 rounded bg-secondary/40 border border-primary/20 text-xs px-2"
            value={selectedCameraId || ''}
            onChange={async (e) => {
              const camId = e.target.value;
              setSelectedCameraId(camId);
              await stopScanner();
              if (divRef.current) divRef.current.innerHTML = '';
              scannerRef.current = new Html5Qrcode(regionId);
              await startScanner(camId);
            }}
          >
            {cameras.map(c => <option key={c.id} value={c.id}>{c.label || c.id}</option>)}
          </select>
        </div>
      )}
    </Card>
  );
}