const DAY_MS = 24 * 60 * 60 * 1000;
const startOfUtcDay = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};
const addUtcMonths = (value, months) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, value.getUTCDate()));
export const getElapsedMonthsAndDays = (from, to) => {
    const start = startOfUtcDay(from);
    const end = startOfUtcDay(to);
    if (end.getTime() <= start.getTime())
        return { months: 0, days: 0 };
    let months = 0;
    let cursor = start;
    while (true) {
        const next = addUtcMonths(cursor, 1);
        if (next.getTime() > end.getTime())
            break;
        cursor = next;
        months += 1;
    }
    const days = Math.floor((end.getTime() - cursor.getTime()) / DAY_MS);
    return { months, days };
};
export const calculateInterestAmountByDays = (principal, interestRate, days) => {
    if (days <= 0)
        return 0;
    const monthlyInterest = principal * (interestRate / 100);
    return Math.round((monthlyInterest / 30) * days);
};
export const calculateInterestAmountForPeriod = (principal, interestRate, from, to) => {
    const { months, days } = getElapsedMonthsAndDays(from, to);
    if (months <= 0 && days <= 0)
        return 0;
    const monthlyInterest = principal * (interestRate / 100);
    return Math.round(monthlyInterest * months + (monthlyInterest / 30) * days);
};
export const calculateRedeemInterest = (principal, interestRate, lastPaymentDate, createdAt, now = new Date(), hasPriorInterestPayment = Boolean(lastPaymentDate)) => {
    const baseSource = lastPaymentDate || createdAt || now;
    const { months, days } = getElapsedMonthsAndDays(baseSource, now);
    const monthlyInterest = Math.round(principal * (interestRate / 100));
    // Redeem only: if no interest was ever paid, collect the first month in full.
    if (!hasPriorInterestPayment && months === 0)
        return monthlyInterest;
    if (months === 0 && days === 0)
        return monthlyInterest;
    return calculateInterestAmountForPeriod(principal, interestRate, baseSource, now);
};
