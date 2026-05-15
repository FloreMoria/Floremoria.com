declare module 'swagger-ui-react' {
    import type { FC } from 'react';

    export interface SwaggerUIProps {
        spec?: object;
        url?: string;
        deepLinking?: boolean;
        docExpansion?: 'list' | 'full' | 'none';
        [key: string]: unknown;
    }

    const SwaggerUI: FC<SwaggerUIProps>;
    export default SwaggerUI;
}
