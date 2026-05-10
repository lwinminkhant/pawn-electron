# Face Recognition — Technical Documentation

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **ML Library** | [`@vladmandic/face-api`](https://github.com/vladmandic/face-api) v1.7+ | Face detection, landmark recognition, and face descriptor extraction |
| **Neural Networks** | TinyFaceDetector, FaceLandmark68Net, FaceRecognitionNet | Pre-trained models bundled in `public/models/` |
| **Matching Algorithm** | Euclidean distance on 128-dimensional face descriptors | Similarity comparison between probe and stored faces |
| **Client Runtime** | Browser (WebGL via TensorFlow.js backend) | Desktop / web app face processing |
| **Server Runtime** | Node.js + `canvas` + `@tensorflow/tfjs-node` | Docker / mobile API face processing |

---

## How It Works

### 1. Face Detection Pipeline

```
Camera frame → TinyFaceDetector → FaceLandmark68Net → FaceRecognitionNet → 128-D descriptor
```

1. **TinyFaceDetector** — A lightweight, MobileNet-based single-shot face detector. Locates faces in the image with a configurable `scoreThreshold` (set to `0.5`).
2. **FaceLandmark68Net** — Detects 68 facial landmark points (eyes, nose, mouth, jawline) for face alignment.
3. **FaceRecognitionNet** — A ResNet-34-based model that produces a **128-dimensional floating-point descriptor** (embedding) unique to each face.

### 2. Face Matching

Matching uses **Euclidean distance** between two 128-D descriptors:

```
distance = √( Σ (probe[i] - stored[i])² )   for i = 0..127
```

| Distance | Confidence | Meaning |
|----------|-----------|---------|
| < 0.35 | Very High | Almost certainly the same person |
| 0.35 – 0.45 | High | Very likely the same person |
| 0.45 – 0.55 | Medium | Possibly the same person |
| 0.55 – 0.60 | Low | Weak match, should verify manually |
| ≥ 0.60 | No match | Different person (rejected) |

The **match threshold** is `0.6` — any distance below this is considered a potential match.

### 3. Storage

Face descriptors are stored as **JSON-serialized arrays** in the `customers.face_descriptor` column (text):

```json
[0.0234, -0.1456, 0.0891, ..., 0.0412]   // 128 float values
```

---

## Architecture

### Client-Side (Desktop / Web)

Used for both the **Pawn** and **Customers** pages.

```
src/utils/faceApi.ts          — Model loading, detection, matching logic
src/components/FaceSearch.tsx  — Camera UI, scan button, clickable results list
src/components/WebcamCapture.tsx — Photo capture with automatic face descriptor extraction
```

**Flow:**
1. Models loaded once from `/models/` (served by Vite from `public/models/`)
2. Camera captures a frame → drawn to an offscreen `<canvas>`
3. `detectFace(canvas)` runs the 3-stage pipeline → returns a `Float32Array` descriptor
4. `findBestMatches(descriptor, customers)` compares against all stored descriptors
5. Results shown as a clickable list — user picks the correct match

### Server-Side (Docker / Mobile API)

Used by the mobile React Native app via `POST /api/faces/detect-and-search`.

```
server/src/utils/faceServer.ts  — Lazy-loaded face detection with native canvas
server/src/index.ts             — API endpoint for face search
```

**Key differences from client:**
- Uses **`canvas`** npm package (native C++ bindings) instead of browser Canvas API
- Uses **`@tensorflow/tfjs-node`** for faster CPU-based inference
- Dependencies are **lazy-loaded** — the server starts even if they're not installed
- Models loaded from disk (`public/models/`) via `loadFromDisk()` instead of `loadFromUri()`

---

## Models

Three pre-trained model files are bundled in `public/models/`:

| Model | File | Size | Purpose |
|-------|------|------|---------|
| TinyFaceDetector | `tiny_face_detector_model.bin` | ~189 KB | Locates faces in the image |
| FaceLandmark68Net | `face_landmark_68_model.bin` | ~349 KB | Detects 68 facial landmark points |
| FaceRecognitionNet | `face_recognition_model.bin` | ~6.1 MB | Generates 128-D face embeddings |

Models are quantized (uint8) to reduce file size while maintaining accuracy.

---

## API Endpoints

### `POST /api/faces/detect-and-search`

Server-side face detection and matching (used by mobile app).

**Request:**
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

**Response:**
```json
{
  "success": true,
  "descriptor": "[0.023, -0.145, ...]",
  "matches": [
    { "customerId": 42, "distance": 0.31, "name": "U Kyaw" },
    { "customerId": 17, "distance": 0.48, "name": "Daw Aye" }
  ]
}
```

---

## Configuration

| Setting | Value | Location |
|---------|-------|----------|
| Score threshold (detection) | `0.5` | `faceApi.ts:31`, `faceServer.ts:72` |
| Match threshold (similarity) | `0.6` | `faceApi.ts:49` |
| Camera resolution | 480 × 360 | `FaceSearch.tsx`, `WebcamCapture.tsx` |
| Descriptor dimensions | 128 floats | Fixed by FaceRecognitionNet architecture |

---

## Performance Notes

- **Model loading**: ~1–3 seconds on first use (cached by browser afterwards)
- **Detection speed**: ~100–300ms per frame (WebGL), ~200–500ms (CPU/server)
- **Matching speed**: O(n) — compares against all stored descriptors linearly
- **Memory**: Models use ~7 MB total; each descriptor is 512 bytes (128 × 4 bytes)
- For large customer bases (>10,000), consider indexing descriptors with an approximate nearest neighbor (ANN) library
