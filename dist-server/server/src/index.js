import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { and, count, desc, eq, gte, inArray, lte, or, sql, sum } from 'drizzle-orm';
import { db, getDatabaseSessionTimeZone, setDatabaseSessionTimeZone, verifyDatabaseConnection } from './db/index.js';
import { cashTransactions, customers, employees, items, pawns, settings } from './db/schema.js';
import { GOLD_JEWELLERY_ITEM_TYPE, getStorageInfo, getStoragePlacementForDate, normalizeStorageLocation, usesGoldJewelleryStorage, } from '../../shared/storage/storageUtils.js';
import { calculateInterestAmountForPeriod, calculateRedeemInterest, } from '../../shared/settlement/calculations.js';
const DAY_MS = 24 * 60 * 60 * 1000;
const BUSINESS_DATE_HEADER = 'x-business-date';
const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const getTimeZoneDateParts = (value, timeZone) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(value);
    return {
        year: Number(parts.find((part) => part.type === 'year')?.value || 0),
        month: Number(parts.find((part) => part.type === 'month')?.value || 0),
        day: Number(parts.find((part) => part.type === 'day')?.value || 0),
    };
};
const getTimeZoneDayIndex = (value, timeZone) => {
    const { year, month, day } = getTimeZoneDateParts(value, timeZone);
    return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
};
const getCalendarAnchorInTimeZone = (value, timeZone = getDatabaseSessionTimeZone()) => {
    const { year, month, day } = getTimeZoneDateParts(value, timeZone);
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
};
const parseBusinessDateValue = (value) => {
    if (!value)
        return null;
    const match = BUSINESS_DATE_PATTERN.exec(value.trim());
    if (!match)
        return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
        return null;
    }
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
};
const getRequestBusinessDate = (req) => parseBusinessDateValue(req.header(BUSINESS_DATE_HEADER)) ?? new Date();
const getRequestTransactionDate = (req, timeZone = getDatabaseSessionTimeZone()) => {
    const businessDate = getRequestBusinessDate(req);
    const now = new Date();
    const dayDelta = getTimeZoneDayIndex(businessDate, timeZone) -
        getTimeZoneDayIndex(now, timeZone);
    return new Date(now.getTime() + dayDelta * DAY_MS);
};
const getDaysDueToToday = (lastPaymentDate, createdAt, timeZone = getDatabaseSessionTimeZone(), referenceDate = new Date()) => {
    const baseDate = new Date(lastPaymentDate || createdAt || referenceDate);
    return Math.max(0, getTimeZoneDayIndex(referenceDate, timeZone) - getTimeZoneDayIndex(baseDate, timeZone));
};
const addCalendarDaysInTimeZone = (value, daysToAdd, timeZone = getDatabaseSessionTimeZone()) => {
    const { year, month, day } = getTimeZoneDateParts(value, timeZone);
    return new Date(Date.UTC(year, month - 1, day + daysToAdd, 12, 0, 0, 0));
};
const getDayRangeInTimeZone = (value, timeZone = getDatabaseSessionTimeZone()) => {
    const { year, month, day } = getTimeZoneDateParts(value, timeZone);
    return {
        start: new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)),
        end: new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0)),
    };
};
const getTimeZoneYmd = (value, timeZone = getDatabaseSessionTimeZone()) => {
    const { year, month, day } = getTimeZoneDateParts(value, timeZone);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
const getExistingPawnCountForDate = async (currentDate, executor = db) => {
    const timeZone = getDatabaseSessionTimeZone();
    const ymd = getTimeZoneYmd(currentDate, timeZone);
    const rows = await executor
        .select({ value: count() })
        .from(cashTransactions)
        .leftJoin(pawns, eq(cashTransactions.pawnFk, pawns.id))
        .leftJoin(items, eq(pawns.itemFk, items.id))
        .where(and(eq(cashTransactions.type, 'PAWN'), eq(items.type, GOLD_JEWELLERY_ITEM_TYPE), sql `date(${cashTransactions.date}) = ${ymd}`));
    return Number(rows[0]?.value || 0);
};
const PRINCIPAL_IN_TRANSACTION_TYPES = ['PAWN', 'PLUS_AMOUNT'];
const PRINCIPAL_OUT_TRANSACTION_TYPES = ['MINUS_AMOUNT', 'REDEEM_BA'];
const REDEMPTION_TRANSACTION_TYPES = ['REDEEM_BA', 'REDEEM_I'];
const PAID_INTEREST_TRANSACTION_TYPE = 'PAID_INTEREST';
const resolveStoredLocation = (row) => {
    if (!usesGoldJewelleryStorage(row.itemType)) {
        return {
            ...row,
            storageLocation: null,
            boxNumber: null,
            trayNumber: null,
            dayOfMonth: null,
            sequence: null,
            slotNumber: null,
        };
    }
    if (!row.createdAt) {
        return {
            ...row,
            physicalNumber: null,
            storageLocation: normalizeStorageLocation(row.storageLocation),
        };
    }
    const storagePlacement = getStoragePlacementForDate(getCalendarAnchorInTimeZone(new Date(row.createdAt)));
    return {
        ...row,
        physicalNumber: null,
        storageLocation: storagePlacement.storageLocation,
        boxNumber: storagePlacement.boxNumber,
        trayNumber: storagePlacement.trayNumber,
        slotNumber: storagePlacement.slotNumber,
    };
};
const currentPrincipalByPawnId = async (executor = db, pawnIds) => {
    const conditions = [
        or(inArray(cashTransactions.type, PRINCIPAL_IN_TRANSACTION_TYPES), inArray(cashTransactions.type, PRINCIPAL_OUT_TRANSACTION_TYPES)),
    ];
    if (pawnIds && pawnIds.length > 0) {
        conditions.push(inArray(cashTransactions.pawnFk, pawnIds));
    }
    const txs = await executor
        .select({
        pawnId: cashTransactions.pawnFk,
        principal: sql `
                coalesce(
                    sum(
                        case
                            when ${cashTransactions.type} in ('PAWN', 'PLUS_AMOUNT') then ${cashTransactions.amount}
                            when ${cashTransactions.type} in ('MINUS_AMOUNT', 'REDEEM_BA') then -${cashTransactions.amount}
                            else 0
                        end
                    ),
                    0
                )
            `,
    })
        .from(cashTransactions)
        .where(and(...conditions))
        .groupBy(cashTransactions.pawnFk);
    const map = new Map();
    for (const tx of txs) {
        if (!tx.pawnId)
            continue;
        map.set(tx.pawnId, Number(tx.principal || 0));
    }
    return map;
};
const redemptionTotalsByPawnId = async (executor = db, pawnIds) => {
    const conditions = [
        inArray(cashTransactions.type, REDEMPTION_TRANSACTION_TYPES),
    ];
    if (pawnIds && pawnIds.length > 0) {
        conditions.push(inArray(cashTransactions.pawnFk, pawnIds));
    }
    const rows = await executor
        .select({
        pawnId: cashTransactions.pawnFk,
        redeemedPrincipal: sql `
                coalesce(
                    sum(
                        case
                            when ${cashTransactions.type} = 'REDEEM_BA' then ${cashTransactions.amount}
                            else 0
                        end
                    ),
                    0
                )
            `,
        redeemedInterest: sql `
                coalesce(
                    sum(
                        case
                            when ${cashTransactions.type} = 'REDEEM_I' then ${cashTransactions.amount}
                            else 0
                        end
                    ),
                    0
                )
            `,
        redeemedAt: sql `
                max(
                    case
                        when ${cashTransactions.type} = 'REDEEM_BA' then ${cashTransactions.date}
                        else null
                    end
                )
            `,
    })
        .from(cashTransactions)
        .where(and(...conditions))
        .groupBy(cashTransactions.pawnFk);
    const map = new Map();
    for (const row of rows) {
        if (!row.pawnId)
            continue;
        map.set(row.pawnId, {
            redeemedAt: row.redeemedAt ? new Date(row.redeemedAt) : undefined,
            redeemedInterest: Number(row.redeemedInterest || 0),
            redeemedPrincipal: Number(row.redeemedPrincipal || 0),
        });
    }
    return map;
};
const interestPaymentPresenceByPawnId = async (executor = db, pawnIds) => {
    const conditions = [eq(cashTransactions.type, PAID_INTEREST_TRANSACTION_TYPE)];
    if (pawnIds && pawnIds.length > 0) {
        conditions.push(inArray(cashTransactions.pawnFk, pawnIds));
    }
    const rows = await executor
        .select({
        pawnId: cashTransactions.pawnFk,
        paymentCount: count(cashTransactions.id),
    })
        .from(cashTransactions)
        .where(and(...conditions))
        .groupBy(cashTransactions.pawnFk);
    const map = new Map();
    for (const row of rows) {
        if (!row.pawnId)
            continue;
        map.set(row.pawnId, Number(row.paymentCount || 0) > 0);
    }
    return map;
};
const getEffectivePawnStatus = (itemStatus, redeemedPrincipal) => {
    if (redeemedPrincipal > 0)
        return 'REDEEMED';
    if (itemStatus === 'EXPIRED')
        return 'EXPIRED';
    return 'PAWN';
};
const loadPawnStates = async (executor, pawnIds) => {
    if (pawnIds.length === 0)
        return new Map();
    const rows = await executor
        .select({
        pawnId: pawns.id,
        itemId: items.id,
        customerName: customers.name,
        itemStatus: items.status,
        loanAmount: cashTransactions.amount,
        interestRate: pawns.interestRate,
        maxAvailableAmount: pawns.maxAvailableAmount,
        lastPaymentDate: pawns.lastPaymentDate,
        createdAt: cashTransactions.date,
    })
        .from(pawns)
        .leftJoin(customers, eq(pawns.customerFk, customers.id))
        .leftJoin(items, eq(pawns.itemFk, items.id))
        .leftJoin(cashTransactions, and(eq(cashTransactions.pawnFk, pawns.id), eq(cashTransactions.type, 'PAWN')))
        .where(inArray(pawns.id, pawnIds));
    const principalMap = await currentPrincipalByPawnId(executor, pawnIds);
    const redemptionMap = await redemptionTotalsByPawnId(executor, pawnIds);
    const interestPaymentMap = await interestPaymentPresenceByPawnId(executor, pawnIds);
    const map = new Map();
    for (const row of rows) {
        const pawnId = Number(row.pawnId);
        const redeemedPrincipal = redemptionMap.get(pawnId)?.redeemedPrincipal ?? 0;
        map.set(pawnId, {
            pawnId,
            itemId: row.itemId ?? null,
            customerName: row.customerName || `Ticket #${pawnId}`,
            itemStatus: row.itemStatus ?? null,
            interestRate: Number(row.interestRate || 0),
            maxAvailableAmount: Number(row.maxAvailableAmount || row.loanAmount || 0),
            lastPaymentDate: row.lastPaymentDate ? new Date(row.lastPaymentDate) : null,
            createdAt: row.createdAt ? new Date(row.createdAt) : null,
            hasInterestPayments: interestPaymentMap.get(pawnId) ?? false,
            currentPrincipal: Number(principalMap.get(pawnId) ?? row.loanAmount ?? 0),
            effectiveStatus: getEffectivePawnStatus(row.itemStatus, redeemedPrincipal),
        });
    }
    return map;
};
const findDuplicatePawnIds = (pawnIds) => {
    const seen = new Set();
    for (const pawnId of pawnIds) {
        if (seen.has(pawnId))
            return pawnId;
        seen.add(pawnId);
    }
    return null;
};
const app = express();
const port = Number(process.env.API_PORT || 8787);
const DB_TIMEZONE_KEY = 'db_timezone';
const APP_SETTINGS_KEY = 'app_settings';
const SETUP_COMPLETED_KEY = 'setup_completed_at';
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'pawn-api' });
});
const resolveEmployeeFk = async (requestedEmployeeId) => {
    const numericEmployeeId = Number(requestedEmployeeId);
    if (!Number.isFinite(numericEmployeeId) || numericEmployeeId <= 0)
        return null;
    const employeeRows = await db
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.id, numericEmployeeId))
        .limit(1);
    return employeeRows[0]?.id ?? null;
};
app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body ?? {};
    if (!username || !password)
        return res.status(400).json({ success: false, message: 'username and password are required' });
    try {
        const result = await db.select().from(employees).where(eq(employees.userName, username)).limit(1);
        if (result.length === 0)
            return res.status(404).json({ success: false, message: 'User not found' });
        const user = result[0];
        if (user.password !== password)
            return res.status(401).json({ success: false, message: 'Invalid password' });
        return res.json({ success: true, user: { id: user.id, name: user.name, level: user.level } });
    }
    catch (error) {
        console.error('[API] login failed:', error);
        return res.status(500).json({ success: false, message: 'Login failed: database is not ready' });
    }
});
app.get('/setup/status', async (_req, res) => {
    try {
        await ensureDbReady();
        const userRows = await db.select({
            id: employees.id,
            level: employees.level,
            password: employees.password,
            userName: employees.userName,
        }).from(employees);
        const appSettingsRows = await db.select().from(settings).where(eq(settings.key, APP_SETTINGS_KEY)).limit(1);
        const dbTimeZoneRows = await db.select().from(settings).where(eq(settings.key, DB_TIMEZONE_KEY)).limit(1);
        const completionRows = await db.select().from(settings).where(eq(settings.key, SETUP_COMPLETED_KEY)).limit(1);
        return res.json({
            success: true,
            setup: {
                completed: Boolean(completionRows[0]?.value),
                defaultAdminCredentials: userRows.some((row) => row.level === 'Admin' &&
                    row.userName === 'admin' &&
                    row.password === 'password'),
                hasAppSettings: Boolean(appSettingsRows[0]?.value),
                hasDbTimeZone: Boolean(dbTimeZoneRows[0]?.value),
                hasUsers: userRows.length > 0,
            },
        });
    }
    catch (error) {
        console.error('[API] get-setup-status failed:', error);
        return res.status(500).json({ success: false, message: 'Database is not ready for setup yet' });
    }
});
app.post('/setup/bootstrap', async (req, res) => {
    const adminUser = req.body?.adminUser && typeof req.body.adminUser === 'object'
        ? req.body.adminUser
        : {};
    const adminName = typeof adminUser.name === 'string' ? adminUser.name.trim() : '';
    const adminUserName = typeof adminUser.userName === 'string' ? adminUser.userName.trim() : '';
    const adminPassword = typeof adminUser.password === 'string' ? adminUser.password.trim() : '';
    const dbTimeZone = typeof req.body?.dbTimeZone === 'string' ? req.body.dbTimeZone.trim() : '';
    const settingsPayload = req.body?.settings && typeof req.body.settings === 'object' && !Array.isArray(req.body.settings)
        ? req.body.settings
        : null;
    if (!adminName || !adminUserName || !adminPassword) {
        return res.status(400).json({ success: false, message: 'Admin name, username, and password are required' });
    }
    if (!dbTimeZone) {
        return res.status(400).json({ success: false, message: 'Database time zone is required' });
    }
    if (!settingsPayload) {
        return res.status(400).json({ success: false, message: 'Application settings are required' });
    }
    try {
        await ensureDbReady();
        await setDatabaseSessionTimeZone(dbTimeZone);
        const existingAdminRows = await db
            .select({ id: employees.id })
            .from(employees)
            .where(eq(employees.level, 'Admin'))
            .limit(1);
        const existingAdminId = existingAdminRows[0]?.id ?? null;
        const sameUsernameRows = await db
            .select({ id: employees.id })
            .from(employees)
            .where(eq(employees.userName, adminUserName))
            .limit(1);
        const conflictingUserId = sameUsernameRows[0]?.id ?? null;
        if (conflictingUserId && conflictingUserId !== existingAdminId) {
            return res.status(409).json({ success: false, message: 'That username is already in use' });
        }
        if (existingAdminId) {
            await db
                .update(employees)
                .set({
                level: 'Admin',
                name: adminName,
                password: adminPassword,
                userName: adminUserName,
            })
                .where(eq(employees.id, existingAdminId));
        }
        else {
            await db.insert(employees).values({
                level: 'Admin',
                name: adminName,
                password: adminPassword,
                userName: adminUserName,
            });
        }
        const serializedSettings = JSON.stringify(settingsPayload);
        await db
            .insert(settings)
            .values([
            { key: APP_SETTINGS_KEY, value: serializedSettings },
            { key: DB_TIMEZONE_KEY, value: dbTimeZone },
            { key: SETUP_COMPLETED_KEY, value: new Date().toISOString() },
        ])
            .onConflictDoUpdate({
            target: settings.key,
            set: { value: sql `excluded.value` },
        });
        return res.json({
            success: true,
            setup: {
                completed: true,
                dbTimeZone,
            },
        });
    }
    catch (error) {
        console.error('[API] bootstrap-setup failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to complete setup' });
    }
});
app.get('/users', async (_req, res) => {
    try {
        const result = await db.select({
            id: employees.id,
            name: employees.name,
            userName: employees.userName,
            level: employees.level,
        }).from(employees);
        return res.json({ success: true, users: result });
    }
    catch (error) {
        console.error('[API] get-users failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to load users: database is not ready' });
    }
});
app.post('/users', async (req, res) => {
    const { name, userName, password, level } = req.body ?? {};
    if (!name || !userName || !password || !level) {
        return res.status(400).json({ success: false, message: 'name, userName, password and level are required' });
    }
    try {
        const existing = await db.select({ id: employees.id }).from(employees).where(eq(employees.userName, userName)).limit(1);
        if (existing.length > 0)
            return res.status(409).json({ success: false, message: 'Username already exists' });
        await db.insert(employees).values({ name, userName, password, level });
        return res.status(201).json({ success: true, message: 'User created successfully' });
    }
    catch (error) {
        console.error('[API] create-user failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to create user' });
    }
});
app.put('/users/:id', async (req, res) => {
    const id = Number(req.params.id);
    const { name, userName, password, level } = req.body ?? {};
    if (!Number.isFinite(id) || id <= 0)
        return res.status(400).json({ success: false, message: 'Invalid user id' });
    if (!name || !userName || !level) {
        return res.status(400).json({ success: false, message: 'name, userName and level are required' });
    }
    try {
        const existing = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, id)).limit(1);
        if (existing.length === 0)
            return res.status(404).json({ success: false, message: 'User not found' });
        const sameUsername = await db.select({ id: employees.id }).from(employees).where(eq(employees.userName, userName)).limit(1);
        if (sameUsername.length > 0 && sameUsername[0].id !== id) {
            return res.status(409).json({ success: false, message: 'Username already exists' });
        }
        const updateData = { name, userName, level };
        if (password)
            updateData.password = password;
        await db.update(employees).set(updateData).where(eq(employees.id, id));
        return res.json({ success: true, message: 'User updated successfully' });
    }
    catch (error) {
        console.error('[API] update-user failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to update user' });
    }
});
app.delete('/users/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0)
        return res.status(400).json({ success: false, message: 'Invalid user id' });
    try {
        const existing = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, id)).limit(1);
        if (existing.length === 0)
            return res.status(404).json({ success: false, message: 'User not found' });
        await db.delete(employees).where(eq(employees.id, id));
        return res.json({ success: true, message: 'User deleted successfully' });
    }
    catch (error) {
        console.error('[API] delete-user failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete user' });
    }
});
app.get('/pawns', async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const rows = await db.select({
        id: pawns.id,
        customerId: customers.id,
        customerName: customers.name,
        physicalNumber: pawns.physicalNumber,
        note: pawns.note,
        itemType: items.type,
        itemDescription: items.description,
        itemPhoto: items.photo,
        weight: items.grossWeight,
        netWeight: items.netWeight,
        loanAmount: cashTransactions.amount,
        interestRate: pawns.interestRate,
        maxAvailableAmount: pawns.maxAvailableAmount,
        storageLocation: pawns.storageLocation,
        boxNumber: pawns.boxNumber,
        trayNumber: pawns.trayNumber,
        dayOfMonth: pawns.dayOfMonth,
        sequence: pawns.sequence,
        slotNumber: pawns.slotNumber,
        status: items.status,
        createdAt: cashTransactions.date,
        lastPaymentDate: pawns.lastPaymentDate,
    })
        .from(pawns)
        .leftJoin(customers, eq(pawns.customerFk, customers.id))
        .leftJoin(items, eq(pawns.itemFk, items.id))
        .leftJoin(cashTransactions, and(eq(cashTransactions.pawnFk, pawns.id), eq(cashTransactions.type, 'PAWN')));
    const principalMap = await currentPrincipalByPawnId();
    const redemptionMap = await redemptionTotalsByPawnId();
    const interestPaymentMap = await interestPaymentPresenceByPawnId();
    const normalizedRows = rows.map((row) => {
        const redemption = redemptionMap.get(row.id);
        return {
            ...resolveStoredLocation(row),
            status: getEffectivePawnStatus(row.status, redemption?.redeemedPrincipal ?? 0),
            loanAmount: Number(principalMap.get(row.id) ?? row.loanAmount ?? 0),
            hasInterestPayments: interestPaymentMap.get(row.id) ?? false,
            redeemedAt: redemption?.redeemedAt?.toISOString(),
            redeemedInterest: redemption?.redeemedInterest ?? 0,
            redeemedPrincipal: redemption?.redeemedPrincipal ?? 0,
        };
    });
    const filtered = status ? normalizedRows.filter((row) => row.status === status) : normalizedRows;
    return res.json({
        success: true,
        pawns: filtered,
    });
});
app.get('/pawns/:id', async (req, res) => {
    const id = Number(req.params.id);
    const includeInactive = String(req.query.includeInactive ?? '').toLowerCase() === 'true';
    if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid pawn id' });
    }
    try {
        const rows = await db
            .select({
            id: pawns.id,
            customerId: customers.id,
            customerName: customers.name,
            physicalNumber: pawns.physicalNumber,
            note: pawns.note,
            itemType: items.type,
            itemDescription: items.description,
            itemPhoto: items.photo,
            weight: items.grossWeight,
            netWeight: items.netWeight,
            loanAmount: cashTransactions.amount,
            interestRate: pawns.interestRate,
            maxAvailableAmount: pawns.maxAvailableAmount,
            storageLocation: pawns.storageLocation,
            boxNumber: pawns.boxNumber,
            trayNumber: pawns.trayNumber,
            dayOfMonth: pawns.dayOfMonth,
            sequence: pawns.sequence,
            slotNumber: pawns.slotNumber,
            status: items.status,
            createdAt: cashTransactions.date,
            lastPaymentDate: pawns.lastPaymentDate,
        })
            .from(pawns)
            .leftJoin(customers, eq(pawns.customerFk, customers.id))
            .leftJoin(items, eq(pawns.itemFk, items.id))
            .leftJoin(cashTransactions, and(eq(cashTransactions.pawnFk, pawns.id), eq(cashTransactions.type, 'PAWN')))
            .where(eq(pawns.id, id))
            .limit(1);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }
        const row = rows[0];
        const redemption = (await redemptionTotalsByPawnId(db, [id])).get(id);
        const redeemedAt = redemption?.redeemedAt;
        const redeemedInterest = redemption?.redeemedInterest ?? 0;
        const redeemedPrincipal = redemption?.redeemedPrincipal ?? 0;
        const effectiveStatus = getEffectivePawnStatus(row.status, redeemedPrincipal);
        if (!includeInactive && effectiveStatus !== 'PAWN') {
            return res.status(400).json({ success: false, message: 'Ticket is not active' });
        }
        const principalMap = await currentPrincipalByPawnId(db, [id]);
        const interestPaymentMap = await interestPaymentPresenceByPawnId(db, [id]);
        const timeZone = getDatabaseSessionTimeZone();
        const businessDate = getRequestBusinessDate(req);
        const currentPrincipal = Number(principalMap.get(row.id) ?? row.loanAmount ?? 0);
        const baseDate = row.lastPaymentDate ? new Date(row.lastPaymentDate) : row.createdAt ? new Date(row.createdAt) : businessDate;
        const daysDue = getDaysDueToToday(row.lastPaymentDate ? new Date(row.lastPaymentDate) : null, row.createdAt ? new Date(row.createdAt) : null, timeZone, businessDate);
        return res.json({
            success: true,
            pawn: {
                ...resolveStoredLocation(row),
                status: effectiveStatus,
                loanAmount: currentPrincipal,
                hasInterestPayments: interestPaymentMap.get(row.id) ?? false,
                daysDue,
                currentInterestDue: calculateInterestAmountForPeriod(currentPrincipal, Number(row.interestRate || 0), baseDate, businessDate),
                redeemedAt: redeemedAt?.toISOString(),
                redeemedInterest,
            },
        });
    }
    catch (error) {
        console.error('[API] get-pawn failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to load ticket' });
    }
});
app.patch('/pawns/:id/note', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid pawn id' });
    }
    const note = typeof req.body?.note === 'string'
        ? req.body.note.trim()
        : '';
    try {
        const updated = await db
            .update(pawns)
            .set({ note: note || null })
            .where(eq(pawns.id, id))
            .returning({ id: pawns.id, note: pawns.note });
        if (updated.length === 0) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }
        return res.json({ success: true, pawn: updated[0] });
    }
    catch (error) {
        console.error('[API] update-pawn-note failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to save remark' });
    }
});
app.post('/pawns', async (req, res) => {
    const { customer, item, loanAmount, maxAvailableAmount, interestRate, employeeId } = req.body ?? {};
    if (!customer?.name || !item?.type || !item?.description || !loanAmount) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    let customerPhoto = null;
    if (typeof customer.photo === 'string' && customer.photo.trim().length > 0) {
        const photo = customer.photo.trim();
        if (photo.startsWith('data:image/')) {
            customerPhoto = photo;
        }
        else {
            try {
                const parsed = new URL(photo);
                if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                    return res.status(400).json({ success: false, message: 'Customer photo must be an http(s) URL or a data URL' });
                }
                customerPhoto = parsed.toString();
            }
            catch {
                return res.status(400).json({ success: false, message: 'Customer photo must be a valid URL or webcam capture' });
            }
        }
    }
    let customerFaceDescriptor = null;
    if (typeof customer.faceDescriptor === 'string' && customer.faceDescriptor.trim().length > 0) {
        customerFaceDescriptor = customer.faceDescriptor.trim();
    }
    let itemPhoto = null;
    if (typeof item.photo === 'string' && item.photo.trim().length > 0) {
        const photo = item.photo.trim();
        if (photo.startsWith('data:image/')) {
            itemPhoto = photo;
        }
        else {
            try {
                const parsed = new URL(photo);
                if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                    return res.status(400).json({ success: false, message: 'Item photo must be an http(s) URL or a data URL' });
                }
                itemPhoto = parsed.toString();
            }
            catch {
                return res.status(400).json({ success: false, message: 'Item photo must be a valid URL or image upload' });
            }
        }
    }
    try {
        const businessDate = getRequestBusinessDate(req);
        const transactionDate = getRequestTransactionDate(req);
        const employeeFk = await resolveEmployeeFk(employeeId);
        const created = await db.transaction(async (tx) => {
            const currentDate = businessDate;
            const storageDate = getCalendarAnchorInTimeZone(currentDate);
            const useStorage = usesGoldJewelleryStorage(item.type);
            const physicalNumber = !useStorage && typeof item.physicalNumber === 'string'
                ? item.physicalNumber.trim() || null
                : null;
            const grossWeight = useStorage && Number.isFinite(Number(item.weight))
                ? Number(item.weight)
                : null;
            const nonGoldWeight = useStorage && Number.isFinite(Number(item.nonGoldWeight))
                ? Number(item.nonGoldWeight)
                : 0;
            const effectiveMaxAvailableAmount = useStorage ? maxAvailableAmount ?? loanAmount : loanAmount;
            const storageInfo = useStorage
                ? getStorageInfo(storageDate, await getExistingPawnCountForDate(storageDate, tx))
                : null;
            const requestedCustomerId = Number(customer.id);
            let customerId;
            if (Number.isFinite(requestedCustomerId) && requestedCustomerId > 0) {
                const existingCustomer = await tx
                    .select({ id: customers.id })
                    .from(customers)
                    .where(eq(customers.id, requestedCustomerId))
                    .limit(1);
                if (existingCustomer.length === 0) {
                    throw new Error('Customer not found');
                }
                customerId = existingCustomer[0].id;
                const updateFields = {};
                if (customerPhoto)
                    updateFields.photo = customerPhoto;
                if (customerFaceDescriptor)
                    updateFields.faceDescriptor = customerFaceDescriptor;
                if (Object.keys(updateFields).length > 0) {
                    await tx.update(customers).set(updateFields).where(eq(customers.id, customerId));
                }
            }
            else {
                const [newCustomer] = await tx.insert(customers).values({
                    name: customer.name,
                    phone: customer.phone ?? null,
                    address: customer.address ?? '',
                    description: customer.nrc ? `NRC: ${customer.nrc}` : null,
                    photo: customerPhoto,
                    faceDescriptor: customerFaceDescriptor,
                }).returning({ id: customers.id });
                customerId = newCustomer.id;
            }
            const [newItem] = await tx.insert(items).values({
                type: item.type,
                description: item.description,
                photo: itemPhoto,
                grossWeight,
                netWeight: grossWeight == null ? null : Math.max(0, grossWeight - nonGoldWeight),
                status: 'PAWN',
            }).returning({ id: items.id });
            const [newPawn] = await tx.insert(pawns).values({
                customerFk: customerId,
                itemFk: newItem.id,
                description: item.description,
                interestRate: interestRate ?? 0,
                maxAvailableAmount: effectiveMaxAvailableAmount,
                physicalNumber,
                storageLocation: storageInfo?.storageLocation ?? null,
                boxNumber: storageInfo?.boxNumber ?? null,
                trayNumber: storageInfo?.trayNumber ?? null,
                dayOfMonth: storageInfo?.dayOfMonth ?? null,
                sequence: storageInfo?.sequence ?? null,
                slotNumber: storageInfo?.slotNumber ?? null,
                lastPaymentDate: currentDate,
            }).returning({ id: pawns.id });
            await tx.insert(cashTransactions).values({
                type: 'PAWN',
                amount: loanAmount,
                pawnFk: newPawn.id,
                employeeFk,
                description: 'Pawn Loan Disbursement',
                date: transactionDate,
            });
            return { pawnId: newPawn.id, storageInfo };
        });
        return res.status(201).json({ success: true, pawnId: created.pawnId, storageInfo: created.storageInfo });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message === 'Customer not found') {
            return res.status(404).json({ success: false, message });
        }
        console.error('[API] create-pawn failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to create pawn' });
    }
});
app.post('/pawns/batch/pay-interest', async (req, res) => {
    const { tickets, employeeId } = req.body ?? {};
    if (!Array.isArray(tickets) || tickets.length === 0) {
        return res.status(400).json({ success: false, message: 'At least one ticket is required' });
    }
    const normalizedTickets = tickets.map((ticket) => ({
        pawnId: Number(ticket?.pawnId),
        daysToPay: Number(ticket?.daysToPay),
        amount: Number(ticket?.amount),
    }));
    const pawnIds = normalizedTickets.map((ticket) => ticket.pawnId);
    const duplicatePawnId = findDuplicatePawnIds(pawnIds);
    if (duplicatePawnId != null) {
        return res.status(400).json({ success: false, message: `Duplicate ticket #${duplicatePawnId} is not allowed` });
    }
    if (normalizedTickets.some((ticket) => !Number.isFinite(ticket.pawnId) || ticket.pawnId <= 0)) {
        return res.status(400).json({ success: false, message: 'Invalid pawn id' });
    }
    try {
        const employeeFk = await resolveEmployeeFk(employeeId);
        const timeZone = getDatabaseSessionTimeZone();
        const businessDate = getRequestBusinessDate(req);
        const transactionDate = getRequestTransactionDate(req, timeZone);
        const pawnStates = await loadPawnStates(db, pawnIds);
        const results = normalizedTickets.map((ticket) => {
            const pawn = pawnStates.get(ticket.pawnId);
            if (!pawn) {
                throw new Error(`Ticket #${ticket.pawnId} not found`);
            }
            if (pawn.effectiveStatus !== 'PAWN') {
                throw new Error(`Ticket #${ticket.pawnId} is not active`);
            }
            const daysDue = getDaysDueToToday(pawn.lastPaymentDate, pawn.createdAt, timeZone, businessDate);
            if (!Number.isFinite(ticket.daysToPay) || ticket.daysToPay <= 0 || ticket.daysToPay > daysDue) {
                throw new Error(`Ticket #${ticket.pawnId} has invalid days to pay`);
            }
            const baseDate = pawn.lastPaymentDate || pawn.createdAt || businessDate;
            const newLastPaymentDate = addCalendarDaysInTimeZone(baseDate, ticket.daysToPay, timeZone);
            const expectedAmount = calculateInterestAmountForPeriod(pawn.currentPrincipal, pawn.interestRate, baseDate, newLastPaymentDate);
            if (expectedAmount <= 0) {
                throw new Error(`Ticket #${ticket.pawnId} has no payable interest due`);
            }
            if (ticket.amount !== expectedAmount) {
                throw new Error(`Ticket #${ticket.pawnId} amount does not match current interest due`);
            }
            return {
                pawn,
                daysToPay: ticket.daysToPay,
                amount: expectedAmount,
                newLastPaymentDate,
            };
        });
        await db.transaction(async (tx) => {
            for (const result of results) {
                await tx
                    .update(pawns)
                    .set({ lastPaymentDate: result.newLastPaymentDate })
                    .where(eq(pawns.id, result.pawn.pawnId));
                await tx.insert(cashTransactions).values({
                    type: 'PAID_INTEREST',
                    amount: result.amount,
                    employeeFk,
                    description: `Interest payment for ${result.daysToPay} days`,
                    pawnFk: result.pawn.pawnId,
                    date: transactionDate,
                });
            }
        });
        const responseResults = results.map((result) => ({
            pawnId: result.pawn.pawnId,
            customerName: result.pawn.customerName,
            principal: result.pawn.currentPrincipal,
            interest: result.amount,
            discount: 0,
            total: result.amount,
            daysToPay: result.daysToPay,
            newLastPaymentDate: result.newLastPaymentDate.toISOString(),
        }));
        return res.json({
            success: true,
            mode: 'interest',
            results: responseResults,
            totals: {
                principal: 0,
                interest: responseResults.reduce((sum, row) => sum + row.interest, 0),
                discount: 0,
                total: responseResults.reduce((sum, row) => sum + row.total, 0),
            },
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to pay interest';
        console.error('[API] batch-pay-interest failed:', error);
        return res.status(400).json({ success: false, message });
    }
});
app.post('/pawns/:id/pay-interest', async (req, res) => {
    const pawnId = Number(req.params.id);
    const { daysToPay, amount, employeeId } = req.body ?? {};
    if (!Number.isFinite(pawnId) || pawnId <= 0)
        return res.status(400).json({ success: false, message: 'Invalid pawn id' });
    try {
        const employeeFk = await resolveEmployeeFk(employeeId);
        const businessDate = getRequestBusinessDate(req);
        const transactionDate = getRequestTransactionDate(req);
        const pawnRows = await db
            .select({
            id: pawns.id,
            status: items.status,
            interestRate: pawns.interestRate,
            loanAmount: cashTransactions.amount,
            lastPaymentDate: pawns.lastPaymentDate,
            createdAt: cashTransactions.date,
        })
            .from(pawns)
            .leftJoin(items, eq(pawns.itemFk, items.id))
            .leftJoin(cashTransactions, and(eq(cashTransactions.pawnFk, pawns.id), eq(cashTransactions.type, 'PAWN')))
            .where(eq(pawns.id, pawnId))
            .limit(1);
        const pawn = pawnRows[0];
        if (!pawn)
            return res.status(404).json({ success: false, message: 'Pawn not found' });
        if (pawn.status !== 'PAWN')
            return res.status(400).json({ success: false, message: 'Pawn is not active' });
        const timeZone = getDatabaseSessionTimeZone();
        const expectedDaysDue = getDaysDueToToday(pawn.lastPaymentDate, pawn.createdAt, timeZone, businessDate);
        const daysToPayNum = Number(daysToPay);
        const amountNum = Number(amount);
        if (!Number.isFinite(daysToPayNum) || daysToPayNum <= 0 || amountNum <= 0 || expectedDaysDue <= 0) {
            return res.status(400).json({ success: false, message: 'No additional interest due for this pawn' });
        }
        if (daysToPayNum > expectedDaysDue) {
            return res.status(400).json({
                success: false,
                message: `Cannot pay more than ${expectedDaysDue} day(s) of interest due.`,
                daysDue: expectedDaysDue,
            });
        }
        const baseSource = pawn.lastPaymentDate || pawn.createdAt || businessDate;
        const baseDate = new Date(baseSource);
        const newLastPaymentDate = addCalendarDaysInTimeZone(baseDate, daysToPayNum, timeZone);
        const currentPrincipal = Number((await currentPrincipalByPawnId(db, [pawnId])).get(pawnId) ?? pawn.loanAmount ?? 0);
        const expectedAmount = calculateInterestAmountForPeriod(currentPrincipal, Number(pawn.interestRate || 0), baseDate, newLastPaymentDate);
        if (amountNum !== expectedAmount) {
            return res.status(400).json({ success: false, message: 'Amount does not match current interest due' });
        }
        await db.update(pawns).set({ lastPaymentDate: newLastPaymentDate }).where(eq(pawns.id, pawnId));
        await db.insert(cashTransactions).values({
            type: 'PAID_INTEREST',
            amount: amountNum,
            employeeFk,
            description: `Interest payment for ${daysToPayNum} days`,
            pawnFk: pawnId,
            date: transactionDate,
        });
        return res.json({ success: true, newLastPaymentDate: newLastPaymentDate.toISOString() });
    }
    catch (error) {
        console.error('[API] pay-interest failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to pay interest' });
    }
});
app.post('/pawns/:id/adjust', async (req, res) => {
    const pawnId = Number(req.params.id);
    const { amount, adjustmentType, employeeId } = req.body ?? {};
    if (!Number.isFinite(pawnId) || pawnId <= 0)
        return res.status(400).json({ success: false, message: 'Invalid pawn id' });
    if (adjustmentType !== 'PLUS_AMOUNT' && adjustmentType !== 'MINUS_AMOUNT') {
        return res.status(400).json({ success: false, message: 'Invalid adjustment type' });
    }
    try {
        const employeeFk = await resolveEmployeeFk(employeeId);
        const businessDate = getRequestBusinessDate(req);
        const transactionDate = getRequestTransactionDate(req);
        const pawnRows = await db
            .select({
            id: pawns.id,
            status: items.status,
            loanAmount: cashTransactions.amount,
            maxAvailableAmount: pawns.maxAvailableAmount,
            interestRate: pawns.interestRate,
            lastPaymentDate: pawns.lastPaymentDate,
            createdAt: cashTransactions.date,
        })
            .from(pawns)
            .leftJoin(items, eq(pawns.itemFk, items.id))
            .leftJoin(cashTransactions, and(eq(cashTransactions.pawnFk, pawns.id), eq(cashTransactions.type, 'PAWN')))
            .where(eq(pawns.id, pawnId))
            .limit(1);
        const pawn = pawnRows[0];
        if (!pawn)
            return res.status(404).json({ success: false, message: 'Pawn not found' });
        if (pawn.status !== 'PAWN')
            return res.status(400).json({ success: false, message: 'Pawn is not active' });
        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid adjustment amount' });
        }
        const principalMap = await currentPrincipalByPawnId();
        const currentLoan = Number(principalMap.get(pawnId) ?? pawn.loanAmount ?? 0);
        const timeZone = getDatabaseSessionTimeZone();
        const daysDue = getDaysDueToToday(pawn.lastPaymentDate, pawn.createdAt, timeZone, businessDate);
        const interestDue = calculateInterestAmountForPeriod(currentLoan, Number(pawn.interestRate || 0), pawn.lastPaymentDate || pawn.createdAt || businessDate, businessDate);
        if (interestDue > 0) {
            return res.status(400).json({
                success: false,
                message: `Please pay full interest through the selected business date first (${interestDue.toLocaleString()} MMK).`,
                daysDue,
                interestDue,
            });
        }
        if (adjustmentType === 'MINUS_AMOUNT' && numericAmount > currentLoan) {
            return res.status(400).json({ success: false, message: 'Decrease amount cannot be greater than current principal' });
        }
        const maxAvailableAmount = Number(pawn.maxAvailableAmount || currentLoan);
        if (adjustmentType === 'PLUS_AMOUNT' && currentLoan + numericAmount > maxAvailableAmount) {
            return res.status(400).json({
                success: false,
                message: `Increase amount exceeds max available amount (${maxAvailableAmount.toLocaleString()} MMK).`,
            });
        }
        const newLoanAmount = adjustmentType === 'PLUS_AMOUNT' ? currentLoan + numericAmount : currentLoan - numericAmount;
        const zeroInterestPaidUntilDate = daysDue > 0
            ? addCalendarDaysInTimeZone(new Date(pawn.lastPaymentDate || pawn.createdAt || businessDate), daysDue, timeZone)
            : null;
        const adjustmentDescription = `${adjustmentType === 'PLUS_AMOUNT' ? 'Principal increase' : 'Principal decrease'}${zeroInterestPaidUntilDate ? `; closed ${daysDue} zero-interest day(s)` : ''}`;
        await db.transaction(async (tx) => {
            if (zeroInterestPaidUntilDate) {
                await tx.update(pawns).set({ lastPaymentDate: zeroInterestPaidUntilDate }).where(eq(pawns.id, pawnId));
            }
            await tx.insert(cashTransactions).values({
                type: adjustmentType,
                amount: numericAmount,
                employeeFk,
                description: adjustmentDescription,
                pawnFk: pawnId,
                date: transactionDate,
            });
        });
        return res.json({
            success: true,
            newLoanAmount,
            zeroInterestPaidUntilDate: zeroInterestPaidUntilDate?.toISOString(),
        });
    }
    catch (error) {
        console.error('[API] adjust-pawn-amount failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to adjust pawn amount' });
    }
});
app.post('/pawns/batch/redeem', async (req, res) => {
    const { tickets, employeeId } = req.body ?? {};
    if (!Array.isArray(tickets) || tickets.length === 0) {
        return res.status(400).json({ success: false, message: 'At least one ticket is required' });
    }
    const normalizedTickets = tickets.map((ticket) => ({
        pawnId: Number(ticket?.pawnId),
        totalAmount: Number(ticket?.totalAmount),
        discountAmount: Math.max(0, Number(ticket?.discountAmount) || 0),
    }));
    const pawnIds = normalizedTickets.map((ticket) => ticket.pawnId);
    const duplicatePawnId = findDuplicatePawnIds(pawnIds);
    if (duplicatePawnId != null) {
        return res.status(400).json({ success: false, message: `Duplicate ticket #${duplicatePawnId} is not allowed` });
    }
    if (normalizedTickets.some((ticket) => !Number.isFinite(ticket.pawnId) || ticket.pawnId <= 0)) {
        return res.status(400).json({ success: false, message: 'Invalid pawn id' });
    }
    try {
        const employeeFk = await resolveEmployeeFk(employeeId);
        const pawnStates = await loadPawnStates(db, pawnIds);
        const businessDate = getRequestBusinessDate(req);
        const now = getRequestTransactionDate(req);
        const results = normalizedTickets.map((ticket) => {
            const pawn = pawnStates.get(ticket.pawnId);
            if (!pawn) {
                throw new Error(`Ticket #${ticket.pawnId} not found`);
            }
            if (pawn.effectiveStatus !== 'PAWN') {
                throw new Error(`Ticket #${ticket.pawnId} is not active`);
            }
            if (!pawn.itemId) {
                throw new Error(`Ticket #${ticket.pawnId} item not found`);
            }
            const interestDue = calculateRedeemInterest(pawn.currentPrincipal, pawn.interestRate, pawn.lastPaymentDate, pawn.createdAt, businessDate, pawn.hasInterestPayments);
            if (ticket.discountAmount > interestDue) {
                throw new Error(`Ticket #${ticket.pawnId} discount cannot be greater than interest due`);
            }
            const expectedTotal = pawn.currentPrincipal + interestDue - ticket.discountAmount;
            if (!Number.isFinite(ticket.totalAmount) || ticket.totalAmount !== expectedTotal) {
                throw new Error(`Ticket #${ticket.pawnId} total does not match current redeem amount`);
            }
            return {
                pawn,
                interestDue,
                discountAmount: ticket.discountAmount,
                interestPaid: Math.max(0, interestDue - ticket.discountAmount),
                totalAmount: expectedTotal,
            };
        });
        await db.transaction(async (tx) => {
            for (const result of results) {
                await tx
                    .update(items)
                    .set({ status: 'REDEEMED' })
                    .where(eq(items.id, result.pawn.itemId));
                await tx.insert(cashTransactions).values({
                    type: 'REDEEM_BA',
                    amount: result.pawn.currentPrincipal,
                    discount: 0,
                    employeeFk,
                    description: 'Redemption Principal',
                    pawnFk: result.pawn.pawnId,
                    date: now,
                });
                if (result.interestPaid > 0 || result.discountAmount > 0) {
                    await tx.insert(cashTransactions).values({
                        type: 'REDEEM_I',
                        amount: result.interestPaid,
                        discount: result.discountAmount,
                        employeeFk,
                        description: 'Redemption Interest',
                        pawnFk: result.pawn.pawnId,
                        date: now,
                    });
                }
            }
        });
        const responseResults = results.map((result) => ({
            pawnId: result.pawn.pawnId,
            customerName: result.pawn.customerName,
            principal: result.pawn.currentPrincipal,
            interest: result.interestPaid,
            discount: result.discountAmount,
            total: result.totalAmount,
            redeemedAt: now.toISOString(),
        }));
        return res.json({
            success: true,
            mode: 'redeem',
            results: responseResults,
            totals: {
                principal: responseResults.reduce((sum, row) => sum + row.principal, 0),
                interest: responseResults.reduce((sum, row) => sum + row.interest, 0),
                discount: responseResults.reduce((sum, row) => sum + row.discount, 0),
                total: responseResults.reduce((sum, row) => sum + row.total, 0),
            },
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to redeem pawn';
        console.error('[API] batch-redeem failed:', error);
        return res.status(400).json({ success: false, message });
    }
});
app.post('/pawns/batch/expire', async (req, res) => {
    const requestPawnIds = Array.isArray(req.body?.pawnIds)
        ? req.body.pawnIds
        : [];
    const pawnIds = requestPawnIds.length > 0
        ? Array.from(new Set(requestPawnIds
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value) && value > 0)))
        : [];
    if (pawnIds.length === 0) {
        return res.status(400).json({ success: false, message: 'No pawn ids provided' });
    }
    try {
        const pawnRows = await db
            .select({ id: pawns.id, itemId: items.id, itemStatus: items.status })
            .from(pawns)
            .leftJoin(items, eq(pawns.itemFk, items.id))
            .where(inArray(pawns.id, pawnIds));
        const redemptionMap = await redemptionTotalsByPawnId(db, pawnIds);
        const pawnMap = new Map(pawnRows.map((row) => [row.id, row]));
        const missingIds = pawnIds.filter((pawnId) => !pawnMap.has(pawnId));
        if (missingIds.length > 0) {
            return res.status(404).json({
                success: false,
                message: `Ticket${missingIds.length > 1 ? 's' : ''} not found: ${missingIds.join(', ')}`,
            });
        }
        for (const pawnId of pawnIds) {
            const pawn = pawnMap.get(pawnId);
            if (!pawn.itemId) {
                return res.status(400).json({ success: false, message: `Ticket #${pawnId} item not found` });
            }
            const redeemedPrincipal = redemptionMap.get(pawnId)?.redeemedPrincipal ?? 0;
            const effectiveStatus = getEffectivePawnStatus(pawn.itemStatus, redeemedPrincipal);
            if (effectiveStatus !== 'PAWN') {
                return res.status(400).json({
                    success: false,
                    message: `Ticket #${pawnId} is already ${effectiveStatus.toLowerCase()}`,
                });
            }
        }
        await db.transaction(async (tx) => {
            await tx
                .update(items)
                .set({ status: 'EXPIRED' })
                .where(inArray(items.id, pawnRows.map((row) => row.itemId).filter((value) => Number.isFinite(value))));
        });
        return res.json({
            success: true,
            results: pawnIds.map((pawnId) => ({
                pawnId,
                status: 'EXPIRED',
            })),
            message: `${pawnIds.length} overdue item${pawnIds.length !== 1 ? 's' : ''} expired successfully`,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to expire overdue items';
        console.error('[API] batch-expire failed:', error);
        return res.status(500).json({ success: false, message });
    }
});
app.post('/pawns/:id/redeem', async (req, res) => {
    const pawnId = Number(req.params.id);
    const { totalAmount, discountAmount = 0, employeeId } = req.body ?? {};
    if (!Number.isFinite(pawnId) || pawnId <= 0)
        return res.status(400).json({ success: false, message: 'Invalid pawn id' });
    try {
        const employeeFk = await resolveEmployeeFk(employeeId);
        const businessDate = getRequestBusinessDate(req);
        const transactionDate = getRequestTransactionDate(req);
        const pawnRows = await db
            .select({
            id: pawns.id,
            itemId: items.id,
            status: items.status,
            loanAmount: cashTransactions.amount,
            interestRate: pawns.interestRate,
            lastPaymentDate: pawns.lastPaymentDate,
            createdAt: cashTransactions.date,
        })
            .from(pawns)
            .leftJoin(items, eq(pawns.itemFk, items.id))
            .leftJoin(cashTransactions, and(eq(cashTransactions.pawnFk, pawns.id), eq(cashTransactions.type, 'PAWN')))
            .where(eq(pawns.id, pawnId))
            .limit(1);
        const pawn = pawnRows[0];
        if (!pawn)
            return res.status(404).json({ success: false, message: 'Pawn not found' });
        const existingRedemption = await db
            .select({ id: cashTransactions.id })
            .from(cashTransactions)
            .where(and(eq(cashTransactions.pawnFk, pawnId), eq(cashTransactions.type, 'REDEEM_BA')))
            .limit(1);
        const effectiveStatus = getEffectivePawnStatus(pawn.status, existingRedemption.length > 0 ? 1 : 0);
        if (effectiveStatus !== 'PAWN')
            return res.status(400).json({ success: false, message: 'Pawn is not active' });
        if (!pawn.itemId)
            return res.status(400).json({ success: false, message: 'Item not found' });
        const principalMap = await currentPrincipalByPawnId();
        const loanAmount = Number(principalMap.get(pawnId) ?? pawn.loanAmount ?? 0);
        const hasInterestPayments = (await interestPaymentPresenceByPawnId(db, [pawnId])).get(pawnId) ?? false;
        const expectedInterestAmount = calculateRedeemInterest(loanAmount, Number(pawn.interestRate || 0), pawn.lastPaymentDate, pawn.createdAt, businessDate, hasInterestPayments);
        const numericTotal = Number(totalAmount);
        if (!Number.isFinite(numericTotal) || numericTotal < 0) {
            return res.status(400).json({ success: false, message: 'Invalid total amount' });
        }
        const appliedDiscount = Math.max(0, Number(discountAmount) || 0);
        if (appliedDiscount > expectedInterestAmount) {
            return res.status(400).json({
                success: false,
                message: `Discount cannot be greater than interest (${expectedInterestAmount.toLocaleString()} MMK).`,
            });
        }
        const expectedTotal = loanAmount + expectedInterestAmount - appliedDiscount;
        if (numericTotal !== expectedTotal) {
            return res.status(400).json({
                success: false,
                message: 'Total amount does not match current redeem amount',
            });
        }
        const rawInterestAmount = expectedInterestAmount;
        await db.transaction(async (tx) => {
            await tx.update(items).set({ status: 'REDEEMED' }).where(eq(items.id, pawn.itemId));
            await tx.insert(cashTransactions).values({
                type: 'REDEEM_BA',
                amount: loanAmount,
                discount: 0,
                employeeFk,
                description: 'Redemption Principal',
                pawnFk: pawnId,
                date: transactionDate,
            });
            const interestPaid = Math.max(0, rawInterestAmount - appliedDiscount);
            if (interestPaid > 0 || appliedDiscount > 0) {
                await tx.insert(cashTransactions).values({
                    type: 'REDEEM_I',
                    amount: interestPaid,
                    discount: appliedDiscount,
                    employeeFk,
                    description: 'Redemption Interest',
                    pawnFk: pawnId,
                    date: transactionDate,
                });
            }
        });
        return res.json({ success: true, message: 'Pawn redeemed successfully' });
    }
    catch (error) {
        console.error('[API] redeem-pawn failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to redeem pawn' });
    }
});
app.get('/pawns/:id/transactions', async (req, res) => {
    const pawnId = Number(req.params.id);
    if (!Number.isFinite(pawnId) || pawnId <= 0)
        return res.status(400).json({ success: false, message: 'Invalid pawn id' });
    try {
        const rows = await db
            .select({
            id: cashTransactions.id,
            date: cashTransactions.date,
            type: cashTransactions.type,
            amount: cashTransactions.amount,
            description: cashTransactions.description,
            userName: employees.name,
        })
            .from(cashTransactions)
            .leftJoin(employees, eq(cashTransactions.employeeFk, employees.id))
            .where(eq(cashTransactions.pawnFk, pawnId))
            .orderBy(desc(cashTransactions.date));
        return res.json({
            success: true,
            transactions: rows.map((tx) => ({
                id: tx.id,
                date: tx.date,
                type: tx.type,
                amount: tx.amount,
                description: tx.description,
                user: tx.userName ?? null,
            })),
        });
    }
    catch (error) {
        console.error('[API] get-pawn-transactions failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to load transactions' });
    }
});
app.get('/reports/recent-transactions', async (req, res) => {
    try {
        const rawLimit = Number(req.query.limit);
        const limit = Number.isFinite(rawLimit)
            ? Math.min(Math.max(Math.floor(rawLimit), 1), 20)
            : 6;
        const rows = await db
            .select({
            id: cashTransactions.id,
            pawnId: cashTransactions.pawnFk,
            date: cashTransactions.date,
            type: cashTransactions.type,
            amount: cashTransactions.amount,
            customerName: customers.name,
        })
            .from(cashTransactions)
            .leftJoin(pawns, eq(cashTransactions.pawnFk, pawns.id))
            .leftJoin(customers, eq(pawns.customerFk, customers.id))
            .orderBy(desc(cashTransactions.date), desc(cashTransactions.id))
            .limit(limit);
        return res.json({
            success: true,
            transactions: rows.map((tx) => ({
                id: tx.id,
                pawnId: tx.pawnId,
                date: tx.date,
                type: tx.type,
                amount: tx.amount,
                customerName: tx.customerName || 'Unknown',
            })),
        });
    }
    catch (error) {
        console.error('[API] get-recent-transactions failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to load recent transactions' });
    }
});
app.post('/api/faces/detect-and-search', async (req, res) => {
    const { image } = req.body ?? {};
    if (!image) {
        return res.status(400).json({ success: false, message: 'Missing image in body' });
    }
    try {
        // Lazy-load face detection utilities – they require native deps (canvas, tfjs-node)
        // that may not be available in all environments (e.g. local macOS dev).
        const { detectFaceDescriptorFromBase64, compareDescriptors, descriptorToJson, jsonToDescriptor } = await import('./utils/faceServer.js');
        const descriptorArray = await detectFaceDescriptorFromBase64(image);
        if (!descriptorArray) {
            return res.status(404).json({ success: false, message: 'No face detected in image' });
        }
        const descriptorStr = descriptorToJson(descriptorArray);
        // Fetch all customers that have face descriptors
        const dbCustomers = await db.select({
            id: customers.id,
            name: customers.name,
            faceDescriptor: customers.faceDescriptor,
        }).from(customers);
        const matches = [];
        for (const c of dbCustomers) {
            if (!c.faceDescriptor)
                continue;
            try {
                const storedDesc = jsonToDescriptor(c.faceDescriptor);
                const distance = compareDescriptors(descriptorArray, storedDesc);
                if (distance < 0.6) {
                    matches.push({ customerId: c.id, distance, name: c.name });
                }
            }
            catch (err) {
                // Ignore missing/corrupt descriptors
            }
        }
        matches.sort((a, b) => a.distance - b.distance);
        return res.json({
            success: true,
            descriptor: descriptorStr,
            matches
        });
    }
    catch (error) {
        console.error('[API] detect-and-search failed:', error);
        return res.status(500).json({ success: false, message: error.message || 'Server error during detection' });
    }
});
app.get('/customers', async (_req, res) => {
    try {
        const rows = await db.select({
            id: customers.id,
            name: customers.name,
            phone: customers.phone,
            address: customers.address,
            nrcDescription: customers.description,
            remark: customers.remark,
            photo: customers.photo,
            faceDescriptor: customers.faceDescriptor,
        }).from(customers);
        return res.json({
            success: true,
            customers: rows.map((row) => ({
                id: row.id,
                name: row.name,
                phone: row.phone || undefined,
                address: row.address || undefined,
                nrc: row.nrcDescription?.startsWith('NRC: ') ? row.nrcDescription.slice(5) : undefined,
                remark: row.remark || undefined,
                photo: row.photo || undefined,
                faceDescriptor: row.faceDescriptor || undefined,
            })),
        });
    }
    catch (error) {
        console.error('[API] list-customers failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to list customers' });
    }
});
app.put('/customers/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0)
        return res.status(400).json({ success: false, message: 'Invalid customer id' });
    const { name, phone, nrc, address, remark, photo, faceDescriptor } = req.body ?? {};
    if (!name || name.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'Customer name is required' });
    }
    try {
        const existing = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, id)).limit(1);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }
        // Fetch current values to compare name/address changes
        const currentCustomer = await db
            .select({ name: customers.name, address: customers.address })
            .from(customers)
            .where(eq(customers.id, id))
            .limit(1);
        const current = currentCustomer[0];
        const nameChanging = current && name.trim() !== (current.name ?? '').trim();
        const addressChanging = current && (address ?? '').trim() !== (current.address ?? '').trim();
        if (nameChanging || addressChanging) {
            // Only restrict name/address changes while customer has effectively active pawns
            const activePawns = await db
                .select({ id: pawns.id })
                .from(pawns)
                .leftJoin(items, eq(pawns.itemFk, items.id))
                .where(and(eq(pawns.customerFk, id), sql `${items.status} != 'EXPIRED'`, sql `NOT EXISTS (
                        SELECT 1 FROM cash_transactions rt
                        WHERE rt.pawn_fk = ${pawns.id}
                        AND rt.type = 'REDEEM_BA'
                    )`))
                .limit(1);
            if (activePawns.length > 0) {
                return res.status(403).json({ success: false, message: 'Cannot change name or address while customer has active pawns.' });
            }
        }
        let customerPhoto = (photo !== undefined) ? photo : null;
        if (typeof photo === 'string' && photo.trim().length > 0) {
            const p = photo.trim();
            if (p.startsWith('data:image/')) {
                customerPhoto = p;
            }
            else {
                try {
                    const parsed = new URL(p);
                    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                        customerPhoto = parsed.toString();
                    }
                    else {
                        customerPhoto = null;
                    }
                }
                catch {
                    customerPhoto = null;
                }
            }
        }
        const updateFields = {
            name: name.trim(),
            phone: phone ? phone.trim() : null,
            address: address ? address.trim() : '',
            description: nrc ? `NRC: ${nrc.trim()}` : null,
            remark: typeof remark === 'string' && remark.trim().length > 0 ? remark.trim() : null,
        };
        if (customerPhoto !== undefined) {
            updateFields.photo = customerPhoto;
        }
        if (typeof faceDescriptor === 'string' && faceDescriptor.trim().length > 0) {
            updateFields.faceDescriptor = faceDescriptor.trim();
        }
        await db.update(customers).set(updateFields).where(eq(customers.id, id));
        return res.json({ success: true, message: 'Customer updated successfully' });
    }
    catch (error) {
        console.error('[API] update-customer failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to update customer' });
    }
});
app.get('/customers/:id/pawns', async (req, res) => {
    const customerId = Number(req.params.id);
    if (!Number.isFinite(customerId) || customerId <= 0)
        return res.status(400).json({ success: false, message: 'Invalid customer id' });
    try {
        const rows = await db.select({
            id: pawns.id,
            customerId: customers.id,
            customerName: customers.name,
            physicalNumber: pawns.physicalNumber,
            itemType: items.type,
            itemDescription: items.description,
            itemPhoto: items.photo,
            weight: items.grossWeight,
            netWeight: items.netWeight,
            loanAmount: cashTransactions.amount,
            interestRate: pawns.interestRate,
            maxAvailableAmount: pawns.maxAvailableAmount,
            storageLocation: pawns.storageLocation,
            boxNumber: pawns.boxNumber,
            trayNumber: pawns.trayNumber,
            dayOfMonth: pawns.dayOfMonth,
            sequence: pawns.sequence,
            slotNumber: pawns.slotNumber,
            status: items.status,
            createdAt: cashTransactions.date,
            lastPaymentDate: pawns.lastPaymentDate,
        })
            .from(pawns)
            .leftJoin(customers, eq(pawns.customerFk, customers.id))
            .leftJoin(items, eq(pawns.itemFk, items.id))
            .leftJoin(cashTransactions, and(eq(cashTransactions.pawnFk, pawns.id), eq(cashTransactions.type, 'PAWN')))
            .where(eq(customers.id, customerId))
            .orderBy(desc(cashTransactions.date));
        const principalMap = await currentPrincipalByPawnId();
        const redemptionMap = await redemptionTotalsByPawnId();
        return res.json({
            success: true,
            pawns: rows.map((row) => {
                const redemption = redemptionMap.get(row.id);
                const resolved = resolveStoredLocation(row);
                return {
                    ...resolved,
                    item: {
                        type: row.itemType || 'Unknown',
                        description: row.itemDescription || '',
                        photo: row.itemPhoto || undefined,
                        weight: Number(row.weight || 0),
                        netWeight: row.netWeight == null ? undefined : Number(row.netWeight),
                    },
                    weight: Number(row.weight || 0),
                    netWeight: row.netWeight == null ? undefined : Number(row.netWeight),
                    loanAmount: Number(principalMap.get(row.id) ?? row.loanAmount ?? 0),
                    interestRate: Number(row.interestRate || 0),
                    maxAvailableAmount: row.maxAvailableAmount == null ? undefined : Number(row.maxAvailableAmount),
                    status: getEffectivePawnStatus(row.status, redemption?.redeemedPrincipal ?? 0),
                    createdAt: (row.createdAt ? new Date(row.createdAt) : new Date()).toISOString(),
                    lastPaymentDate: row.lastPaymentDate ? new Date(row.lastPaymentDate).toISOString() : undefined,
                    redeemedAt: redemption?.redeemedAt?.toISOString(),
                    redeemedInterest: redemption?.redeemedInterest ?? 0,
                    redeemedPrincipal: redemption?.redeemedPrincipal ?? 0,
                };
            }),
        });
    }
    catch (error) {
        console.error('[API] get-customer-pawns failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to load customer pawns' });
    }
});
app.get('/reports/daily-transactions', async (req, res) => {
    try {
        const q = req.query;
        const pick = (k) => {
            const v = q[k];
            if (typeof v === 'string')
                return v;
            if (Array.isArray(v) && typeof v[0] === 'string')
                return v[0];
            return undefined;
        };
        let start;
        let end;
        const startIso = pick('start');
        const endIso = pick('end');
        if (startIso && endIso) {
            start = new Date(startIso);
            end = new Date(endIso);
        }
        else {
            const dateParam = pick('date') ?? getRequestBusinessDate(req).toISOString();
            const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateParam).trim());
            if (ymd) {
                const y = Number(ymd[1]);
                const mo = Number(ymd[2]);
                const day = Number(ymd[3]);
                ({ start, end } = getDayRangeInTimeZone(new Date(Date.UTC(y, mo - 1, day, 12, 0, 0, 0))));
            }
            else {
                const anchor = new Date(dateParam);
                ({ start, end } = getDayRangeInTimeZone(anchor));
            }
        }
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid date range' });
        }
        const result = await db.select({
            id: cashTransactions.id,
            pawnId: cashTransactions.pawnFk,
            date: cashTransactions.date,
            type: cashTransactions.type,
            amount: cashTransactions.amount,
            customerName: customers.name,
            itemType: items.type,
            itemDescription: items.description,
            physicalNumber: pawns.physicalNumber,
            grossWeight: items.grossWeight,
            userName: employees.name,
        })
            .from(cashTransactions)
            .leftJoin(pawns, eq(cashTransactions.pawnFk, pawns.id))
            .leftJoin(customers, eq(pawns.customerFk, customers.id))
            .leftJoin(items, eq(pawns.itemFk, items.id))
            .leftJoin(employees, eq(cashTransactions.employeeFk, employees.id))
            .where(and(gte(cashTransactions.date, start), lte(cashTransactions.date, end)));
        let pawnOut = 0;
        let redeemIn = 0;
        let interest = 0;
        for (const tx of result) {
            if (tx.type === 'PAWN')
                pawnOut += tx.amount;
            else if (tx.type === 'REDEEM_BA' || tx.type === 'MINUS_AMOUNT')
                redeemIn += tx.amount;
            else if (tx.type === 'REDEEM_I' ||
                tx.type === 'PAID_INTEREST' ||
                tx.type === 'DATE_INTEREST') {
                interest += tx.amount;
            }
        }
        const timeZone = getDatabaseSessionTimeZone();
        return res.json({
            success: true,
            transactions: result.map((tx) => ({
                pawnId: tx.pawnId ?? null,
                time: tx.date ? new Date(tx.date).toLocaleTimeString('en-US', {
                    timeZone,
                    hour: '2-digit',
                    minute: '2-digit',
                }) : '',
                type: tx.type,
                customer: tx.customerName || 'Unknown',
                itemType: tx.itemType || '',
                itemDescription: tx.itemDescription || '',
                physicalNumber: tx.physicalNumber ?? null,
                grossWeight: tx.grossWeight ?? null,
                amount: tx.amount,
                user: tx.userName ?? null,
            })),
            stats: { pawnOut, redeemIn, interest },
        });
    }
    catch (error) {
        console.error('[API] get-daily-transactions failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to load daily transactions' });
    }
});
app.get('/reports/inventory', async (_req, res) => {
    try {
        const result = await db.select({
            id: pawns.id,
            physicalNumber: pawns.physicalNumber,
            itemType: items.type,
            description: items.description,
            photo: items.photo,
            grossWeight: items.grossWeight,
            netWeight: items.netWeight,
            loanAmount: cashTransactions.amount,
            storageLocation: pawns.storageLocation,
            boxNumber: pawns.boxNumber,
            trayNumber: pawns.trayNumber,
            dayOfMonth: pawns.dayOfMonth,
            sequence: pawns.sequence,
            slotNumber: pawns.slotNumber,
            status: items.status,
            createdAt: cashTransactions.date,
        })
            .from(pawns)
            .leftJoin(items, eq(pawns.itemFk, items.id))
            .leftJoin(cashTransactions, and(eq(cashTransactions.pawnFk, pawns.id), eq(cashTransactions.type, 'PAWN')))
            .where(eq(items.status, 'PAWN'));
        return res.json({
            success: true,
            inventory: result.map((row) => resolveStoredLocation(row)),
        });
    }
    catch (error) {
        console.error('[API] get-inventory failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to load inventory' });
    }
});
app.get('/reports/financial-summary', async (_req, res) => {
    try {
        const activeLoansResult = await db.select({ total: sum(cashTransactions.amount) })
            .from(cashTransactions)
            .leftJoin(pawns, eq(cashTransactions.pawnFk, pawns.id))
            .leftJoin(items, eq(pawns.itemFk, items.id))
            .where(and(eq(cashTransactions.type, 'PAWN'), eq(items.status, 'PAWN')));
        const redeemedPrincipalResult = await db.select({ total: sum(cashTransactions.amount) })
            .from(cashTransactions)
            .where(eq(cashTransactions.type, 'REDEEM_BA'));
        const interestResult = await db.select({ total: sum(cashTransactions.amount) })
            .from(cashTransactions)
            .where(sql `${cashTransactions.type} IN ('PAID_INTEREST', 'REDEEM_I')`);
        return res.json({
            success: true,
            summary: {
                activeLoans: Number(activeLoansResult[0]?.total || 0),
                redeemedPrincipal: Number(redeemedPrincipalResult[0]?.total || 0),
                totalInterest: Number(interestResult[0]?.total || 0),
            },
        });
    }
    catch (error) {
        console.error('[API] get-financial-summary failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to load financial summary' });
    }
});
app.get('/reports/overdue-items', async (req, res) => {
    try {
        const rawThreshold = Number(req.query.thresholdDays);
        const thresholdDays = Math.max(0, Number.isFinite(rawThreshold) ? Math.floor(rawThreshold) : 30);
        const thresholdDate = getRequestBusinessDate(req);
        thresholdDate.setDate(thresholdDate.getDate() - thresholdDays);
        const result = await db.select({
            id: pawns.id,
            customerName: customers.name,
            phone: customers.phone,
            itemDescription: items.description,
            itemType: items.type,
            loanAmount: cashTransactions.amount,
            lastPaymentDate: pawns.lastPaymentDate,
            physicalNumber: pawns.physicalNumber,
        })
            .from(pawns)
            .leftJoin(customers, eq(pawns.customerFk, customers.id))
            .leftJoin(items, eq(pawns.itemFk, items.id))
            .leftJoin(cashTransactions, and(eq(cashTransactions.pawnFk, pawns.id), eq(cashTransactions.type, 'PAWN')))
            .where(and(
        // Exclude expired items
        sql `${items.status} != 'EXPIRED'`, 
        // Exclude truly redeemed pawns (those with a REDEEM_BA transaction)
        sql `NOT EXISTS (
                    SELECT 1 FROM cash_transactions rt
                    WHERE rt.pawn_fk = ${pawns.id}
                    AND rt.type = 'REDEEM_BA'
                )`, lte(pawns.lastPaymentDate, thresholdDate)));
        return res.json({
            success: true,
            overdueItems: result.map((row) => ({
                ...row,
                physicalNumber: usesGoldJewelleryStorage(row.itemType) ? null : row.physicalNumber,
            })),
        });
    }
    catch (error) {
        console.error('[API] get-overdue-items failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to load overdue items' });
    }
});
app.get('/reports/top-customers', async (_req, res) => {
    try {
        const result = await db.select({
            customerId: customers.id,
            name: customers.name,
            phone: customers.phone,
            pawnCount: sql `count(distinct ${pawns.id})`,
            totalLoanAmount: sql `
                coalesce(
                    sum(
                        case
                            when ${cashTransactions.type} = 'PAWN' then ${cashTransactions.amount}
                            else 0
                        end
                    ),
                    0
                )
            `,
            totalInterestAmount: sql `
                coalesce(
                    sum(
                        case
                            when ${cashTransactions.type} in ('PAID_INTEREST', 'DATE_INTEREST', 'REDEEM_I')
                                then ${cashTransactions.amount}
                            else 0
                        end
                    ),
                    0
                )
            `,
        })
            .from(customers)
            .leftJoin(pawns, eq(customers.id, pawns.customerFk))
            .leftJoin(cashTransactions, eq(cashTransactions.pawnFk, pawns.id))
            .groupBy(customers.id)
            .orderBy(desc(sql `
                        coalesce(
                            sum(
                                case
                                    when ${cashTransactions.type} = 'PAWN' then ${cashTransactions.amount}
                                    else 0
                                end
                            ),
                            0
                        )
                    `));
        return res.json({ success: true, topCustomers: result });
    }
    catch (error) {
        console.error('[API] get-top-customers failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to load top customers' });
    }
});
app.get('/storage/info', async (req, res) => {
    try {
        if (typeof req.query.itemType === 'string' && !usesGoldJewelleryStorage(req.query.itemType)) {
            return res.json({ success: true, storageInfo: null });
        }
        const requestedDate = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date.trim())
            ? req.query.date.trim()
            : null;
        const currentDate = requestedDate
            ? (() => {
                const [year, month, day] = requestedDate.split('-').map(Number);
                return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
            })()
            : getCalendarAnchorInTimeZone(getRequestBusinessDate(req));
        const existingCount = await getExistingPawnCountForDate(currentDate);
        return res.json({ success: true, storageInfo: getStorageInfo(currentDate, existingCount) });
    }
    catch (error) {
        console.error('[API] get-storage-info failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to load storage info' });
    }
});
app.get('/settings/db-timezone', async (_req, res) => {
    try {
        const configuredRow = await db.select().from(settings).where(eq(settings.key, DB_TIMEZONE_KEY)).limit(1);
        const currentSettingRows = await db.execute(sql `select current_setting('TIMEZONE') as timezone`);
        const currentTimeZone = Array.isArray(currentSettingRows)
            ? String(currentSettingRows[0]?.timezone || getDatabaseSessionTimeZone())
            : getDatabaseSessionTimeZone();
        return res.json({
            success: true,
            dbTimeZone: {
                configured: configuredRow[0]?.value || currentTimeZone,
                active: currentTimeZone,
            },
        });
    }
    catch (error) {
        console.error('[API] get-db-timezone failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to load database time zone' });
    }
});
app.put('/settings/db-timezone', async (req, res) => {
    const timezone = typeof req.body?.timezone === 'string' ? req.body.timezone.trim() : '';
    if (!timezone || timezone.length > 120) {
        return res.status(400).json({ success: false, message: 'A valid time zone is required' });
    }
    try {
        await setDatabaseSessionTimeZone(timezone);
        await db.execute(sql `
            insert into settings (key, value)
            values (${DB_TIMEZONE_KEY}, ${timezone})
            on conflict (key) do update set value = excluded.value
        `);
        return res.json({
            success: true,
            dbTimeZone: {
                configured: timezone,
                active: timezone,
            },
        });
    }
    catch (error) {
        console.error('[API] update-db-timezone failed:', error);
        return res.status(400).json({ success: false, message: 'Invalid or unsupported database time zone' });
    }
});
app.get('/settings/app', async (_req, res) => {
    try {
        const rows = await db.select().from(settings).where(eq(settings.key, APP_SETTINGS_KEY)).limit(1);
        let appSettings = null;
        if (rows[0]?.value) {
            try {
                appSettings = JSON.parse(rows[0].value);
            }
            catch (error) {
                console.error('[API] failed to parse app settings:', error);
            }
        }
        const dbTimeZoneRows = await db.select().from(settings).where(eq(settings.key, DB_TIMEZONE_KEY)).limit(1);
        const currentTimeZoneRows = await db.execute(sql `select current_setting('TIMEZONE') as timezone`);
        const activeTimeZone = Array.isArray(currentTimeZoneRows)
            ? String(currentTimeZoneRows[0]?.timezone || getDatabaseSessionTimeZone())
            : getDatabaseSessionTimeZone();
        return res.json({
            success: true,
            settings: {
                ...(appSettings && typeof appSettings === 'object' ? appSettings : {}),
                dbTimeZone: dbTimeZoneRows[0]?.value || activeTimeZone,
            },
        });
    }
    catch (error) {
        console.error('[API] get-app-settings failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to load settings' });
    }
});
app.put('/settings/app', async (req, res) => {
    const settingsPayload = req.body && typeof req.body.settings === 'object' && !Array.isArray(req.body.settings)
        ? req.body.settings
        : null;
    if (!settingsPayload) {
        return res.status(400).json({ success: false, message: 'A valid settings payload is required' });
    }
    try {
        const serialized = JSON.stringify(settingsPayload);
        await db.execute(sql `
            insert into settings (key, value)
            values (${APP_SETTINGS_KEY}, ${serialized})
            on conflict (key) do update set value = excluded.value
        `);
        return res.json({
            success: true,
            settings: settingsPayload,
        });
    }
    catch (error) {
        console.error('[API] update-app-settings failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to save settings' });
    }
});
const loadConfiguredDbTimeZone = async () => {
    const rows = await db.select().from(settings).where(eq(settings.key, DB_TIMEZONE_KEY)).limit(1);
    return rows[0]?.value?.trim() || null;
};
const formatStartupError = (error) => {
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error.cause : null;
    const causeText = cause instanceof Error ? cause.message : String(cause || '');
    const combined = `${message}\n${causeText}`;
    if (/ECONNREFUSED|Unable to connect to Postgres/i.test(combined)) {
        return 'Database connection failed. Check that PostgreSQL is running and that the database URL is correct.';
    }
    if (/DATABASE_URL is required/i.test(combined)) {
        return 'Database setup is incomplete. Enter a valid PostgreSQL database URL and try again.';
    }
    return `Startup failed: ${message}`;
};
const ensureDbReady = async () => {
    await db.execute(sql `
        CREATE TABLE IF NOT EXISTS employees (
            id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
            name text NOT NULL,
            user_name text NOT NULL UNIQUE,
            password text NOT NULL,
            level text NOT NULL
        )
    `);
    await db.execute(sql `
        CREATE TABLE IF NOT EXISTS customers (
            id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
            name text NOT NULL,
            address text NOT NULL,
            phone text,
            description text,
            photo text
        )
    `);
    await db.execute(sql `ALTER TABLE customers ADD COLUMN IF NOT EXISTS photo text`);
    await db.execute(sql `ALTER TABLE customers ADD COLUMN IF NOT EXISTS remark text`);
    await db.execute(sql `ALTER TABLE customers ADD COLUMN IF NOT EXISTS face_descriptor text`);
    await db.execute(sql `
        CREATE TABLE IF NOT EXISTS items (
            id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
            status text NOT NULL,
            description text,
            type text NOT NULL,
            photo text,
            gross_weight real,
            net_weight real,
            jewellery_type text,
            daily_serial integer,
            store_index text,
            number integer,
            item_other_type text
        )
    `);
    await db.execute(sql `ALTER TABLE items ADD COLUMN IF NOT EXISTS photo text`);
    await db.execute(sql `
        CREATE TABLE IF NOT EXISTS pawns (
            id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
            interest_rate real,
            max_available_amount integer,
            description text,
            note text,
            customer_fk integer NOT NULL REFERENCES customers(id),
            item_fk integer REFERENCES items(id),
            physical_number text,
            storage_location text,
            box_number integer,
            tray_number integer,
            day_of_month integer,
            sequence integer,
            slot_number integer,
            last_payment_date timestamp
        )
    `);
    await db.execute(sql `ALTER TABLE pawns ADD COLUMN IF NOT EXISTS physical_number text`);
    await db.execute(sql `ALTER TABLE pawns ADD COLUMN IF NOT EXISTS note text`);
    await db.execute(sql `ALTER TABLE pawns ADD COLUMN IF NOT EXISTS storage_location text`);
    await db.execute(sql `ALTER TABLE pawns ADD COLUMN IF NOT EXISTS box_number integer`);
    await db.execute(sql `ALTER TABLE pawns ADD COLUMN IF NOT EXISTS tray_number integer`);
    await db.execute(sql `ALTER TABLE pawns ADD COLUMN IF NOT EXISTS day_of_month integer`);
    await db.execute(sql `ALTER TABLE pawns ADD COLUMN IF NOT EXISTS sequence integer`);
    await db.execute(sql `ALTER TABLE pawns ADD COLUMN IF NOT EXISTS slot_number integer`);
    await db.execute(sql `ALTER TABLE pawns ADD COLUMN IF NOT EXISTS last_payment_date timestamp`);
    await db.execute(sql `
        CREATE TABLE IF NOT EXISTS cash_transactions (
            id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
            date timestamp DEFAULT now(),
            type text NOT NULL,
            amount integer NOT NULL,
            discount integer DEFAULT 0,
            description text,
            pawn_fk integer NOT NULL REFERENCES pawns(id),
            employee_fk integer REFERENCES employees(id)
        )
    `);
    await db.execute(sql `
        CREATE TABLE IF NOT EXISTS settings (
            key text PRIMARY KEY,
            value text NOT NULL
        )
    `);
    await db.execute(sql `
        CREATE INDEX IF NOT EXISTS idx_pawns_customer_fk
        ON pawns (customer_fk)
    `);
    await db.execute(sql `
        CREATE INDEX IF NOT EXISTS idx_pawns_item_fk
        ON pawns (item_fk)
    `);
    await db.execute(sql `
        CREATE INDEX IF NOT EXISTS idx_pawns_last_payment_date
        ON pawns (last_payment_date)
    `);
    await db.execute(sql `
        CREATE INDEX IF NOT EXISTS idx_items_status
        ON items (status)
    `);
    await db.execute(sql `
        CREATE INDEX IF NOT EXISTS idx_items_type
        ON items (type)
    `);
    await db.execute(sql `
        CREATE INDEX IF NOT EXISTS idx_cash_transactions_pawn_fk
        ON cash_transactions (pawn_fk)
    `);
    await db.execute(sql `
        CREATE INDEX IF NOT EXISTS idx_cash_transactions_employee_fk
        ON cash_transactions (employee_fk)
    `);
    await db.execute(sql `
        CREATE INDEX IF NOT EXISTS idx_cash_transactions_type_date
        ON cash_transactions (type, date DESC)
    `);
    await db.execute(sql `
        CREATE INDEX IF NOT EXISTS idx_cash_transactions_pawn_type_date
        ON cash_transactions (pawn_fk, type, date DESC)
    `);
    await db.execute(sql `
        INSERT INTO employees (name, user_name, password, level)
        VALUES
            ('Admin User', 'admin', 'password', 'Admin'),
            ('Staff User', 'staff', 'password', 'Staff')
        ON CONFLICT (user_name) DO NOTHING
    `);
};
const start = async () => {
    try {
        await verifyDatabaseConnection();
    }
    catch (error) {
        throw new Error(`Unable to connect to Postgres using DATABASE_URL="${process.env.DATABASE_URL || ''}". ` +
            'Make sure PostgreSQL is running and reachable before launching the app.', { cause: error });
    }
    await ensureDbReady();
    const configuredDbTimeZone = await loadConfiguredDbTimeZone();
    if (configuredDbTimeZone) {
        await setDatabaseSessionTimeZone(configuredDbTimeZone);
    }
    app.listen(port, () => {
        console.log(`[API] running on http://localhost:${port}`);
    });
};
start().catch((error) => {
    console.error('[API] failed to start:', formatStartupError(error));
    process.exit(1);
});
