import { apiClient } from '../client';
import { API } from '../endpoints';
import {
  FeeStructure,
  Payment,
  Invoice,
  PaginatedResponse,
  ListParams,
  CreatePaymentRequest,
  SchoolFeeAssignment,
  StudentSchoolFeeRecord,
  SchoolFeeSummary,
  CreateSchoolFeeAssignmentRequest,
  UpdateStudentSchoolFeeRecordRequest,
} from '../types';

export const feesService = {
  async getFeeStructures(params?: ListParams): Promise<PaginatedResponse<FeeStructure>> {
    const { data } = await apiClient.get(API.FEES.STRUCTURES, { params });
    return data;
  },

  async createFeeStructure(feeData: Partial<FeeStructure>): Promise<FeeStructure> {
    const { data } = await apiClient.post(API.FEES.STRUCTURES, feeData);
    return data;
  },

  async updateFeeStructure(id: string, feeData: Partial<FeeStructure>): Promise<FeeStructure> {
    const { data } = await apiClient.patch(API.FEES.STRUCTURE_DETAIL(id), feeData);
    return data;
  },

  async deleteFeeStructure(id: string): Promise<void> {
    await apiClient.delete(API.FEES.STRUCTURE_DETAIL(id));
  },

  async getPayments(params?: ListParams): Promise<PaginatedResponse<Payment>> {
    const { data } = await apiClient.get(API.FEES.PAYMENTS, { params });
    return data;
  },

  async getMyPayments(params?: ListParams): Promise<PaginatedResponse<Payment>> {
    const { data } = await apiClient.get(API.FEES.MY_PAYMENTS, { params });
    return data;
  },

  async createPayment(paymentData: CreatePaymentRequest): Promise<Payment> {
    const { data } = await apiClient.post(API.FEES.PAYMENTS, paymentData);
    return data;
  },

  async confirmPayment(idOrPayload: string | { id: string }): Promise<Payment> {
    const id = typeof idOrPayload === 'string' ? idOrPayload : idOrPayload.id;
    const { data } = await apiClient.post(API.FEES.CONFIRM(id), {});
    return data;
  },

  async rejectPayment(idOrPayload: string | { id: string; reason?: string }, reason?: string): Promise<Payment> {
    const id = typeof idOrPayload === 'string' ? idOrPayload : idOrPayload.id;
    const payloadReason = typeof idOrPayload === 'string' ? reason : idOrPayload.reason;
    const { data } = await apiClient.post(API.FEES.REJECT(id), { reason: payloadReason });
    return data;
  },

  async getRevenueReport(params?: ListParams): Promise<any> {
    const { data } = await apiClient.get(API.FEES.REVENUE_REPORT, { params });
    return data;
  },

  async getFinancialOverview(params?: ListParams): Promise<any> {
    const { data } = await apiClient.get(API.FEES.FINANCIAL_OVERVIEW, { params });
    return data;
  },

  async campayCollect(payload: {
    purpose: "platform_charge" | "fee_structure";
    phone: string;
    student_id?: string;
    fee_structure?: string;
    amount?: string | number;
  }): Promise<any> {
    const { data } = await apiClient.post(API.FEES.CAMPAY_COLLECT, payload);
    return data;
  },

  async campayStatus(externalReference: string): Promise<any> {
    const { data } = await apiClient.get(API.FEES.CAMPAY_STATUS(externalReference));
    return data;
  },

  async getOutstandingFees(params?: ListParams): Promise<PaginatedResponse<any>> {
    const { data } = await apiClient.get(API.FEES.OUTSTANDING, { params });
    return data;
  },

  async getReceipt(id: string): Promise<Blob> {
    const { data } = await apiClient.get(API.FEES.RECEIPT(id), {
      responseType: 'blob',
    });
    return data;
  },

  async getInvoices(params?: ListParams): Promise<PaginatedResponse<Invoice>> {
    const { data } = await apiClient.get(API.FEES.INVOICES, { params });
    return data;
  },

  async getInvoice(id: string): Promise<Invoice> {
    const { data } = await apiClient.get(API.FEES.INVOICE_DETAIL(id));
    return data;
  },

  async getSchoolFeeAssignments(params?: ListParams): Promise<PaginatedResponse<SchoolFeeAssignment>> {
    const { data } = await apiClient.get(API.FEES.SCHOOL_FEE_ASSIGNMENTS, { params });
    return data;
  },

  async createSchoolFeeAssignment(payload: CreateSchoolFeeAssignmentRequest): Promise<SchoolFeeAssignment> {
    const { data } = await apiClient.post(API.FEES.SCHOOL_FEE_ASSIGNMENTS, payload);
    return data;
  },

  async updateSchoolFeeAssignment(id: string, payload: Partial<CreateSchoolFeeAssignmentRequest>): Promise<SchoolFeeAssignment> {
    const { data } = await apiClient.patch(API.FEES.SCHOOL_FEE_ASSIGNMENT_DETAIL(id), payload);
    return data;
  },

  async getStudentSchoolFees(params?: ListParams): Promise<PaginatedResponse<StudentSchoolFeeRecord>> {
    const { data } = await apiClient.get(API.FEES.STUDENT_SCHOOL_FEES, { params });
    return data;
  },

  async updateStudentSchoolFeeRecord(id: string, payload: UpdateStudentSchoolFeeRecordRequest): Promise<StudentSchoolFeeRecord> {
    const { data } = await apiClient.patch(API.FEES.STUDENT_SCHOOL_FEE_DETAIL(id), payload);
    return data;
  },

  async getSchoolFeeSummary(params?: ListParams): Promise<SchoolFeeSummary> {
    const { data } = await apiClient.get(API.FEES.SCHOOL_FEE_SUMMARY, { params });
    return data;
  },

  async downloadSchoolFeeReportPdf(params?: ListParams): Promise<Blob> {
    const { data } = await apiClient.get(API.FEES.SCHOOL_FEE_REPORT_PDF, {
      params,
      responseType: 'blob',
    });
    return data;
  },
};
