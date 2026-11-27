import { formatLkr, type ClientInvoice } from '@care-platform/shared';
import { hasNativeModule } from '@/native';
import { formatDate } from '@/ui/dates';

type Print = typeof import('expo-print');
type Sharing = typeof import('expo-sharing');
type FileSystem = typeof import('expo-file-system');
type T = (key: string, vars?: Record<string, string | number>) => string;

/**
 * "Download PDF" on an invoice: the invoice laid out as an A4 page (the
 * website's printed invoice), turned into a PDF by the phone, then handed to
 * the share sheet - "Save to Files" on an iPhone, Drive / Files / WhatsApp /
 * email on Android.
 *
 * The phone's own web view lays the text out, so Sinhala and Tamil come out in
 * the phone's fonts, with no PDF font set-up (as on the website).
 *
 * expo-print and expo-sharing are only in builds made after they were added:
 * each is checked before it is loaded, and an older build gets `unsupported`
 * so the screen can ask the person to update the app.
 */

/** Where the made PDF is kept while the share sheet has it. Emptied before each one. */
const DIR = 'invoice-pdfs';

function load(): { print: Print; sharing: Sharing; fs: FileSystem } | null {
  if (!hasNativeModule('ExpoPrint') || !hasNativeModule('ExpoSharing') || !hasNativeModule('FileSystem')) return null;
  try {
    return {
      print: require('expo-print') as Print,
      sharing: require('expo-sharing') as Sharing,
      fs: require('expo-file-system') as FileSystem,
    };
  } catch {
    return null;
  }
}

export const canMakeInvoicePdf = () => load() !== null;

/** "INV-0007.pdf": the invoice number, safe as a file name on every phone. */
export function pdfFileName(inv: Pick<ClientInvoice, 'number' | 'id'>): string {
  const base = (inv.number || inv.id).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base || 'invoice'}.pdf`;
}

export type PdfOutcome = 'shared' | 'unsupported' | 'failed';

/** Makes the PDF and opens the share sheet. Never throws: says how it went. */
export async function shareInvoicePdf(inv: ClientInvoice, t: T, locale: string, brandColor: string): Promise<PdfOutcome> {
  const mods = load();
  if (!mods) return 'unsupported';
  const { print, sharing, fs } = mods;
  try {
    if (!(await sharing.isAvailableAsync())) return 'unsupported';
    const { uri } = await print.printToFileAsync({ html: invoiceHtml(inv, t, locale, brandColor), width: 595, height: 842 });

    // A file named after the invoice, not the printer's random name.
    const dir = new fs.Directory(fs.Paths.cache, DIR);
    if (dir.exists) dir.delete();
    dir.create({ intermediates: true, idempotent: true });
    const file = new fs.File(uri);
    file.moveSync(new fs.File(dir, pdfFileName(inv)));

    await sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: `${inv.number}.pdf`,
    });
    return 'shared';
  } catch {
    return 'failed';
  }
}

const esc = (v: string | null | undefined) =>
  (v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Text with its line breaks kept (addresses, notes, the footer). */
const lines = (v: string | null | undefined) => esc(v).replace(/\r?\n/g, '<br>');

/** The invoice as one A4 HTML page - the same content and order as the website's printed invoice. */
export function invoiceHtml(inv: ClientInvoice, t: T, locale: string, brandColor: string): string {
  const s = inv.seller;
  const taxed = Boolean(inv.taxRate);
  const money = (v: string) => esc(formatLkr(v).replace('LKR ', ''));
  const lkr = (v: string) => esc(formatLkr(v));
  const date = (v: string) => esc(formatDate(v, locale));
  const join = (...parts: (string | null | undefined)[]) => esc(parts.filter(Boolean).join(' · '));

  const meta: [string, string][] = [
    [t('invoices.doc.issued'), date(inv.issueDate)],
    [t('invoices.doc.due'), date(inv.dueDate)],
  ];
  if (inv.periodStart && inv.periodEnd) meta.push([t('invoices.doc.period'), `${date(inv.periodStart)} – ${date(inv.periodEnd)}`]);
  if (inv.bookingReference) meta.push([t('invoices.doc.booking'), esc(inv.bookingReference)]);

  const rows = inv.lines
    .map(
      (l) => `<tr>
        <td class="nowrap muted">${l.serviceDate ? date(l.serviceDate) : ''}</td>
        <td>${esc(l.description)}${Number(l.discount) > 0 ? `<div class="small muted">${esc(t('invoices.doc.lineDiscount', { amount: formatLkr(l.discount) }))}</div>` : ''}</td>
        <td class="num">${esc(`${Number(l.quantity)} ${t(`invoices.unit.${l.unit}`)}`)}</td>
        <td class="num">${money(l.unitPrice)}</td>
        <td class="num">${money(l.amount)}</td>
      </tr>`,
    )
    .join('');

  const totals: [string, string, boolean][] = [[t('invoices.doc.subtotal'), lkr(inv.subtotal), false]];
  if (Number(inv.discount) > 0) {
    totals.push([inv.discountLabel ? `${t('invoices.doc.discount')} (${inv.discountLabel})` : t('invoices.doc.discount'), `−${lkr(inv.discount)}`, false]);
  }
  if (taxed) totals.push([`${inv.taxName ?? ''} ${Number(inv.taxRate)}%`, lkr(inv.tax), false]);
  totals.push([t('invoices.doc.total'), lkr(inv.total), true]);
  if (Number(inv.amountPaid) !== 0) {
    totals.push([t('invoices.doc.paid'), `−${lkr(inv.amountPaid)}`, false]);
    totals.push([t('invoices.doc.balance'), lkr(inv.balance), true]);
  }

  const payments = inv.payments.length
    ? `<section class="block">
        <p class="label">${esc(t('invoices.doc.payments'))}</p>
        <table class="plain">${inv.payments
          .map(
            (p) => `<tr>
              <td class="muted">${date(p.paidOn)} · ${esc(t(`invoices.paymentType.${p.paymentType}`))}${
                p.method && p.method !== 'CASH' ? ` (${esc(t(`invoices.method.${p.method}`))})` : ''
              }${p.reference ? ` · ${esc(p.reference)}` : ''}</td>
              <td class="num">${lkr(p.amount)}</td>
            </tr>`,
          )
          .join('')}</table>
      </section>`
    : '';

  return `<!DOCTYPE html>
