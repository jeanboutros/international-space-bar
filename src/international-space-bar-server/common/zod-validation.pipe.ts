import { BadRequestException, Injectable, type PipeTransform } from "@nestjs/common";
import type { z } from "zod";

@Injectable()
export class ZodValidationPipe implements PipeTransform {
    private readonly schema: z.ZodType;

    constructor(schema: z.ZodType) {
        this.schema = schema;
    }

    transform(value: unknown) {
        const result = this.schema.safeParse(value);
        if (!result.success) {
            throw new BadRequestException({
                error: {
                    type: "invalid_request_error",
                    message: result.error.message,
                },
            });
        }
        return result.data;
    }
}
