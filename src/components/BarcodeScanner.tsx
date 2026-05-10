import React, { useEffect, useId, useRef, useState } from "react";
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
} from "html5-qrcode";
import { Camera, RefreshCcw, X } from "lucide-react";
import { Button } from "./ui";
import {
  type CameraDeviceInfo,
  listVideoInputDevices,
  resolveCameraId,
} from "../utils/cameraPreferences";

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string, decodedResult: unknown) => boolean;
  onClose: () => void;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScanSuccess,
  onClose,
}) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerRegionId = useId().replace(/:/g, "-");
  const [cameras, setCameras] = useState<CameraDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [loadingCameras, setLoadingCameras] = useState(true);
  const [startingCamera, setStartingCamera] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadCameras = async () => {
      setLoadingCameras(true);
      setScanError(null);
      try {
        const devices = await listVideoInputDevices(true);
        if (cancelled) return;
        setCameras(devices);
        setSelectedCameraId((current) => {
          if (current && devices.some((device) => device.id === current)) {
            return current;
          }
          return resolveCameraId("ticket", devices);
        });
        if (devices.length === 0) {
          setScanError("No camera devices were found.");
        }
      } catch (error) {
        console.error("Failed to list cameras.", error);
        if (!cancelled) {
          setCameras([]);
          setSelectedCameraId(null);
          setScanError("Camera access is unavailable. Check permissions and try again.");
        }
      } finally {
        if (!cancelled) setLoadingCameras(false);
      }
    };

    void loadCameras();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCameraId) return;

    let cancelled = false;
    const scanner = new Html5Qrcode(scannerRegionId, {
      verbose: false,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
      ],
    });

    scannerRef.current = scanner;

    const startScanner = async () => {
      setStartingCamera(true);
      setScanError(null);
      try {
        await scanner.start(
          selectedCameraId,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
            disableFlip: false,
          },
          (decodedText, decodedResult) => {
            const handled = onScanSuccess(decodedText, decodedResult);
            if (!handled) {
              setScanError("Scanned code did not contain a valid ticket ID.");
              return;
            }
            setScanError(null);
          },
          () => {}
        );
      } catch (error) {
        console.error("Failed to start scanner.", error);
        if (!cancelled) {
          setScanError("Could not start the selected camera.");
        }
      } finally {
        if (!cancelled) setStartingCamera(false);
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      const activeScanner = scannerRef.current;
      scannerRef.current = null;
      if (!activeScanner) return;
      void activeScanner
        .stop()
        .catch(() => {})
        .finally(() => {
          try {
            activeScanner.clear();
          } catch {
            // ignore cleanup errors from partially-started scanners
          }
        });
    };
  }, [onScanSuccess, scannerRegionId, selectedCameraId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        aria-hidden
      />
      <div className="relative w-full max-w-lg bg-[var(--surface-raised)] border border-[var(--hairline)] rounded-[12px] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.4)]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hairline)]">
          <div className="flex items-center gap-2">
            <Camera size={15} className="text-[var(--brass)]" aria-hidden />
            <h3 className="text-[14px] font-semibold tracking-tight">
              Scan QR / Barcode
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="p-1.5 rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-end gap-2">
            <label className="flex-1">
              <span className="block text-[11px] uppercase tracking-wide text-[var(--text-muted)] mb-1.5">
                Camera
              </span>
              <select
                value={selectedCameraId ?? ""}
                onChange={(e) => setSelectedCameraId(e.target.value || null)}
                disabled={loadingCameras || cameras.length === 0}
                className="w-full h-9 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-canvas)] px-3 text-[13px] outline-none focus:border-[var(--brass)]"
              >
                {cameras.length === 0 ? (
                  <option value="">No cameras found</option>
                ) : (
                  cameras.map((camera) => (
                    <option key={camera.id} value={camera.id}>
                      {camera.label || `Camera ${camera.id}`}
                    </option>
                  ))
                )}
              </select>
            </label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leadingIcon={<RefreshCcw size={14} />}
              onClick={() => {
                setLoadingCameras(true);
                void listVideoInputDevices(true)
                  .then((devices) => {
                    setCameras(devices);
                    setSelectedCameraId((current) => {
                      if (
                        current &&
                        devices.some((device) => device.id === current)
                      ) {
                        return current;
                      }
                      return resolveCameraId("ticket", devices);
                    });
                    setScanError(
                      devices.length === 0 ? "No camera devices were found." : null
                    );
                  })
                  .catch((error) => {
                    console.error("Failed to refresh cameras.", error);
                    setScanError(
                      "Camera access is unavailable. Check permissions and try again."
                    );
                  })
                  .finally(() => setLoadingCameras(false));
              }}
              disabled={loadingCameras}
            >
              Refresh
            </Button>
          </div>

          <div
            id={scannerRegionId}
            className="w-full min-h-[280px] overflow-hidden rounded-[8px] border border-dashed border-[var(--hairline-strong)] bg-black"
          />

          {startingCamera && (
            <p className="text-center text-[12.5px] text-[var(--text-muted)]">
              Starting camera…
            </p>
          )}
          {scanError && (
            <p className="text-center text-[12.5px] text-[var(--danger)]">
              {scanError}
            </p>
          )}
          <p className="text-center text-[12.5px] text-[var(--text-muted)]">
            The scanner now defaults to the highest-priority camera and lets you
            switch devices directly.
          </p>
        </div>
      </div>
    </div>
  );
};

export default BarcodeScanner;
