import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import type { ClientInvoice } from '@care-platform/shared';
import en from '../src/i18n/en.json';
import InvoiceScreen from '../app/invoices/[id]';
import { invoiceHtml, pdfFileName } from '../src/care/invoice-pdf';
import { AppProviders, serveApi } from '../test-utils/app';
import { mockRouter } from '../test-utils/router';
import { tokensFor } from '../test-utils/helpers';
import { tokenStore } from '@/api';

jest.mock('expo-router', () => require('../test-utils/router').expoRouterMock());

// This build's native modules: all there, unless a test takes one away (an older build).
const mockNative = { missing: new Set<string>() };
jest.mock('@/native', () => ({ hasNativeModule: (name: string) => !mockNative.missing.has(name) }));

// The phone's printer, share sheet and files, in memory.
const mockPhone = {
  printed: [] as { html: string }[],
  shared: [] as { uri: string; options: Record<string, unknown> }[],
  moves: [] as string[],
  failPrint: false,
};
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(async (o: { html: string }) => {
    if (mockPhone.failPrint) throw new Error('printer');
    mockPhone.printed.push(o);
    return { uri: 'file:///cache/Print/7f3a-random.pdf', numberOfPages: 1 };
  }),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async (uri: string, options: Record<string, unknown>) => void mockPhone.shared.push({ uri, options })),
}));
jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) => parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
  class Directory {
    uri: string;
    exists = false;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    create() {}
    delete() {}
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    moveSync(to: { uri: string }) {
      mockPhone.moves.push(to.uri);
      this.uri = to.uri;
    }
  }
  return { Directory, File, Paths: { cache: { uri: 'file:///cache' } } };
});

const INV = '0a1b2c3d-1111-4222-8333-444455556666';

const invoice = (over: Partial<ClientInvoice> = {}): ClientInvoice => ({
  id: INV,
  number: 'INV-0007',
  status: 'ISSUED',
  issueDate: '2026-11-01',
  dueDate: '2026-11-15',
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  bookingReference: 'BK-7Q2',
  seller: { name: 'Pick Care', address: 'Colombo 3', phone: '0112345678', email: 'billing@pickcare.lk', registrationNumber: 'PV 1234', taxRegistrationNumber: null } as never,
  billTo: { name: 'Amaya <Perera>', address: '12 Galle Rd\nColombo 4', phone: '+94771234567', email: 'amaya@example.lk' },
  lines: [{ description: 'Day care', serviceDate: '2026-10-02', quantity: '5', unit: 'DAY', unitPrice: '2500.00', discount: '0', amount: '12500.00' } as never],
  subtotal: '12500.00',
  discount: '0',
  discountLabel: null,
  taxName: null,
  taxRate: null,
  tax: '0',
  total: '12500.00',
  amountPaid: '0',
  balance: '12500.00',
  overdue: false,
  notes: null,
  footer: 'Bank: Sampath, A/C 0001',
  payments: [],
  canPayOnline: false,
  ...over,
});

const t = (key: string, vars?: Record<string, string | number>) => {
  const v = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en) as string;
  return Object.entries(vars ?? {}).reduce((s, [k, x]) => s.replace(`{${k}}`, String(x)), v ?? key);
};

const open = async (body = invoice()) => {
  await tokenStore.set(tokensFor('PATIENT_GUARDIAN', { patientId: 'p-1', email: 'amaya@example.lk' }));
  serveApi({ [`GET /me/invoices/${INV}`]: () => ({ status: 200, body }) });
  mockRouter.params = { id: INV };
  await render(
    <AppProviders>
      <InvoiceScreen />
    </AppProviders>,
  );
  return screen.findByRole('button', { name: en.invoices.pdf.download });
};

beforeEach(() => {
  jest.restoreAllMocks();
  mockRouter.reset();
  mockNative.missing.clear();
  mockPhone.printed = [];
  mockPhone.shared = [];
  mockPhone.moves = [];
  mockPhone.failPrint = false;
});

