import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, Check, RotateCcw, ScanFace, X } from 'lucide-react';
import { Button } from './ui';
import { loadFaceModels, detectFace, findBestMatches, type FaceMatch } from '../utils/faceApi';
import { waitUntilVideoHasFrame } from '../utils/waitForVideoFrame';
import { getStoredCameraId, getVideoConstraints } from '../utils/cameraPreferences';

interface FaceSearchProps {
    customers: Array<{ id: number; name: string; phone?: string; faceDescriptor?: string; photo?: string }>;
    onSelect: (customerId: number) => void;
    onClose: () => void;
}

const FaceSearch: React.FC<FaceSearchProps> = ({ customers, onSelect, onClose }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [videoReady, setVideoReady] = useState(false);
    const [modelsReady, setModelsReady] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastResult, setLastResult] = useState<FaceMatch[] | null>(null);
    const [noFace, setNoFace] = useState(false);

    const customersWithFace = customers.filter((c) => c.faceDescriptor);

    useEffect(() => {
        loadFaceModels()
            .then(() => setModelsReady(true))
            .catch(() => setError('Failed to load face recognition models'));
    }, []);

    const startCamera = useCallback(async () => {
        setError(null);
        setLastResult(null);
        setNoFace(false);
        setVideoReady(false);
        try {
            const preferredCameraId = getStoredCameraId('face');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: getVideoConstraints('face', preferredCameraId),
            });
            streamRef.current = stream;
            setIsStreaming(true);
        } catch {
            setError('Camera access denied.');
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
        const timeoutId = window.setTimeout(() => {
            void startCamera();
        }, 0);

        return () => {
            window.clearTimeout(timeoutId);
            stopCamera();
        };
    }, [startCamera, stopCamera]);

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

    const scanFace = async () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0);

        setScanning(true);
        setNoFace(false);
        setLastResult(null);

        try {
            const descriptor = await detectFace(canvas);
            if (!descriptor) {
                setNoFace(true);
                setScanning(false);
                return;
            }

            const matches = findBestMatches(descriptor, customers);
            setLastResult(matches);

            // Stop camera after scan so the results list is prominent
            if (matches.length > 0) {
                stopCamera();
            }
        } catch {
            setError('Face detection failed. Try again.');
        }
        setScanning(false);
    };

    const handleSelectMatch = (customerId: number) => {
        stopCamera();
        onSelect(customerId);
    };

    const handleRescan = () => {
        setLastResult(null);
        setNoFace(false);
        setError(null);
        startCamera();
    };

    const handleClose = () => {
        stopCamera();
        onClose();
    };

    const confidenceLabel = (distance: number) => {
        if (distance < 0.35) return 'Very high';
        if (distance < 0.45) return 'High';
        if (distance < 0.55) return 'Medium';
        return 'Low';
    };

    const confidenceColor = (distance: number) => {
        if (distance < 0.35) return 'text-green-600';
        if (distance < 0.45) return 'text-green-500';
        if (distance < 0.55) return 'text-yellow-600';
        return 'text-orange-500';
    };

    const confidenceBg = (distance: number) => {
        if (distance < 0.45) return 'border-green-500/30 bg-green-500/5';
        if (distance < 0.55) return 'border-yellow-500/30 bg-yellow-500/5';
        return 'border-orange-500/30 bg-orange-500/5';
    };

    // Look up the customer object so we can show their photo in results
    const getCustomer = (id: number) => customers.find((c) => c.id === id);

    return (
        <div className="p-4 border border-[var(--brass)] rounded-[10px] bg-[var(--surface-raised)] space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ScanFace size={16} className="text-[var(--brass)]" />
                    <h4 className="text-[13px] font-semibold">Face Search</h4>
                    <span className="text-[11px] text-[var(--text-muted)]">
                        {customersWithFace.length} faces on file
                    </span>
                </div>
                <button
                    type="button"
                    onClick={handleClose}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5"
                    aria-label="Close face search"
                >
                    <X size={16} />
                </button>
            </div>

            {error && (
                <p className="text-[11px] text-[var(--danger)]">{error}</p>
            )}

            {isStreaming && (
                <div className="space-y-2">
                    <div className="relative rounded-[8px] overflow-hidden border border-[var(--hairline)] bg-black">
                        <video
                            ref={videoRef}
                            className="w-full max-w-[360px]"
                            autoPlay
                            playsInline
                            muted
                        />
                        {!videoReady && !scanning && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <p className="text-white text-[12px]">Starting camera…</p>
                            </div>
                        )}
                        {scanning && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <p className="text-white text-[12px]">Scanning…</p>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            leadingIcon={<Camera size={12} />}
                            onClick={scanFace}
                            disabled={scanning || !modelsReady || !videoReady}
                            loading={scanning}
                        >
                            {scanning ? 'Scanning…' : !videoReady ? 'Starting…' : 'Scan Face'}
                        </Button>
                    </div>
                </div>
            )}

            <canvas ref={canvasRef} className="hidden" />

            {noFace && (
                <div className="space-y-2">
                    <p className="text-[12px] text-[var(--text-muted)]">
                        No face detected. Make sure the face is clearly visible and try again.
                    </p>
                    {!isStreaming && (
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            leadingIcon={<RotateCcw size={12} />}
                            onClick={handleRescan}
                        >
                            Try Again
                        </Button>
                    )}
                </div>
            )}

            {lastResult !== null && lastResult.length === 0 && !noFace && (
                <div className="space-y-2">
                    <p className="text-[12px] text-[var(--text-muted)]">
                        No matching customer found. The person may not be registered yet.
                    </p>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        leadingIcon={<RotateCcw size={12} />}
                        onClick={handleRescan}
                    >
                        Scan Again
                    </Button>
                </div>
            )}

            {lastResult && lastResult.length > 0 && (
                <div className="space-y-2">
                    <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium">
                        {lastResult.length === 1 ? '1 match found' : `${lastResult.length} matches found`} — tap to select
                    </p>
                    <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                        {lastResult.map((m) => {
                            const customer = getCustomer(m.customerId);
                            return (
                                <button
                                    type="button"
                                    key={m.customerId}
                                    onClick={() => handleSelectMatch(m.customerId)}
                                    className={`w-full text-left flex items-center gap-3 p-2.5 rounded-[8px] border transition-all
                                        hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:scale-[1.01] active:scale-[0.99]
                                        cursor-pointer ${confidenceBg(m.distance)}`}
                                >
                                    {customer?.photo ? (
                                        <img
                                            src={customer.photo}
                                            alt=""
                                            className="w-10 h-10 rounded-full object-cover border border-[var(--hairline)] shrink-0"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-[var(--brass-softer)] border border-[var(--hairline)] flex items-center justify-center shrink-0">
                                            <span className="text-[14px] font-semibold text-[var(--brass)]">
                                                {m.name.charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-semibold truncate">{m.name}</p>
                                        {customer?.phone && (
                                            <p className="text-[11px] text-[var(--text-muted)] mono">{customer.phone}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className={`text-[11px] font-medium ${confidenceColor(m.distance)}`}>
                                            {confidenceLabel(m.distance)}
                                        </span>
                                        <Check size={14} className="text-[var(--brass)]" />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        leadingIcon={<RotateCcw size={12} />}
                        onClick={handleRescan}
                    >
                        Scan Again
                    </Button>
                </div>
            )}
        </div>
    );
};

export default FaceSearch;
