import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, RotateCcw, Upload, X } from 'lucide-react';
import { Button } from './ui';
import { loadFaceModels, detectFace, descriptorToJson } from '../utils/faceApi';
import { waitUntilVideoHasFrame } from '../utils/waitForVideoFrame';
import { getStoredCameraId, getVideoConstraints } from '../utils/cameraPreferences';

interface WebcamCaptureProps {
    onCapture: (photo: string, faceDescriptor: string | null) => void;
    onClear: () => void;
    currentPhoto?: string;
    disabled?: boolean;
}

const WebcamCapture: React.FC<WebcamCaptureProps> = ({
    onCapture,
    onClear,
    currentPhoto,
    disabled,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [videoReady, setVideoReady] = useState(false);
    const [modelsReady, setModelsReady] = useState(false);
    const [detecting, setDetecting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadFaceModels()
            .then(() => setModelsReady(true))
            .catch(() => setModelsReady(true));
    }, []);

    const startCamera = useCallback(async () => {
        setError(null);
        setVideoReady(false);
        try {
            const preferredCameraId = getStoredCameraId('face');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: getVideoConstraints('face', preferredCameraId),
            });
            streamRef.current = stream;
            setIsStreaming(true);
        } catch {
            setError('Camera access denied. Please allow camera permission.');
        }
    }, []);

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setIsStreaming(false);
        setVideoReady(false);
    }, []);

    useEffect(() => {
        if (!isStreaming) return;
        const stream = streamRef.current;
        if (!stream) return;

        let cancelled = false;
        let rafWait = 0;
        const currentVideo = videoRef.current;

        const fail = (message: string) => {
            if (cancelled) return;
            setError(message);
            stopCamera();
        };

        const attach = () => {
            const video = videoRef.current;
            if (!video) {
                rafWait = requestAnimationFrame(attach);
                return;
            }

            void (async () => {
                try {
                    video.srcObject = stream;
                    await video.play();
                    await waitUntilVideoHasFrame(video);
                    if (!cancelled) setVideoReady(true);
                } catch (e) {
                    if (cancelled) return;
                    const msg =
                        e instanceof Error && e.message.includes('did not produce')
                            ? 'Camera is slow or busy. Close other apps using the camera and try again.'
                            : 'Camera failed to start.';
                    fail(msg);
                }
            })();
        };

        attach();

        return () => {
            cancelled = true;
            cancelAnimationFrame(rafWait);
            if (currentVideo) currentVideo.srcObject = null;
        };
    }, [isStreaming, stopCamera]);

    useEffect(() => () => stopCamera(), [stopCamera]);

    const capturePhoto = async () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

        setDetecting(true);
        let descriptor: string | null = null;
        try {
            const fd = await detectFace(canvas);
            if (fd) descriptor = descriptorToJson(fd);
        } catch {
            // face detection is optional
        }
        setDetecting(false);

        stopCamera();
        onCapture(dataUrl, descriptor);
    };

    const processImageElement = async (image: HTMLImageElement) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const maxDimension = 1280;
        const scale = Math.min(
            1,
            maxDimension / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height),
        );
        canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
        canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));

        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        let descriptor: string | null = null;
        try {
            const fd = await detectFace(canvas);
            if (fd) descriptor = descriptorToJson(fd);
        } catch {
            // face detection is optional for uploaded photos
        }

        return {
            photo: canvas.toDataURL('image/jpeg', 0.85),
            descriptor,
        };
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setError('Please choose an image file.');
            return;
        }

        setError(null);
        setUploading(true);
        stopCamera();

        const url = URL.createObjectURL(file);
        try {
            const image = new Image();
            image.onload = async () => {
                try {
                    const result = await processImageElement(image);
                    if (!result) {
                        setError('Could not read the selected photo.');
                        return;
                    }
                    onCapture(result.photo, result.descriptor);
                } finally {
                    URL.revokeObjectURL(url);
                    setUploading(false);
                }
            };
            image.onerror = () => {
                URL.revokeObjectURL(url);
                setUploading(false);
                setError('Could not read the selected photo.');
            };
            image.src = url;
        } catch {
            URL.revokeObjectURL(url);
            setUploading(false);
            setError('Could not read the selected photo.');
        }
    };

    const handleClear = () => {
        onClear();
        stopCamera();
    };

    if (disabled && currentPhoto) {
        return (
            <div className="flex items-center gap-3">
                <img
                    src={currentPhoto}
                    alt="Customer"
                    className="w-16 h-16 rounded-[8px] object-cover border border-[var(--hairline)]"
                />
                <span className="text-[12px] text-[var(--text-muted)]">
                    Photo on file
                </span>
            </div>
        );
    }

    if (currentPhoto && !isStreaming) {
        return (
            <div className="space-y-2">
                <div className="relative inline-block">
                    <img
                        src={currentPhoto}
                        alt="Captured"
                        className="w-32 h-24 rounded-[8px] object-cover border border-[var(--hairline)]"
                    />
                    <button
                        type="button"
                        onClick={handleClear}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-[var(--danger)] text-white rounded-full flex items-center justify-center"
                        aria-label="Remove photo"
                    >
                        <X size={10} />
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        leadingIcon={<RotateCcw size={12} />}
                        onClick={startCamera}
                    >
                        Retake
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        leadingIcon={<Upload size={12} />}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        loading={uploading}
                    >
                        {uploading ? 'Uploading…' : 'Change'}
                    </Button>
                </div>
                {error && (
                    <p className="mt-1 text-[11px] text-[var(--danger)]">
                        {error}
                    </p>
                )}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                />
                <canvas ref={canvasRef} className="hidden" />
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {isStreaming ? (
                <div className="space-y-2">
                    <div className="relative rounded-[8px] overflow-hidden border border-[var(--hairline)] bg-black">
                        <video
                            ref={videoRef}
                            className="w-full max-w-[320px]"
                            autoPlay
                            playsInline
                            muted
                        />
                        {!videoReady && !detecting && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <p className="text-white text-[12px]">
                                    Starting camera…
                                </p>
                            </div>
                        )}
                        {detecting && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <p className="text-white text-[12px]">
                                    Detecting face…
                                </p>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            leadingIcon={<Camera size={12} />}
                            onClick={capturePhoto}
                            disabled={detecting || !videoReady}
                            loading={detecting}
                        >
                            {detecting ? 'Processing…' : !videoReady ? 'Starting…' : 'Capture'}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={stopCamera}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            ) : (
                <div>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        leadingIcon={<Camera size={14} />}
                        onClick={startCamera}
                        disabled={disabled}
                    >
                        {modelsReady ? 'Take Photo' : 'Loading models…'}
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        leadingIcon={<Upload size={14} />}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={disabled || uploading}
                        loading={uploading}
                        className="ml-2"
                    >
                        {uploading ? 'Uploading…' : 'Upload'}
                    </Button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                    {error && (
                        <p className="mt-1 text-[11px] text-[var(--danger)]">
                            {error}
                        </p>
                    )}
                </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
};

export default WebcamCapture;
