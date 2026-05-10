import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Eye, Upload, X } from "lucide-react";
import { Button, Dialog } from "./ui";

interface ImageUploadProps {
  currentImage?: string;
  onChange: (image: string) => void;
  onClear: () => void;
  disabled?: boolean;
  alt?: string;
}

const ImageUpload: React.FC<ImageUploadProps> = ({
  currentImage,
  onChange,
  onClear,
  disabled,
  alt = "Uploaded image",
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStartingCamera(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const processImage = async (image: HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const maxDimension = 1280;
    const scale = Math.min(
      1,
      maxDimension /
        Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height)
    );
    canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    setError(null);
    setUploading(true);
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = async () => {
      try {
        const dataUrl = await processImage(image);
        if (!dataUrl) {
          setError("Could not read the selected photo.");
          return;
        }
        onChange(dataUrl);
      } finally {
        URL.revokeObjectURL(url);
        setUploading(false);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setUploading(false);
      setError("Could not read the selected photo.");
    };
    image.src = url;
  };

  const startCamera = async () => {
    setError(null);
    setStartingCamera(true);
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setShowCapture(true);
    } catch {
      setError("Camera access denied. Please allow camera permission.");
      setStartingCamera(false);
    }
  };

  useEffect(() => {
    if (!showCapture || !streamRef.current || !videoRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().finally(() => setStartingCamera(false));
  }, [showCapture]);

  const captureFromCamera = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onChange(canvas.toDataURL("image/jpeg", 0.85));
    stopCamera();
    setShowCapture(false);
  };

  const closeCaptureDialog = () => {
    setShowCapture(false);
    stopCamera();
  };

  return (
    <div className="mt-2 flex flex-col items-start gap-2">
      {!disabled && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="h-12 w-12 px-0 gap-0"
            onClick={startCamera}
            disabled={startingCamera}
            loading={startingCamera}
            aria-label="Capture image"
          >
            {!startingCamera && <Camera size={18} />}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="h-12 w-12 px-0 gap-0 padding-[0px]"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            loading={uploading}
            aria-label={currentImage ? "Change photo" : "Upload photo"}
          >
            {!uploading && <Upload size={16} />}
          </Button>
          {currentImage && (
            <>
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="h-12 w-12 px-0 gap-0"
                onClick={() => setShowPreview(true)}
                aria-label="Preview image"
              >
                <Eye size={16} />
              </Button>
              <button
                type="button"
                onClick={onClear}
                className="inline-flex h-12 w-12 items-center justify-center rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--danger)] transition-colors duration-150 hover:bg-[var(--danger-soft)] hover:border-[var(--danger)]"
                aria-label="Remove photo"
              >
                <X size={16} />
              </button>
            </>
          )}
        </div>
      )}
      {error && <p className="text-[11px] text-[var(--danger)]">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <canvas ref={canvasRef} className="hidden" />
      <Dialog
        open={showPreview}
        onClose={() => setShowPreview(false)}
        size="md"
        title="Image Preview"
      >
        {currentImage ? (
          <img
            src={currentImage}
            alt={alt}
            className="max-h-[70vh] w-full rounded-[8px] object-contain"
          />
        ) : null}
      </Dialog>
      <Dialog
        open={showCapture}
        onClose={closeCaptureDialog}
        size="lg"
        title="Capture Item Image"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={closeCaptureDialog}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              leadingIcon={<Camera size={14} />}
              onClick={captureFromCamera}
              disabled={startingCamera}
            >
              Capture
            </Button>
          </>
        }
      >
        <div className="overflow-hidden rounded-[8px] border border-[var(--hairline)] bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="max-h-[60vh] w-full object-contain"
          />
        </div>
      </Dialog>
    </div>
  );
};

export default React.memo(ImageUpload);
