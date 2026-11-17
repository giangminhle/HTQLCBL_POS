import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createAuthSession,
  memoryStorageAdapter,
  type StoredSession,
  type ShiftSummary,
} from '@retailchain/shared';
import { AuthProvider } from './auth';
import { PaymentModal, type CartItem } from './components/PaymentModal';
import { ReceiptPrint } from './components/ReceiptPrint';
import { OpenShiftModal } from './components/OpenShiftModal';
import { CloseShiftModal } from './components/CloseShiftModal';

const mockCashier = {
  id: 'u1',
  username: 'cashier01',
  fullName: 'Lê Văn Thu Ngân',
  role: 'CASHIER' as const,
  branchId: 'b1',
  mustChangePassword: false,
};

const mockSession: StoredSession = {
  accessToken: 'test-token',
  refreshToken: 'rt',
  refreshTokenExpiresAt: '2030-01-01T00:00:00.000Z',
  user: mockCashier,
};

async function renderWithAuth(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const storage = memoryStorageAdapter(mockSession);
  const auth = createAuthSession({
    baseUrl: 'http://api',
    client: 'pos',
    storage,
    onRefreshRejected: 'flag',
    fetchImpl: vi.fn(),
  });
  await auth.init();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider auth={auth}>{ui}</AuthProvider>
    </QueryClientProvider>,
  );
}

describe('PaymentModal (REQ-POS-02)', () => {
  const mockItems: CartItem[] = [
    {
      variantId: 'v1',
      variantName: 'Gói 100g',
      productName: 'Bánh gạo One One',
      sku: 'ONEONE-100',
      unit: 'Gói',
      unitPrice: 90000,
      quantity: 2,
      discount: 0,
      lineTotal: 180000,
    },
  ];

  it('calculates cash change accurately and handles payment modal interactions', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    await renderWithAuth(
      <PaymentModal
        branchId="b1"
        shiftId="s1"
        subtotal={180000}
        discount={0}
        total={180000}
        items={mockItems}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    // Initial total is 180,000 VND
    expect(screen.getByText('Thanh toán đơn hàng (F9)')).toBeInTheDocument();
    expect(screen.getAllByText(/180\.000/)[0]).toBeInTheDocument();

    // Default cash given is 180,000, so change is 0 VND
    expect(screen.getByText('Tiền thừa trả khách:')).toBeInTheDocument();

    // Change cash given to 200,000 VND
    const cashGivenInput = screen.getByLabelText(/Khách đưa/i);
    fireEvent.change(cashGivenInput, { target: { value: '200000' } });

    // Change given should now be 20,000 VND
    expect(screen.getByText(/20\.000/)).toBeInTheDocument();
  });

  it('supports simulated QR payment in QR tab', async () => {
    await renderWithAuth(
      <PaymentModal
        branchId="b1"
        shiftId="s1"
        subtotal={180000}
        discount={0}
        total={180000}
        items={mockItems}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    // Click QR tab
    const qrTab = screen.getByRole('button', { name: /Chuyển khoản QR/i });
    fireEvent.click(qrTab);

    // Mock QR simulation button should appear
    const mockButton = screen.getByRole('button', { name: /Giả lập khách đã quét QR thành công/i });
    expect(mockButton).toBeInTheDocument();

    fireEvent.click(mockButton);
    expect(screen.getByText(/Đã giả lập thanh toán QR thành công/i)).toBeInTheDocument();
  });
});

describe('ReceiptPrint (REQ-POS-03)', () => {
  it('renders standard 80mm receipt with order code, items and total', () => {
    const mockSale = {
      id: '018f-test-id',
      code: 'POS-TEST-001',
      branchId: 'b1',
      branchName: 'Chi nhánh Quận 1',
      shiftId: 's1',
      cashierId: 'u1',
      cashierName: 'Nguyễn Văn Thu Ngân',
      customerId: null,
      subtotal: 100000,
      discount: 10000,
      total: 90000,
      status: 'COMPLETED' as const,
      createdAtClient: '2026-11-20T10:00:00.000Z',
      createdAtServer: '2026-11-20T10:00:00.000Z',
      updatedAt: '2026-11-20T10:00:00.000Z',
      note: null,
      items: [
        {
          id: 'item-1',
          saleId: '018f-test-id',
          variantId: 'v1',
          productName: 'Sữa tươi Vinamilk 1L',
          variantName: 'Không đường',
          sku: 'MILK-001',
          quantity: 2,
          unitPrice: 50000,
          discount: 10000,
          lineTotal: 90000,
          returnedQuantity: 0,
        },
      ],
      payments: [
        {
          id: 'p1',
          saleId: '018f-test-id',
          method: 'CASH' as const,
          amount: 100000,
          reference: null,
          createdAt: '2026-11-20T10:00:00.000Z',
        },
      ],
      returns: [],
    };

    render(<ReceiptPrint sale={mockSale} />);

    expect(screen.getByText('HỆ THỐNG BÁN LẺ POS')).toBeInTheDocument();
    expect(screen.getByText('Chi nhánh Quận 1')).toBeInTheDocument();
    expect(screen.getByText('POS-TEST-001')).toBeInTheDocument();
    expect(screen.getByText('Không đường')).toBeInTheDocument();
    expect(screen.getAllByText(/90\.000/)[0]).toBeInTheDocument();
  });
});

describe('OpenShiftModal & CloseShiftModal (REQ-SHF-01)', () => {
  it('OpenShiftModal renders opening cash form correctly', async () => {
    await renderWithAuth(<OpenShiftModal onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.getByText('Mở ca làm việc mới')).toBeInTheDocument();
    const input = screen.getByLabelText(/Tiền mặt đầu ca/i);
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '500000' } });
    expect(input).toHaveValue(500000);
  });

  it('CloseShiftModal calculates cash difference correctly', async () => {
    const mockSummary: ShiftSummary = {
      shift: {
        id: 'shift-1',
        code: 'CA-01',
        branchId: 'b1',
        cashierId: 'u1',
        openedAt: '2026-11-20T08:00:00.000Z',
        closedAt: null,
        openingCash: 500000,
        closingCash: null,
        expectedCash: 1300000,
        difference: null,
        status: 'OPEN',
        note: null,
        createdAt: '2026-11-20T08:00:00.000Z',
        updatedAt: '2026-11-20T08:00:00.000Z',
      },
      cashSales: 800000,
      cardSales: 200000,
      qrSales: 200000,
      cashRefunds: 0,
      totalSales: 1200000,
      expectedCash: 1300000, // 500,000 + 800,000
    };

    await renderWithAuth(<CloseShiftModal summary={mockSummary} onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.getByText('Chốt ca làm việc')).toBeInTheDocument();
    expect(screen.getByText('1.300.000 ₫')).toBeInTheDocument(); // expectedCash

    const actualInput = screen.getByLabelText(/Tiền mặt đếm thực tế/i);
    fireEvent.change(actualInput, { target: { value: '1250000' } });

    // Discrepancy is -50,000 VND
    expect(screen.getByText(/Tiền thực tế thiếu/i)).toBeInTheDocument();
  });
});
