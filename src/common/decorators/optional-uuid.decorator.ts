import { applyDecorators } from "@nestjs/common";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsOptional, IsUUID } from "class-validator";

export function OptionalUUID(description?: string) {
  return applyDecorators(
    ApiPropertyOptional({ description }),
    Transform(({ value }) => (value === '' || value === null ? undefined : value)),
    IsOptional(),
    IsUUID(),
  );
}