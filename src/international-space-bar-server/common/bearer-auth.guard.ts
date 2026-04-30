import { timingSafeEqual } from "node:crypto";
import {
    type CanActivate,
    type ExecutionContext,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { API_KEY_ENV_VAR, BEARER_PREFIX } from "../constants.js";

@Injectable()
export class BearerAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const apiKey = process.env[API_KEY_ENV_VAR];
        if (!apiKey) {
            throw new UnauthorizedException();
        }

        const request = context.switchToHttp().getRequest<Request>();
        const authorization = request.headers.authorization;

        if (!authorization?.startsWith(BEARER_PREFIX)) {
            throw new UnauthorizedException();
        }

        const token = authorization.slice(BEARER_PREFIX.length);

        if (!this.isTokenValid(token, apiKey)) {
            throw new UnauthorizedException();
        }

        return true;
    }

    private isTokenValid(token: string, expected: string): boolean {
        const tokenBuffer = Buffer.from(token);
        const expectedBuffer = Buffer.from(expected);

        if (tokenBuffer.length !== expectedBuffer.length) {
            return false;
        }

        return timingSafeEqual(tokenBuffer, expectedBuffer);
    }
}
