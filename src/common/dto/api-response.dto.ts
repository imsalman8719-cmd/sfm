export class ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: any;
  timestamp: string;

  constructor(partial: Partial<ApiResponse<T>>) {
    Object.assign(this, partial);
    this.timestamp = new Date().toISOString();
  }

  static success<T>(data: T, message = 'Success'): ApiResponse<T> {
    return new ApiResponse({ success: true, message, data });
  }

  static error(message: string, errors?: any): ApiResponse<null> {
    return new ApiResponse({ success: false, message, errors, data: null });
  }
}
