declare module 'html5-qrcode' {
  export interface CameraDevice { id: string; label: string; }
  export enum Html5QrcodeSupportedFormats {
    QR_CODE = 0,
    // (We only need QR_CODE for now; others omitted for brevity)
  }
  export class Html5Qrcode {
    constructor(elementId: string);
    static getCameras(): Promise<CameraDevice[]>;
    start(
      cameraConfig: any,
      config?: {
        fps?: number;
        qrbox?: { width: number; height: number } | number;
        aspectRatio?: number;
        disableFlip?: boolean;
        formatsToSupport?: Html5QrcodeSupportedFormats[];
      },
      onScanSuccess?: (decodedText: string, decodedResult?: any) => void,
      onScanFailure?: (error: string) => void
    ): Promise<void>;
    stop(): Promise<void>;
    clear(): Promise<void>;
  }
}