<html lang="${esc(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(inv.number)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #1f2937; font: 10.5pt/1.45 -apple-system, system-ui, Roboto, 'Noto Sans', 'Noto Sans Sinhala', 'Noto Sans Tamil', sans-serif; }
  .muted { color: #6b7280; }
  .small { font-size: 8.5pt; }
  .nowrap { white-space: nowrap; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; }
  .seller-name { font-size: 13pt; font-weight: 600; margin: 0 0 2px; }
  .title { margin: 0; font-size: 18pt; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: ${esc(brandColor)}; text-align: right; }
  .number { margin: 2px 0 8px; font-size: 12pt; font-weight: 600; text-align: right; }
  .meta { margin-left: auto; border-collapse: collapse; }
  .meta td { padding: 0 0 1px 14px; }
  p { margin: 0; }
  .block { padding-top: 16px; }
  .label { font-size: 8pt; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #6b7280; margin-bottom: 2px; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 18px; }
  table.lines th { font-size: 8pt; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: #6b7280; text-align: left; padding: 6px 8px 6px 0; border-bottom: 2px solid #d1d5db; }
  table.lines th.num { text-align: right; }
  table.lines td { padding: 6px 8px 6px 0; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  table.lines th:last-child, table.lines td:last-child { padding-right: 0; }
  tr { page-break-inside: avoid; }
  .totals { margin: 14px 0 0 auto; border-collapse: collapse; min-width: 50%; page-break-inside: avoid; }
  .totals td { padding: 2px 0 2px 16px; }
  .totals .strong td { font-weight: 700; font-size: 11.5pt; border-top: 1px solid #e5e7eb; padding-top: 5px; }
  .paid { margin-top: 12px; text-align: right; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: ${esc(brandColor)}; }
  .void { margin-bottom: 16px; padding: 6px 10px; border: 1px solid #b91c1c; border-radius: 4px; color: #b91c1c; text-align: center; font-weight: 700; text-transform: uppercase; }
  table.plain { width: 100%; border-collapse: collapse; }
  table.plain td { padding: 2px 0; }
  .notes { margin-top: 22px; }
  footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 8.5pt; color: #6b7280; }
</style>
</head>
<body>
  ${inv.status === 'VOID' ? `<p class="void">${esc(t('invoices.doc.void'))}</p>` : ''}
  <header>
    <div>
      <p class="seller-name">${esc(s.name)}</p>
      ${s.address ? `<p class="muted">${lines(s.address)}</p>` : ''}
      ${s.phone || s.email ? `<p class="muted">${join(s.phone, s.email)}</p>` : ''}
      ${s.registrationNumber ? `<p class="muted">${esc(t('invoices.doc.regNo', { number: s.registrationNumber }))}</p>` : ''}
      ${taxed && s.taxRegistrationNumber ? `<p class="muted">${esc(t('invoices.doc.taxRegNo', { name: inv.taxName ?? '', number: s.taxRegistrationNumber }))}</p>` : ''}
    </div>
    <div>
      <p class="title">${esc(taxed ? t('invoices.doc.taxInvoice') : t('invoices.doc.invoice'))}</p>
      <p class="number">${esc(inv.number)}</p>
      <table class="meta">${meta.map(([k, v]) => `<tr><td class="muted">${esc(k)}</td><td class="num">${v}</td></tr>`).join('')}</table>
    </div>
  </header>

  <section class="block">
    <p class="label">${esc(t('invoices.doc.billTo'))}</p>
    <p><strong>${esc(inv.billTo.name)}</strong></p>
    ${inv.billTo.address ? `<p class="muted">${lines(inv.billTo.address)}</p>` : ''}
    ${inv.billTo.phone || inv.billTo.email ? `<p class="muted">${join(inv.billTo.phone, inv.billTo.email)}</p>` : ''}
  </section>

  <table class="lines">
    <thead><tr>
      <th>${esc(t('invoices.doc.date'))}</th>
      <th>${esc(t('invoices.doc.description'))}</th>
      <th class="num">${esc(t('invoices.doc.quantity'))}</th>
      <th class="num">${esc(t('invoices.doc.price'))}</th>
      <th class="num">${esc(t('invoices.doc.amount'))}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="totals">${totals.map(([k, v, strong]) => `<tr${strong ? ' class="strong"' : ''}><td>${esc(k)}</td><td class="num">${v}</td></tr>`).join('')}</table>

  ${inv.status === 'PAID' ? `<p class="paid">${esc(t('invoices.doc.paidInFull'))}</p>` : ''}
  ${payments}
  ${inv.notes ? `<p class="notes">${lines(inv.notes)}</p>` : ''}
  ${inv.footer ? `<footer>${lines(inv.footer)}</footer>` : ''}
</body>
</html>`;
}
