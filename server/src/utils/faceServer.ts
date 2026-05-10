import path from 'path';

// All heavy native dependencies (canvas, @vladmandic/face-api, @tensorflow/tfjs-node)
// are loaded lazily so the server can start without them installed.
// These are only needed for server-side face detection (mobile app via Docker).
// The desktop app runs face detection client-side in the browser.

let faceapi: any = null;
let CanvasImage: any = null;
let available = false;
let modelsLoaded = false;
let loadingPromise: Promise<void> | null = null;

const ensureDeps = async (): Promise<boolean> => {
    if (available) return true;
    try {
        const [faceModule, canvasModule] = await Promise.all([
            import('@vladmandic/face-api'),
            // @ts-ignore – canvas is an optional native dependency, not always installed
            import('canvas'),
        ]);
        faceapi = faceModule;
        CanvasImage = canvasModule.Image;
        faceapi.env.monkeyPatch({
            Canvas: canvasModule.Canvas as any,
            Image: canvasModule.Image as any,
            ImageData: canvasModule.ImageData as any,
        });
        available = true;
        return true;
    } catch (err) {
        console.warn('[API] Face detection dependencies not available – server-side face detection is disabled.');
        console.warn('[API]', (err as Error).message);
        return false;
    }
};

export const isFaceApiAvailable = async (): Promise<boolean> => {
    return ensureDeps();
};

export const initFaceModels = async (): Promise<void> => {
    if (modelsLoaded) return;
    if (loadingPromise) return loadingPromise;

    const ok = await ensureDeps();
    if (!ok) throw new Error('Face detection dependencies not installed – unavailable in this environment');

    loadingPromise = (async () => {
        const modelsPath = path.resolve(__dirname, '../../../public/models');
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromDisk(modelsPath),
            faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath),
            faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath),
        ]);
        modelsLoaded = true;
        console.log('[API] Face models loaded from', modelsPath);
    })();

    return loadingPromise;
};

export const detectFaceDescriptorFromBase64 = async (base64Image: string): Promise<Float32Array | null> => {
    if (!modelsLoaded) {
        await initFaceModels();
    }

    return new Promise((resolve, reject) => {
        const img = new CanvasImage();
        img.onload = async () => {
            try {
                const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                resolve(detection ? detection.descriptor : null);
            } catch (err) {
                reject(err);
            }
        };
        img.onerror = (err: any) => reject(new Error('Failed to load base64 as Image: ' + err));

        const dataUrl = base64Image.startsWith('data:image/') ? base64Image : `data:image/jpeg;base64,${base64Image}`;
        img.src = dataUrl;
    });
};

export const compareDescriptors = (probe: Float32Array, stored: Float32Array): number => {
    return faceapi.euclideanDistance(Array.from(probe), Array.from(stored));
};

export const jsonToDescriptor = (json: string): Float32Array => new Float32Array(JSON.parse(json));

export const descriptorToJson = (descriptor: Float32Array): string => JSON.stringify(Array.from(descriptor));

