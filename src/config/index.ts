import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  name: process.env.APP_NAME || 'School Fee Management System',
  url: process.env.APP_URL || 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4200',
}));

export const dbConfig = registerAs('database', () => ({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  name: process.env.DB_NAME || 'school_fee_management',
  sync: process.env.DB_SYNC === 'true',
  logging: process.env.DB_LOGGING === 'true',
}));

export const jwtConfig = registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET || 'default_secret_change_in_production',
  expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'default_refresh_secret',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
}));

export const mailConfig = registerAs('mail', () => ({
  host: process.env.MAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.MAIL_PORT, 10) || 587,
  user: process.env.MAIL_USER,
  password: process.env.MAIL_PASSWORD,
  from: process.env.MAIL_FROM || '"School" <noreply@school.edu>',
}));

export const feeConfig = registerAs('fee', () => ({
  lateFeePercentage: parseFloat(process.env.LATE_FEE_PERCENTAGE) || 2,
  gracePeriodDays: parseInt(process.env.GRACE_PERIOD_DAYS, 10) || 7,
}));
