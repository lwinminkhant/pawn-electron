import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { buildTicketQrPayload } from '../utils/ticketScan';
import { formatDate, formatDecimal, formatMyanmarWeight, formatNumber, formatWeight } from '../utils/format';

interface PawnReceiptProps {
    pawnId: number;
    physicalNumber?: string;
    storageLocation?: string;
    slotNumber?: number;
    sequence?: number;
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    itemType: string;
    itemDescription: string;
    itemPhoto?: string;
    weight: number;
    nonGoldWeight: number;
    netWeight: number;
    goldRate: number;
    loanAmount: number;
    interestRate: number;
    pawnDate: string;
    dueDate: string;
    showGoldDetails?: boolean;
}

type VoucherRow = {
    label: string;
    value: string;
};

type StoredAuthUser = {
    id?: number;
    name?: string;
    level?: string;
};

const HEADER_IMAGE_SRC = '/print-assets/header.png';
const AUTH_STORAGE_KEY = 'pawnAuthUser';

export const PawnReceipt: React.FC<PawnReceiptProps> = (props) => {
    const [qrCodeSrc, setQrCodeSrc] = useState('');
    const [currentAccountLabel, setCurrentAccountLabel] = useState('');

    useEffect(() => {
        let cancelled = false;

        QRCode.toDataURL(buildTicketQrPayload(props.pawnId), {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: 220,
        })
            .then((src: string) => {
                if (!cancelled) setQrCodeSrc(src);
            })
            .catch((error: unknown) => {
                console.error('Failed to generate ticket QR code.', error);
                if (!cancelled) setQrCodeSrc('');
            });

        return () => {
            cancelled = true;
        };
    }, [props.pawnId]);

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
            if (!raw) {
                setCurrentAccountLabel('');
                return;
            }

            const parsed = JSON.parse(raw) as StoredAuthUser | null;
            const name = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
            setCurrentAccountLabel(name);
        } catch {
            setCurrentAccountLabel('');
        }
    }, []);

    const rawCodeValue =
        props.storageLocation ||
        props.physicalNumber ||
        (props.slotNumber ? `SLOT-${props.slotNumber}` : '-');
    const codeValue =
        props.sequence != null ? `${rawCodeValue} [${props.sequence}]` : rawCodeValue;
    const weightValue = props.showGoldDetails
        ? `${formatMyanmarWeight(props.weight)} [ ${formatWeight(props.netWeight)}g ]`
        : `${formatMyanmarWeight(props.weight)} [ ${formatWeight(props.weight)}g ]`;

    const rows: VoucherRow[] = [
        { label: 'Id', value: String(props.pawnId) },
        { label: 'Code', value: codeValue },
        { label: 'အမည်', value: props.customerName || '-' },
        { label: 'နေရပ်', value: props.customerAddress || '-' },
        { label: 'ပစ္စည်းအမည်', value: props.itemDescription || props.itemType || '-' },
        { label: 'အလေးချိန်', value: weightValue },
        { label: 'ချေးယူငွေ', value: formatNumber(props.loanAmount) },
        { label: 'အတိုးနှုန်း', value: `${formatDecimal(props.interestRate, 2)}%` },
        { label: 'ရက်စွဲ', value: formatDate(props.pawnDate) },
        { label: 'ကုန်ဆုံးရက်', value: formatDate(props.dueDate) },
    ];

    const VoucherCopy = ({ showQr }: { showQr: boolean }) => (
        <section className={`voucher-copy${showQr ? ' voucher-copy-with-qr' : ''}`}>
            <header className="voucher-header">
                <img
                    src={HEADER_IMAGE_SRC}
                    alt="Pawn voucher header"
                    className="voucher-header-image"
                />
                {currentAccountLabel && (
                    <div className="voucher-account-profile">{currentAccountLabel}</div>
                )}
            </header>

            <div className={`voucher-body${showQr ? ' voucher-body-with-qr' : ''}`}>
                <div className="voucher-copy-main">
                    <div className="voucher-table">
                        {rows.map((row) => (
                            <div className="voucher-row" key={row.label}>
                                <div className="voucher-label">{row.label}</div>
                                <div className="voucher-value">{row.value}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {showQr && (
                    <aside className="voucher-qr">
                        {qrCodeSrc ? (
                            <img
                                src={qrCodeSrc}
                                alt={`QR code for ticket ${props.pawnId}`}
                                className="voucher-qr-image"
                            />
                        ) : (
                            <div className="voucher-qr-placeholder" />
                        )}
                        <div className="voucher-qr-caption">Scan to load ticket #{props.pawnId}</div>
                    </aside>
                )}
            </div>
        </section>
    );

    const receiptMarkup = (
        <div id="print-receipt" className="print-only pawn-voucher-sheet">
            <div className="pawn-voucher-page">
                <VoucherCopy showQr={false} />
                <VoucherCopy showQr />
            </div>
        </div>
    );

    if (typeof document === 'undefined') {
        return receiptMarkup;
    }

    return createPortal(receiptMarkup, document.body);
};
