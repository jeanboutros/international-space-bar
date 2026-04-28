import { BadRequestException, Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";

@Injectable()
export class ZodValidationPipe implements PipeTransform {
    private readonly schema: ZodSchema;

    constructor(schema: ZodSchema) {
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
