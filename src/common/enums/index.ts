export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  FINANCE = 'finance',
  ADMISSION = 'admission',
  TEACHER = 'teacher',
  STUDENT = 'student',
  PARENT = 'parent',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

export enum FeeCategory {
  TUITION = 'tuition',
  ADMISSION = 'admission',
  EXAM = 'exam',
  LIBRARY = 'library',
  LABORATORY = 'laboratory',
  TRANSPORT = 'transport',
  HOSTEL = 'hostel',
  SPORTS = 'sports',
  UNIFORM = 'uniform',
  MISCELLANEOUS = 'miscellaneous',
  LATE_FEE = 'late_fee',
  DISCOUNT = 'discount',
}

export enum FeeFrequency {
  ONE_TIME = 'one_time',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  SEMI_ANNUAL = 'semi_annual',
  ANNUAL = 'annual',
  CUSTOM = 'custom',
}

export enum InvoiceStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  PARTIALLY_PAID = 'partially_paid',
  PAID = 'paid',
  OVERDUE = 'overdue',
  WAIVED = 'waived',
  CANCELLED = 'cancelled',
}

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
}

export enum PaymentMethod {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
  CHEQUE = 'cheque',
  ONLINE = 'online',
  POS = 'pos',
}

export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
}

export enum DiscountCategory {
  MERIT = 'merit',
  NEED_BASED = 'need_based',
  SIBLING = 'sibling',
  STAFF_WARD = 'staff_ward',
  SPECIAL = 'special',
}

export enum AcademicTerm {
  FIRST = 'first',
  SECOND = 'second',
  THIRD = 'third',
}

export enum NotificationType {
  EMAIL = 'email',
  SMS = 'sms',
  SYSTEM = 'system',
}

export enum NotificationEvent {
  INVOICE_GENERATED = 'invoice_generated',
  PAYMENT_RECEIVED = 'payment_received',
  PAYMENT_OVERDUE = 'payment_overdue',
  REMINDER_SENT = 'reminder_sent',
  DISCOUNT_APPLIED = 'discount_applied',
  WAIVER_APPLIED = 'waiver_applied',
  ACCOUNT_CREATED = 'account_created',
  PASSWORD_RESET = 'password_reset',
}

export enum ReportType {
  FEE_COLLECTION = 'fee_collection',
  FEE_OUTSTANDING = 'fee_outstanding',
  FEE_TARGET_VS_ACTUAL = 'fee_target_vs_actual',
  STUDENT_LEDGER = 'student_ledger',
  CLASS_WISE_COLLECTION = 'class_wise_collection',
  DEFAULTER_LIST = 'defaulter_list',
  DISCOUNT_SUMMARY = 'discount_summary',
  PAYMENT_METHOD_SUMMARY = 'payment_method_summary',
  MONTHLY_SUMMARY = 'monthly_summary',
}

export enum ClassLevel {
  NURSERY = 'nursery',
  KG = 'kg',
  ONE = '1',
  TWO = '2',
  THREE = '3',
  FOUR = '4',
  FIVE = '5',
  SIX = '6',
  SEVEN = '7',
  EIGHT = '8',
  NINE = '9',
  TEN = '10',
  ELEVEN = '11',
  TWELVE = '12',
}

export enum AdmissionStatus {
  APPLIED = 'applied',
  UNDER_REVIEW = 'under_review',
  ADMITTED = 'admitted',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
}

export enum WaiverStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}