describe('downloading an invoice as a PDF', () => {
  it('makes a PDF named after the invoice and hands it to the share sheet', async () => {
    const button = await open();
    await fireEvent.press(button);
    await waitFor(() => expect(mockPhone.shared).toHaveLength(1));
    expect(mockPhone.printed[0].html).toContain('INV-0007');
    expect(mockPhone.moves).toEqual(['file:///cache/invoice-pdfs/INV-0007.pdf']);
    expect(mockPhone.shared[0]).toEqual({
      uri: 'file:///cache/invoice-pdfs/INV-0007.pdf',
      options: expect.objectContaining({ mimeType: 'application/pdf', UTI: 'com.adobe.pdf' }),
    });
    // Ready for another go.
    expect(await screen.findByRole('button', { name: en.invoices.pdf.download })).toBeTruthy();
  });

  it('says so when the PDF can’t be made', async () => {
    mockPhone.failPrint = true;
    await fireEvent.press(await open());
    expect(await screen.findByText(en.invoices.pdf.error)).toBeTruthy();
    expect(mockPhone.shared).toHaveLength(0);
  });

  it('asks to update the app on a build made before PDFs were added, and never opens the website', async () => {
    mockNative.missing.add('ExpoPrint');
    const site = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await fireEvent.press(await open());
    expect(await screen.findByText(en.invoices.pdf.unsupported)).toBeTruthy();
    expect(site).not.toHaveBeenCalled();
    expect(mockPhone.printed).toHaveLength(0);
  });

  it('asks to update the app when this build can’t open the share sheet', async () => {
    const sharing = require('expo-sharing') as { isAvailableAsync: jest.Mock };
    sharing.isAvailableAsync.mockResolvedValueOnce(false);
    const site = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await fireEvent.press(await open());
    expect(await screen.findByText(en.invoices.pdf.unsupported)).toBeTruthy();
    expect(site).not.toHaveBeenCalled();
  });
});

describe('the PDF page', () => {
  it('has the whole invoice, with everything escaped', () => {
    const html = invoiceHtml(
      invoice({ status: 'PAID', amountPaid: '12500.00', balance: '0.00', payments: [{ paidOn: '2026-11-03', amount: '12500.00', paymentType: 'ONLINE', method: 'PAYHERE', reference: 'PH-1' } as never] }),
      t,
      'en',
      '#0f766e',
    );
    expect(html).toContain('<title>INV-0007</title>');
    expect(html).toContain('Amaya &lt;Perera&gt;');
    expect(html).not.toContain('<Perera>');
    expect(html).toContain('12 Galle Rd<br>Colombo 4');
    expect(html).toContain('Day care');
    expect(html).toContain('5 day(s)');
    expect(html).toContain(en.invoices.doc.paidInFull);
    expect(html).toContain(en.invoices.doc.payments);
    expect(html).toContain('PH-1');
    expect(html).toContain('Bank: Sampath, A/C 0001');
    expect(html).toContain('color: #0f766e');
  });

  it('marks a cancelled invoice, and calls a taxed one a tax invoice', () => {
    expect(invoiceHtml(invoice({ status: 'VOID' }), t, 'en', '#000')).toContain(en.invoices.doc.void);
    expect(invoiceHtml(invoice({ taxRate: '18', taxName: 'VAT', tax: '2250.00' }), t, 'en', '#000')).toContain(en.invoices.doc.taxInvoice);
  });

  it('is named after the invoice number, safely', () => {
    expect(pdfFileName({ number: 'INV-0007', id: INV })).toBe('INV-0007.pdf');
    expect(pdfFileName({ number: 'INV/2026 07', id: INV })).toBe('INV-2026-07.pdf');
    expect(pdfFileName({ number: '', id: 'abc' })).toBe('abc.pdf');
  });
});
