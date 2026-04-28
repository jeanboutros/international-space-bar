import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
    @Get()
    check() {
        return { status: "ok", service: "international-space-bar", version: "0.1.0" };
    }
}
