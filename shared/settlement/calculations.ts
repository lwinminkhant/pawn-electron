const DAY_MS = 24 * 60 * 60 * 1000;

const startOfUtcDay = (value: Date | string | number) => {
    const date = value instanceof Date ? value : new Date(value);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const addUtcMonths = (value: Date, months: number) =>
    new Date(Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth() + months,
        value.getUTCDate(),
    ));

export const getElapsedMonthsAndDays = (
    from: Date | string | number,
    to: Date | string | number,
) => {
    const start = startOfUtcDay(from);
    const end = startOfUtcDay(to);
    if (end.getTime() <= start.getTime()) return { months: 0, days: 0 };

    let months = 0;
    let cursor = start;
    while (true) {
        const next = addUtcMonths(cursor, 1);
        if (next.getTime() > end.getTime()) break;
        cursor = next;
        months += 1;
    }

    const days = Math.floor((end.getTime() - cursor.getTime()) / DAY_MS);
    return { months, days };
};

export const calculateInterestAmountByDays = (
    principal: number,
    interestRate: number,
    days: number,
) => {
    if (days <= 0) return 0;
    const monthlyInterest = principal * (interestRate / 100);
    return Math.round((monthlyInterest / 30) * days);
};

export const calculateInterestAmountForPeriod = (
    principal: number,
    interestRate: number,
    from: Date | string | number,
    to: Date | string | number,
) => {
    const { months, days } = getElapsedMonthsAndDays(from, to);
    if (months <= 0 && days <= 0) return 0;
    const monthlyInterest = principal * (interestRate / 100);
    return Math.round(monthlyInterest * months + (monthlyInterest / 30) * days);
};

export const calculateRedeemInterest = (
    principal: number,
    interestRate: number,
    lastPaymentDate?: Date | string | null,
    createdAt?: Date | string | null,
    now = new Date(),
) => {
    const baseSource = lastPaymentDate || createdAt || now;
    const { months, days } = getElapsedMonthsAndDays(baseSource, now);
    const monthlyInterest = Math.round(principal * (interestRate / 100));
    if (months === 0 && days === 0) return monthlyInterest;
    return calculateInterestAmountForPeriod(principal, interestRate, baseSource, now);
};
