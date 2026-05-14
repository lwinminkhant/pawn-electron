import { app, BrowserWindow, ipcMain, utilityProcess } from 'electron';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_API_PORT = 8787;
const MANAGED_SETUP_ENABLED = !process.env.ELECTRON_START_URL;

let mainWindow: BrowserWindow | null = null;
let apiProcess: ReturnType<typeof utilityProcess.fork> | null = null;
let apiLastError: string | null = null;
let apiLastLog: string | null = null;

type RuntimeConfig = {
    apiPort: number;
    databaseUrl: string;
};

const getRuntimeConfigPath = () => path.join(app.getPath('userData'), 'runtime-config.json');

const readRuntimeConfig = async (): Promise<RuntimeConfig | null> => {
    try {
        const raw = await readFile(getRuntimeConfigPath(), 'utf8');
        const parsed = JSON.parse(raw) as Partial<RuntimeConfig>;
        if (typeof parsed.databaseUrl !== 'string' || parsed.databaseUrl.trim().length === 0) {
            return null;
        }
        const apiPort = Number(parsed.apiPort);
        return {
            apiPort: Number.isFinite(apiPort) && apiPort > 0 ? apiPort : DEFAULT_API_PORT,
            databaseUrl: parsed.databaseUrl.trim(),
        };
    } catch {
        return null;
    }
};

const writeRuntimeConfig = async (config: RuntimeConfig) => {
    await mkdir(path.dirname(getRuntimeConfigPath()), { recursive: true });
    await writeFile(getRuntimeConfigPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeApiStartupMessage = (message: string) => {
    if (/Database connection failed\./i.test(message)) {
        return 'Database connection failed. Check that PostgreSQL is running and that the database URL is correct.';
    }
    if (/Database setup is incomplete\./i.test(message)) {
        return 'Database setup is incomplete. Enter a valid PostgreSQL database URL and try again.';
    }
    if (/ECONNREFUSED|DrizzleQueryError|Failed query:/i.test(message)) {
        return 'Database connection failed. Check that PostgreSQL is running and that the database URL is correct.';
    }
    return message;
};

const probeApiHealth = async (apiPort: number) => {
    try {
        const res = await fetch(`http://127.0.0.1:${apiPort}/setup/status`);
        return res.ok;
    } catch {
        return false;
    }
};

const waitForApiHealth = async (apiPort: number, timeoutMs = 12000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await probeApiHealth(apiPort)) return true;
        await wait(250);
    }
    return false;
};

const getApiEntryPath = () =>
    app.isPackaged
        ? path.join(process.resourcesPath, 'app.asar', 'dist-server', 'server', 'src', 'index.js')
        : path.join(app.getAppPath(), 'dist-server', 'server', 'src', 'index.js');

const stopManagedApi = async () => {
    if (!apiProcess) return;
    const currentProcess = apiProcess;
    apiProcess = null;
    try {
        currentProcess.kill();
    } catch {
        // Ignore shutdown failures.
    }
    await wait(300);
};

const startManagedApi = async (config: RuntimeConfig) => {
    if (!MANAGED_SETUP_ENABLED) {
        return { success: false, message: 'Managed desktop setup is disabled in development mode.' };
    }

    await stopManagedApi();
    apiLastError = null;
    apiLastLog = null;

    const apiEntryPath = getApiEntryPath();
    const child = utilityProcess.fork(apiEntryPath, [], {
        serviceName: 'pawn-api',
        stdio: 'pipe',
        env: {
            ...process.env,
            API_PORT: String(config.apiPort),
            DATABASE_URL: config.databaseUrl,
        },
    });

    apiProcess = child;

    child.stdout?.on('data', (chunk) => {
        const text = chunk.toString();
        const trimmed = text.trim();
        if (trimmed) {
            apiLastLog = trimmed;
            console.log(`[Managed API] ${trimmed}`);
        }
    });

    child.stderr?.on('data', (chunk) => {
        const text = chunk.toString();
        const trimmed = text.trim();
        if (trimmed) {
            const normalized = normalizeApiStartupMessage(trimmed);
            apiLastLog = normalized;
            apiLastError = normalized;
            console.error(`[Managed API] ${normalized}`);
        }
    });

    child.once('exit', (code) => {
        if (apiProcess === child) {
            apiProcess = null;
        }
        if (code !== 0) {
            apiLastError = apiLastError || `Managed API exited with code ${String(code)}`;
        }
    });

    const healthy = await waitForApiHealth(config.apiPort);
    if (!healthy) {
        apiLastError = apiLastError || 'The local API did not become ready. Check the database URL and try again.';
        await stopManagedApi();
        return { success: false, message: apiLastError };
    }

    return { success: true };
};

const buildSetupStatus = async () => {
    const config = await readRuntimeConfig();
    const apiPort = config?.apiPort ?? DEFAULT_API_PORT;
    const apiHealthy = config ? await probeApiHealth(apiPort) : false;

    return {
        enabled: MANAGED_SETUP_ENABLED,
        configExists: Boolean(config),
        databaseUrl: config?.databaseUrl ?? '',
        apiPort,
        apiHealthy,
        apiRunning: apiHealthy,
        lastError: apiLastError,
        lastLog: apiLastLog,
    };
};

function createWindow() {
    const preloadPath = path.join(__dirname, 'preload.js');
    console.log('[Main] Preload path:', preloadPath);

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: preloadPath,
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../../dist/index.html')}`;
    mainWindow.loadURL(startUrl);
    if (process.env.ELECTRON_START_URL) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

ipcMain.handle('desktop-setup:get-status', async () => buildSetupStatus());

ipcMain.handle('desktop-setup:save-runtime-config', async (_event, payload: unknown) => {
    const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const databaseUrl = typeof record.databaseUrl === 'string' ? record.databaseUrl.trim() : '';
    const apiPort = Number(record.apiPort);

    if (!databaseUrl) {
        return {
            success: false,
            message: 'Database URL is required.',
            ...(await buildSetupStatus()),
        };
    }

    const config: RuntimeConfig = {
        databaseUrl,
        apiPort: Number.isFinite(apiPort) && apiPort > 0 ? apiPort : DEFAULT_API_PORT,
    };

    await writeRuntimeConfig(config);
    const result = await startManagedApi(config);

    return {
        ...result,
        ...(await buildSetupStatus()),
    };
});

app.whenReady().then(() => {
    if (MANAGED_SETUP_ENABLED) {
        void readRuntimeConfig().then((config) => {
            if (config) {
                void startManagedApi(config);
            }
        });
    }
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

app.on('before-quit', () => {
    void stopManagedApi();
});
