/**
 * MediaStream-backed <video> often never fires `loadeddata` in Electron/Chromium.
 * Wait until dimensions and readyState indicate a real frame is available.
 */
export function waitUntilVideoHasFrame(
    video: HTMLVideoElement,
    options: { timeoutMs?: number } = {},
): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 12000;

    const hasFrame = (): boolean =>
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0;

    if (hasFrame()) return Promise.resolve();

    return new Promise((resolve, reject) => {
        let raf = 0;
        let settled = false;

        const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            cleanup();
            fn();
        };

        const cleanup = () => {
            window.clearTimeout(timer);
            cancelAnimationFrame(raf);
            video.removeEventListener('loadedmetadata', onEvent);
            video.removeEventListener('loadeddata', onEvent);
            video.removeEventListener('canplay', onEvent);
            video.removeEventListener('playing', onEvent);
        };

        const onEvent = () => {
            if (hasFrame()) finish(() => resolve());
        };

        video.addEventListener('loadedmetadata', onEvent);
        video.addEventListener('loadeddata', onEvent);
        video.addEventListener('canplay', onEvent);
        video.addEventListener('playing', onEvent);

        const timer = window.setTimeout(() => {
            if (hasFrame()) finish(() => resolve());
            else finish(() => reject(new Error('Camera did not produce a video frame in time')));
        }, timeoutMs);

        const loop = () => {
            if (hasFrame()) {
                finish(() => resolve());
                return;
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
    });
}
