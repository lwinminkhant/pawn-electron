export type CameraRole = "face" | "ticket";

export interface CameraDeviceInfo {
  id: string;
  label: string;
}

const STORAGE_KEYS: Record<CameraRole, string> = {
  face: "preferredFaceCameraId",
  ticket: "preferredTicketCameraId",
};

const SCORE_PATTERNS: Record<
  CameraRole,
  Array<{ pattern: RegExp; score: number }>
> = {
  face: [
    { pattern: /front|facetime|internal|built-?in|integrated|user/i, score: 120 },
    { pattern: /continuity/i, score: 60 },
    { pattern: /back|rear|environment|world/i, score: -30 },
  ],
  ticket: [
    { pattern: /back|rear|environment|world/i, score: 120 },
    { pattern: /external|usb|brio|logi|webcam/i, score: 80 },
    { pattern: /continuity/i, score: 60 },
    { pattern: /front|facetime|internal|built-?in|integrated|user/i, score: -40 },
  ],
};

export function getStoredCameraId(role: CameraRole) {
  return window.localStorage.getItem(STORAGE_KEYS[role]);
}

export function setStoredCameraId(role: CameraRole, cameraId: string | null) {
  if (cameraId) {
    window.localStorage.setItem(STORAGE_KEYS[role], cameraId);
  } else {
    window.localStorage.removeItem(STORAGE_KEYS[role]);
  }
}

export async function listVideoInputDevices(requestPermission = false) {
  let stream: MediaStream | null = null;

  try {
    if (requestPermission) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true,
      });
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === "videoinput")
      .map((device) => ({
        id: device.deviceId,
        label: device.label,
      }));
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}

function getCameraScore(role: CameraRole, camera: CameraDeviceInfo) {
  return SCORE_PATTERNS[role].reduce((score, { pattern, score: delta }) => {
    return pattern.test(camera.label) ? score + delta : score;
  }, 0);
}

export function getDefaultCameraId(
  role: CameraRole,
  cameras: CameraDeviceInfo[],
) {
  return [...cameras].sort(
    (a, b) => getCameraScore(role, b) - getCameraScore(role, a),
  )[0]?.id ?? null;
}

export function resolveCameraId(role: CameraRole, cameras: CameraDeviceInfo[]) {
  const storedCameraId = getStoredCameraId(role);
  if (storedCameraId && cameras.some((camera) => camera.id === storedCameraId)) {
    return storedCameraId;
  }

  return getDefaultCameraId(role, cameras);
}

export function getVideoConstraints(
  role: CameraRole,
  cameraId?: string | null,
): MediaTrackConstraints {
  const base = { width: 480, height: 360 };

  if (cameraId) {
    return {
      ...base,
      deviceId: { exact: cameraId },
    };
  }

  return {
    ...base,
    facingMode: role === "face" ? "user" : "environment",
  };
}
