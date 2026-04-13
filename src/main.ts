import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor, Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log', 'debug'] });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3000);
  const nodeEnv = configService.get<string>('app.nodeEnv', 'development');

  // ── Security ──────────────────────────────────────────────────────────────
  app.use(helmet());
  app.enableCors({
    origin: configService.get<string>('app.frontendUrl', '*'),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // ── API Versioning ────────────────────────────────────────────────────────
  app.enableVersioning({ type: VersioningType.URI });
  app.setGlobalPrefix('api/v1');

  // ── Pipes & Interceptors ──────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  // ── Swagger / OpenAPI ─────────────────────────────────────────────────────
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('School Fee Management System')
      .setDescription(
        `
## Overview
A comprehensive API for managing school fees, invoices, payments, and financial reports.

## Roles
| Role | Access |
|------|--------|
| **super_admin** | Full access – manage all users, fees, reports |
| **finance** | Fee structures, invoices, payments, full reports |
| **admission** | Student enrollment, class assignment |
| **teacher** | Read-only access to class & student info |
| **student** | View own invoices & payment history |

## Key Flows
1. Create **Academic Year** → set revenue targets
2. Create **Classes** & assign class teacher
3. Define **Fee Structures** (per class or school-wide)
4. **Enroll Students** (admission dept)
5. **Generate Invoices** – single or bulk by class/month/quarter
6. **Record Payments** → auto-updates invoice status
7. View **Reports** – target vs actual, defaulters, class-wise, student ledger

## Automated Jobs
- Daily midnight: marks overdue invoices
- Daily 9am: sends payment reminders (3-day advance)
      `,
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('Auth', 'Authentication & profile')
      .addTag('Users', 'User management (Super Admin)')
      .addTag('Academic Years', 'Academic year configuration & targets')
      .addTag('Classes', 'Class / section management')
      .addTag('Students', 'Student enrollment & profiles')
      .addTag('Fee Structures', 'Fee categories, amounts & discount rules')
      .addTag('Fee Invoices', 'Invoice generation, waivers, cancellations')
      .addTag('Payments', 'Payment recording, receipts & refunds')
      .addTag('Reports & Analytics', 'Financial reports for the finance department')
      .addTag('Notifications', 'Email notification logs')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'method',
      },
    });

    logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  }

  await app.listen(port);
  logger.log(`🚀 Application running on http://localhost:${port}/api/v1`);
  logger.log(`🌍 Environment: ${nodeEnv}`);
}

bootstrap();
