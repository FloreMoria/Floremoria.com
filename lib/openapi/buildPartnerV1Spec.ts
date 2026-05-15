import swaggerJSDoc from 'swagger-jsdoc';
import type { OAS3Definition } from 'swagger-jsdoc';
import definition from './partner-v1.openapi.json';

/** Costruisce il documento OpenAPI 3 (swagger-jsdoc con `apis: []` = nessun merge da commenti; estendibile in seguito). */
export function buildPartnerV1OpenApiSpec(): object {
    return swaggerJSDoc({
        definition: definition as OAS3Definition,
        apis: [],
    });
}
