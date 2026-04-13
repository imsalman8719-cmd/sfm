# 🏫 School Fee Management System

A full-featured, production-ready **NestJS + TypeORM** backend for managing school fee structures, invoices, payments, and financial reporting.

---

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [API Overview](#api-overview)
- [Role-Based Access](#role-based-access)
- [Fee Workflow](#fee-workflow)
- [Reports & Analytics](#reports--analytics)
- [Automated Jobs](#automated-jobs)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)

---

## ✨ Features

### Core Fee Management
- **Fee Structures** – configurable categories (tuition, exam, library, transport, hostel, sports, etc.) with one-time / monthly / quarterly / annual / installment billing
- **Bulk Invoice Generation** – generate invoices for an entire class or academic year in one API call
- **Automatic Late Fees** – configurable grace periods and late fee rules (percentage or fixed)
- **Discount Engine** – merit, sibling, staff-ward, need-based discounts at student or fee-structure level
- **Fee Waivers** – request → approval workflow with finance department review
- **Multi-payment** – partial payments, overpayment protection, refund handling

### Finance Reporting
| Report | Description |
|--------|-------------|
| **Dashboard KPIs** | Total students, invoiced, collected, outstanding, overdue, collection rate |
| **Target vs Actual** | Monthly & quarterly target comparison with shortfall/surplus |
| **Defaulter List** | Students with outstanding dues, total owed, oldest due date |
| **Class-wise Summary** | Per-class collection rates and defaulter counts |
| **Monthly Summary** | Month-by-month breakdown for any academic year |
| **Student Ledger** | Full individual fee statement with all invoices + payments |
| **Payment Method Breakdown** | Cash vs bank vs cheque vs online distribution |
| **Discount Summary** | Total concessions given, by class and category |
| **Outstanding Report** | All unpaid/overdue invoices with aging |
| **Fee Collection Report** | All payments with filters by date, class, method |

### User Management (Role-Based)
- **Super Admin** – full system access, user CRUD, all reports
- **Finance** – fee structures, invoices, payments, full reports, waiver approvals
- **Admission** – student enrollment, class assignment
- **Teacher** – read-only access to class and student info
- **Student** – view own invoices, payment history, ledger

### Notifications
- Email notifications on invoice generation, payment receipt, overdue, reminders
- Full notification log with retry tracking

### Security
- JWT access + refresh token rotation
- Bcrypt password hashing
- Rate limiting via Throttler
- Helmet headers
- Soft deletes throughout
- CORS configured

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS 10 |
| Language | TypeScript 5 |
| ORM | TypeORM 0.3 |
| Database | PostgreSQL 15+ |
| Auth | JWT (access + refresh), Passport.js |
| Scheduler | @nestjs/schedule (cron jobs) |
| Email | Nodemailer |
| Docs | Swagger / OpenAPI |
| Security | Helmet, Throttler, bcrypt |

---

## 🗂 Architecture

```
src/
├── common/
│   ├── decorators/         # @Public, @Roles, @CurrentUser
│   ├── dto/                # PaginationDto, ApiResponse, PaginatedResult
│   ├── entities/           # CoreEntity (id, createdAt, updatedAt, deletedAt)
│   ├── enums/              # All system enums
│   ├── filters/            # GlobalExceptionFilter
│   └── guards/             # JwtAuthGuard, RolesGuard
│
├── config/                 # App, DB, JWT, Mail, Fee configs
│
├── database/
│   ├── data-source.ts      # TypeORM DataSource for migrations
│   ├── migrations/         # SQL migration files
│   └── seeds/              # Database seed script
│
└── modules/
    ├── auth/               # Login, refresh, forgot/reset password
    ├── users/              # User CRUD, status, password management
    ├── academic-years/     # Academic year + revenue targets
    ├── classes/            # Class/section management
    ├── students/           # Student enrollment, profiles, siblings
    ├── fee-structures/     # Fee definitions + discount rules
    ├── fee-invoices/       # Invoice engine + waiver workflow
    ├── payments/           # Payment recording, refunds, receipts
    ├── reports/            # All finance reports & analytics
    └── notifications/      # Email engine + notification logs
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Installation

```bash
# Clone and install
cd school-fee-management
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database credentials and secrets

# Run migrations
npm run migration:run

# Seed the database (creates super admin + sample data)
npm run seed

# Start development server
npm run start:dev
```

### Access Points
| Service | URL |
|---------|-----|
| API Base | `http://localhost:3000/api/v1` |
| Swagger Docs | `http://localhost:3000/api/docs` |

### Default Credentials (after seed)
| Role | Email | Password |
|------|-------|----------|
| Super Admin | superadmin@school.edu | Admin@123456 |
| Finance | finance@school.edu | Finance@123 |
| Admission | admission@school.edu | Admission@123 |

---

## 📡 API Overview

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/login` | Login → get access + refresh token |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | Invalidate refresh token |
| POST | `/api/v1/auth/forgot-password` | Request reset email |
| POST | `/api/v1/auth/reset-password` | Reset with token |
| GET | `/api/v1/auth/me` | Get own profile |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/users` | Create user (any role) |
| GET | `/api/v1/users` | List users (filter by role) |
| GET | `/api/v1/users/:id` | Get user by ID |
| PUT | `/api/v1/users/:id` | Update user |
| PATCH | `/api/v1/users/:id/status` | Activate/suspend user |
| PATCH | `/api/v1/users/:id/reset-password` | Admin reset password |
| DELETE | `/api/v1/users/:id` | Soft delete user |

### Academic Years
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/academic-years` | Create academic year |
| GET | `/api/v1/academic-years` | List all years |
| GET | `/api/v1/academic-years/current` | Get current year |
| PATCH | `/api/v1/academic-years/:id/set-current` | Set as current |
| PUT | `/api/v1/academic-years/:id` | Update year & targets |

### Students
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/students` | Enroll student (creates user account) |
| GET | `/api/v1/students` | List with filters |
| GET | `/api/v1/students/defaulters` | Students with outstanding dues |
| GET | `/api/v1/students/:id` | Student profile |
| GET | `/api/v1/students/:id/siblings` | Find siblings |
| PATCH | `/api/v1/students/:id/assign-class` | Assign to class |
| PATCH | `/api/v1/students/:id/toggle-active` | Activate/deactivate |

### Fee Structures
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/fee-structures` | Create fee structure |
| GET | `/api/v1/fee-structures` | List (filter by year/class) |
| POST | `/api/v1/fee-structures/copy` | Copy year's structures to new year |
| POST | `/api/v1/fee-structures/discounts` | Create discount rule |
| GET | `/api/v1/fee-structures/discounts/all` | List discounts |
| PATCH | `/api/v1/fee-structures/discounts/:id/approve` | Approve discount |

### Invoices
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/fee-invoices/generate` | Generate for one student |
| POST | `/api/v1/fee-invoices/bulk-generate` | Bulk generate for class |
| GET | `/api/v1/fee-invoices` | List invoices with filters |
| GET | `/api/v1/fee-invoices/student/:id/ledger` | Student fee ledger |
| PATCH | `/api/v1/fee-invoices/:id/cancel` | Cancel invoice |
| POST | `/api/v1/fee-invoices/waivers` | Request waiver |
| PATCH | `/api/v1/fee-invoices/waivers/:id/review` | Approve/reject waiver |

### Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/payments` | Record payment |
| GET | `/api/v1/payments` | List payments |
| GET | `/api/v1/payments/daily-summary` | Daily collection summary |
| GET | `/api/v1/payments/receipt/:no` | Find by receipt number |
| PATCH | `/api/v1/payments/:id/refund` | Refund payment |
| PATCH | `/api/v1/payments/:id/verify` | Verify cheque/transfer |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/reports/dashboard` | Finance dashboard |
| GET | `/api/v1/reports/target-vs-actual` | Target vs actual |
| GET | `/api/v1/reports/defaulters` | Defaulter list |
| GET | `/api/v1/reports/class-wise` | Class-wise summary |
| GET | `/api/v1/reports/monthly-summary` | Month-by-month |
| GET | `/api/v1/reports/outstanding` | Outstanding dues |
| GET | `/api/v1/reports/fee-collection` | Collection report |
| GET | `/api/v1/reports/payment-methods` | Payment method breakdown |
| GET | `/api/v1/reports/discount-summary` | Discounts given |
| GET | `/api/v1/reports/student-statement/:id` | Student statement |

---

## 🔑 Role-Based Access

```
Super Admin  → Everything
Finance      → Fee structures, invoices, payments, all reports, waiver review
Admission    → Student enrollment, class management
Teacher      → Read-only (students, classes, invoices)
Student      → Own profile, own invoices, own payment history
```

---

## 💰 Fee Workflow

```
1. Finance creates Academic Year
      ↓ sets monthly/quarterly revenue targets
2. Finance creates Fee Structures
      ↓ tuition, exam, library, transport, etc. per class or school-wide
3. Finance creates Discount Rules
      ↓ sibling/merit/staff discounts for specific students
4. Admission enrolls Student
      ↓ creates user account + student profile
5. Finance generates Invoices (single or bulk)
      ↓ system auto-applies discounts, calculates total
6. Parent/Student receives email notification
7. Finance records Payment
      ↓ invoice status updates (issued → partially_paid → paid)
8. If overdue: cron job marks invoice OVERDUE, sends email
9. Finance can apply Waiver → Finance Head approves
10. Finance views Reports: target vs actual, defaulters, class-wise
```

---

## 📊 Reports & Analytics

### Dashboard KPIs
- Total enrolled students
- Total fee invoiced this year
- Total collected
- Outstanding balance
- Overdue amount
- Collection rate %
- Monthly collection trend chart
- Class-wise collection chart
- Payment method distribution

### Target vs Actual
- Annual target set per academic year
- Monthly targets (configurable per month)
- Quarterly targets (Q1–Q4)
- Shows shortfall/surplus per period
- Achievement rate per month/quarter/year

### Defaulter Identification
- All students with any outstanding balance
- Total amount owed per student
- Number of pending invoices
- Oldest due date
- Filterable by class, academic year

---

## ⚙️ Automated Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Mark Overdue | Daily at midnight | Marks invoices with past due_date as OVERDUE |
| Payment Reminder | Daily at 9am | Emails students with invoices due within 3 days |

---

## 🌍 Environment Variables

See `.env.example` for full list. Key variables:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_NAME=school_fee_management

JWT_SECRET=your_super_secret_key
JWT_EXPIRES_IN=7d

MAIL_HOST=smtp.gmail.com
MAIL_USER=your@email.com
MAIL_PASSWORD=app_password

LATE_FEE_PERCENTAGE=2        # default 2% per billing cycle
GRACE_PERIOD_DAYS=7          # days after due date before late fee applies
```

---

## 🗄 Database Schema

10 tables with full relational integrity:

```
users
  └─< students (one user → one student profile)
academic_years
  └─< classes
  └─< fee_structures
students
  ├─> classes
  ├─> academic_years
  └─< fee_invoices
       ├─> students
       ├─> academic_years
       ├─< payments
       └─< fee_waivers
discounts
  ├─> students (student-specific)
  └─> fee_structures (fee-specific)
notification_logs
  └─> users
```

All tables include:
- UUID primary key
- `created_at`, `updated_at` timestamps
- `deleted_at` for soft deletes
- Indexed foreign keys for query performance
