const MYANMAR_TO_ENGLISH_DIGITS: Record<string, string> = {
    '၀': '0', '၁': '1', '၂': '2', '၃': '3', '၄': '4',
    '၅': '5', '၆': '6', '၇': '7', '၈': '8', '၉': '9',
};

export const toEnglishDigits = (value: string): string =>
    value.replace(/[၀-၉]/g, (d) => MYANMAR_TO_ENGLISH_DIGITS[d] ?? d);

export const sanitizeNumericInput = (value: string, allowDecimal = false): string => {
    const normalized = toEnglishDigits(value || '');
    const cleaned = normalized.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, '');
    if (!allowDecimal) return cleaned;
    const [whole = '', ...rest] = cleaned.split('.');
    return rest.length > 0 ? `${whole}.${rest.join('')}` : whole;
};

export const formatMMK = (value: number | string | null | undefined): string => {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return '0 MMK';
    return `${Math.round(n).toLocaleString('en-US')} MMK`;
};

export const formatNumber = (value: number | string | null | undefined, decimals = 0): string => {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
};

export const formatDate = (value: string | number | Date | null | undefined): string => {
    if (!value) return '-';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatDateTime = (value: string | number | Date | null | undefined): string => {
    if (!value) return '-';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    const datePart = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
};

export const daysBetween = (
    from: string | number | Date,
    to: string | number | Date = new Date(),
): number => {
    const a = new Date(from);
    const b = new Date(to);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.max(0, Math.floor((b.getTime() - a.getTime()) / msPerDay));
};

export const calculateInterestByDays = (
    loanAmount: number,
    monthlyRatePercent: number,
    days: number,
): number => {
    const daily = (Number(loanAmount) || 0) * ((Number(monthlyRatePercent) || 0) / 100) / 30;
    return Math.max(0, Math.round(daily * Math.max(0, days)));
};
