import * as faceapi from '@vladmandic/face-api';

let modelsLoaded = false;
let loadingPromise: Promise<void> | null = null;

export const loadFaceModels = async (): Promise<void> => {
    if (modelsLoaded) return;
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
        const MODEL_URL = '/models';
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        modelsLoaded = true;
    })();

    return loadingPromise;
};

export const isModelsLoaded = () => modelsLoaded;

export const detectFace = async (
    input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
): Promise<Float32Array | null> => {
    if (!modelsLoaded) await loadFaceModels();

    const detection = await faceapi
        .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

    return detection?.descriptor ?? null;
};

export const descriptorToJson = (descriptor: Float32Array): string =>
    JSON.stringify(Array.from(descriptor));

export const jsonToDescriptor = (json: string): Float32Array =>
    new Float32Array(JSON.parse(json));

export const compareFaces = (
    probe: Float32Array,
    stored: Float32Array,
): number => faceapi.euclideanDistance(Array.from(probe), Array.from(stored));

const MATCH_THRESHOLD = 0.6;

export interface FaceMatch {
    customerId: number;
    distance: number;
    name: string;
}

export const findBestMatches = (
    probe: Float32Array,
    customers: Array<{ id: number; name: string; faceDescriptor?: string }>,
    threshold = MATCH_THRESHOLD,
): FaceMatch[] => {
    const matches: FaceMatch[] = [];

    for (const c of customers) {
        if (!c.faceDescriptor) continue;
        try {
            const stored = jsonToDescriptor(c.faceDescriptor);
            const distance = compareFaces(probe, stored);
            if (distance < threshold) {
                matches.push({ customerId: c.id, distance, name: c.name });
            }
        } catch {
            // skip invalid descriptors
        }
    }

    return matches.sort((a, b) => a.distance - b.distance);
};
