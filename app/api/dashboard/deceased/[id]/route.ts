import {
    deceasedDeleteById,
    deceasedGetById,
    deceasedPatchById,
    deceasedPostById,
    deceasedPutById,
} from '@/lib/deceased/deceasedApiRouteHandlers';

export const GET = deceasedGetById;
export const PUT = deceasedPutById;
export const PATCH = deceasedPatchById;
export const DELETE = deceasedDeleteById;
export const POST = deceasedPostById;
