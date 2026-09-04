/**
 * OpenAPI 3.1 description of the IIGL API.
 *
 * Kept as one module rather than JSDoc comments scattered through the route
 * files, so the contract can be read end to end and diffed in one place.
 */
import { extraPaths, extraTags } from './openapi.extra.js';
const errorResponse = (description) => ({
    description,
    content: {
        'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
        },
    },
});
/** Responses every authenticated endpoint can return. */
const guarded = {
    401: errorResponse('No session, or the session has expired.'),
    403: errorResponse('The record belongs to another laboratory, or the role lacks access.'),
};
const pageParams = [
    {
        name: 'page',
        in: 'query',
        schema: { type: 'integer', minimum: 1, default: 1 },
        description: 'Page number, starting at 1.',
    },
    {
        name: 'per_page',
        in: 'query',
        schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
        description: 'Rows per page. Capped at 200.',
    },
];
/** Wraps a schema in the `{ data }` envelope every endpoint returns. */
const dataOf = (schema) => ({
    type: 'object',
    properties: { data: schema },
    required: ['data'],
});
const pagedOf = (itemRef) => ({
    type: 'object',
    properties: {
        data: { type: 'array', items: { $ref: itemRef } },
        meta: { $ref: '#/components/schemas/PageMeta' },
    },
    required: ['data', 'meta'],
});
const document = {
    openapi: '3.1.0',
    info: {
        title: 'IIGL API',
        version: '1.0.0',
        license: { name: 'Proprietary', identifier: 'LicenseRef-IIGL-Internal' },
        description: [
            'JSON API for the IIGL gemstone certification portal, replacing the Laravel 7 backend.',
            '',
            '**Authentication.** Sign in at `POST /api/auth/login` with a mobile number and password.',
            'The response sets an httpOnly session cookie named `iigl.sid`; send it with every',
            'subsequent request. Passwords are the existing Laravel bcrypt hashes, so credentials',
            'carried over unchanged from the PHP application.',
            '',
            '**Access model.** Everything under `/api` requires a session except the routes tagged',
            '*Public*. Each session carries a `labId`: a laboratory is its own lab, staff inherit',
            'theirs from the employements table. Records are filtered to that lab, and requesting',
            'another lab’s record by id returns 403 rather than the row.',
            '',
            '**Roles.** 1 administrator, 2 laboratory, 3 lab employee, 4 manager, 5 office boy.',
            'Staff endpoints admit any role above 2 — roles 4 and 5 are in active use.',
        ].join('\n'),
    },
    servers: [
        { url: 'http://localhost:3000', description: 'Local development' },
    ],
    tags: [
        { name: 'Auth', description: 'Sign in, sign out, and the current session.' },
        { name: 'Public', description: 'Open endpoints: the marketing site and certificate verification.' },
        { name: 'Catalog', description: 'Categories, subcategories, attributes and their values.' },
        { name: 'Orders', description: 'Customer orders and the items on them.' },
        { name: 'Reports', description: 'Certificates issued against order items.' },
        { name: 'Transactions', description: 'Remittances, approvals, dues collection and wallet balance.' },
        { name: 'Users', description: 'Laboratories, staff and account administration.' },
        { name: 'Dashboard', description: 'Aggregate counts and totals.' },
        { name: 'Cards', description: 'Printed certificates: smart cards and classic reports.' },
        { name: 'Coupons', description: 'Discount coupons against course fees: the codes, and the enrolments each one was spent on.' },
    ],
    components: {
        securitySchemes: {
            cookieAuth: {
                type: 'apiKey',
                in: 'cookie',
                name: 'iigl.sid',
                description: 'Session cookie issued by `POST /api/auth/login`.',
            },
        },
        schemas: {
            Error: {
                type: 'object',
                properties: {
                    error: {
                        type: 'string',
                        description: 'Machine-readable code.',
                        examples: ['bad_request', 'unauthorized', 'forbidden', 'not_found', 'conflict'],
                    },
                    message: { type: 'string', description: 'Sentence suitable for showing to the user.' },
                },
                required: ['error', 'message'],
            },
            PageMeta: {
                type: 'object',
                properties: {
                    page: { type: 'integer', examples: [1] },
                    per_page: { type: 'integer', examples: [50] },
                    total: { type: 'integer', examples: [9608] },
                    total_pages: { type: 'integer', examples: [193] },
                },
            },
            SessionUser: {
                type: 'object',
                description: 'The signed-in user as held in the session.',
                properties: {
                    id: { type: 'integer', examples: [12] },
                    fullname: { type: 'string', examples: ['IIGL-BHUBANESWAR'] },
                    roleId: { type: 'integer', examples: [2], description: '1 admin, 2 laboratory, 3+ staff.' },
                    labId: {
                        type: ['integer', 'null'],
                        examples: [12],
                        description: 'Laboratory this user acts for. Null if staff are not linked to one.',
                    },
                },
            },
            User: {
                type: 'object',
                description: 'Account record. Never includes the password or remember token.',
                properties: {
                    id: { type: 'integer' },
                    empid: { type: ['string', 'null'] },
                    fullname: { type: 'string' },
                    owner_name: { type: ['string', 'null'] },
                    mobile: { type: 'string' },
                    email: { type: ['string', 'null'] },
                    city: { type: ['string', 'null'] },
                    state: { type: ['string', 'null'] },
                    gst_no: { type: ['string', 'null'] },
                    bank_name: { type: ['string', 'null'] },
                    ifsc_code: { type: ['string', 'null'] },
                    account_no: { type: ['string', 'null'] },
                    // Laravel's spelling, which is what the columns are called.
                    adhar_no: { type: ['string', 'null'] },
                    adhar_photo: { type: ['string', 'null'] },
                    pan_no: { type: ['string', 'null'] },
                    pan_photo: { type: ['string', 'null'] },
                    commision: { type: ['number', 'null'] },
                    is_active: { type: 'integer', examples: [1] },
                    role_id: { type: 'integer' },
                },
            },
            Category: {
                type: 'object',
                properties: {
                    id: { type: 'integer', examples: [2] },
                    name: { type: 'string', examples: ['GEMSTONE'] },
                    description: { type: ['string', 'null'] },
                    short_description: { type: ['string', 'null'] },
                    banner: { type: ['string', 'null'] },
                    icon: { type: ['string', 'null'] },
                },
            },
            Subcategory: {
                type: 'object',
                properties: {
                    id: { type: 'integer', examples: [2] },
                    name: { type: 'string', examples: ['SAPPHIRE'] },
                    category_id: { type: 'integer', examples: [2] },
                },
            },
            Attribute: {
                type: 'object',
                description: 'A field on the certificate form for a subcategory.',
                properties: {
                    id: { type: 'integer', examples: [11] },
                    attr_name: { type: 'string', examples: ['COLOR'] },
                    category_id: { type: 'integer' },
                    subcategory_id: { type: 'integer' },
                    show_in_smart_card: { type: 'integer', examples: [1] },
                    show_in_classic_card: { type: 'integer', examples: [1] },
                    show_description: { type: 'integer' },
                    show_image: { type: 'integer' },
                    is_opensource: {
                        type: 'integer',
                        description: 'When 1, a value outside the list is accepted and stored as a new attribute value.',
                    },
                    is_required: { type: 'integer' },
                    order_no: { type: 'integer', description: 'Display order. MICROSCOPIC is always sorted last.' },
                },
            },
            AttributeValue: {
                type: 'object',
                properties: {
                    id: { type: 'integer', examples: [18] },
                    value_name: { type: 'string', examples: ['White'] },
                    attr_id: { type: 'integer', examples: [11] },
                    description: { type: ['string', 'null'] },
                    icon: { type: ['string', 'null'] },
                },
            },
            OrderItem: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    order_id: { type: 'integer' },
                    category_id: { type: 'integer' },
                    qty: { type: 'integer', examples: [2], description: 'Caps how many certificates this line accepts.' },
                    smart_card: { type: 'integer', examples: [1] },
                    classic_card: { type: 'integer', examples: [0] },
                },
            },
            Order: {
                type: 'object',
                properties: {
                    id: { type: 'integer', examples: [9612] },
                    order_no: {
                        type: 'string',
                        examples: ['202608-942258'],
                        description: 'YYYYMM followed by six random digits.',
                    },
                    customer_name: { type: 'string' },
                    mobile: { type: 'string' },
                    alt_mobile: { type: ['string', 'null'] },
                    email: { type: ['string', 'null'] },
                    gst: { type: ['string', 'null'] },
                    address: { type: ['string', 'null'] },
                    lab_id: { type: 'integer' },
                    order_date: { type: 'string', examples: ['27-08-2026'], description: 'Stored as dd-mm-yyyy text.' },
                    status: { type: 'string', examples: ['preparing'], enum: ['preparing', 'not assigned', 'delivered'] },
                    received_by: { type: 'integer' },
                    assigned_to: { type: ['integer', 'null'] },
                    total_amount: { type: ['string', 'null'] },
                    paid_amount: { type: ['string', 'null'] },
                    dues_amount: { type: ['string', 'null'] },
                    dues_date: { type: ['string', 'null'] },
                },
            },
            OrderDetail: {
                allOf: [
                    { $ref: '#/components/schemas/Order' },
                    {
                        type: 'object',
                        properties: {
                            items: { type: 'array', items: { $ref: '#/components/schemas/OrderItem' } },
                            reports: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'integer' },
                                        report_no: { type: 'string' },
                                        order_detail_id: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                ],
            },
            CreateOrder: {
                type: 'object',
                required: ['customer_name', 'mobile', 'items'],
                properties: {
                    customer_name: { type: 'string', examples: ['Ramesh Gupta'] },
                    mobile: { type: 'string', examples: ['9800000000'] },
                    alt_mobile: { type: ['string', 'null'] },
                    email: { type: ['string', 'null'] },
                    gst: { type: ['string', 'null'] },
                    address: { type: ['string', 'null'] },
                    dues_date: { type: ['string', 'null'] },
                    assigned_to: { type: ['integer', 'null'], description: 'Staff member to assign the work to.' },
                    show_name_in_card: { type: 'integer', enum: [0, 1] },
                    show_image_in_card: { type: 'integer', enum: [0, 1] },
                    show_name_input: { type: ['string', 'null'] },
                    items: {
                        type: 'array',
                        minItems: 1,
                        items: {
                            type: 'object',
                            required: ['category_id', 'qty'],
                            properties: {
                                category_id: { type: 'integer', examples: [2] },
                                qty: { type: 'integer', minimum: 1, examples: [2] },
                                smart_card: { type: 'boolean', examples: [true] },
                                classic_card: { type: 'boolean', examples: [false] },
                            },
                        },
                        description: 'Each item needs a smart card, a classic card, or both.',
                    },
                },
            },
            ReportAttribute: {
                type: 'object',
                description: 'One expanded row of the JSON blob held in reports.description.',
                properties: {
                    attr_id: { type: 'integer', examples: [11] },
                    attr_name: { type: ['string', 'null'], examples: ['COLOR'] },
                    value: { type: ['string', 'null'], examples: ['White'], description: 'Resolved through attribute_values when the stored value is an id.' },
                    value_icon: { type: ['string', 'null'] },
                    description: { type: ['string', 'null'] },
                    image: { type: ['string', 'null'] },
                    show_in_smart_card: { type: 'integer' },
                    show_in_classic_card: { type: 'integer' },
                    order_no: { type: 'integer' },
                },
            },
            Report: {
                type: 'object',
                properties: {
                    id: { type: 'integer', examples: [22132] },
                    report_no: {
                        type: 'string',
                        examples: ['122600012608'],
                        description: 'Lab id (2), day (2), running daily count (4), yymm (4).',
                    },
                    order_no: { type: 'string' },
                    order_detail_id: { type: 'string' },
                    subcategory_id: { type: 'string' },
                    gross_weight: { type: 'string' },
                    gross_wt_unit: { type: ['integer', 'null'] },
                    carat_weight: { type: 'string' },
                    stone_wt_unit: { type: ['integer', 'null'] },
                    size: { type: ['string', 'null'] },
                    item_image: { type: 'string' },
                    comments: { type: ['string', 'null'] },
                    is_approx: { type: 'integer' },
                    lab_id: { type: 'integer' },
                    user_id: { type: 'integer' },
                    attributes: { type: 'array', items: { $ref: '#/components/schemas/ReportAttribute' } },
                },
            },
            CreateReport: {
                type: 'object',
                required: ['order_id', 'order_detail_id', 'subcategory_id'],
                properties: {
                    order_id: {
                        type: 'integer',
                        examples: [9612],
                        description: 'The order primary key. Stored in the misnamed reports.order_no column, which holds the order id rather than the order number.',
                    },
                    order_detail_id: { type: 'integer', examples: [9691] },
                    subcategory_id: { type: 'integer', examples: [2] },
                    gross_weight: { type: ['string', 'null'], examples: ['5.10'] },
                    gross_wt_unit: { type: ['integer', 'null'] },
                    carat_weight: { type: ['string', 'null'], examples: ['4.85'] },
                    stone_wt_unit: { type: ['integer', 'null'] },
                    size: { type: ['string', 'null'] },
                    comments: { type: ['string', 'null'] },
                    is_approx: { type: 'integer', enum: [0, 1] },
                    item_image: { type: ['string', 'null'] },
                    attributes: {
                        type: 'array',
                        description: 'Form values for the subcategory. For an attribute with is_opensource set, a value not already in attribute_values creates a new row and the report stores its id.',
                        items: {
                            type: 'object',
                            required: ['attr_id'],
                            properties: {
                                attr_id: { type: 'string', examples: ['11'] },
                                attr_value: { type: ['string', 'null'], examples: ['18'] },
                                attr_desc: { type: ['string', 'null'] },
                                attr_img: { type: 'string' },
                            },
                        },
                    },
                },
            },
            Certificate: {
                type: 'object',
                description: 'What appears on the printed card. Never includes the customer or the order.',
                properties: {
                    id: { type: 'integer' },
                    report_no: { type: 'string', examples: ['122600012608'] },
                    subcategory: { type: ['string', 'null'], examples: ['SAPPHIRE'] },
                    gross_weight: { type: 'string' },
                    carat_weight: { type: 'string' },
                    size: { type: ['string', 'null'] },
                    item_image: { type: 'string' },
                    comments: { type: ['string', 'null'] },
                    created_at: { type: ['string', 'null'] },
                    attributes: { type: 'array', items: { $ref: '#/components/schemas/ReportAttribute' } },
                },
            },
            Quote: {
                type: 'object',
                description: 'An order priced from the weight bands. Computed on demand — orders carry no price snapshot, so a quote reflects the rates in force today.',
                properties: {
                    order_id: { type: 'integer' },
                    order_no: { type: 'string' },
                    certificates: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                report_id: { type: 'integer' },
                                report_no: { type: 'string' },
                                carat_weight: { type: 'string' },
                                category_id: { type: 'integer' },
                                price_id: { type: ['integer', 'null'] },
                                price_source: {
                                    type: 'string',
                                    enum: ['laboratory', 'standard', 'unpriced'],
                                    description: 'Which band priced it: the ordering laboratory’s own, the standard table, or none matched.',
                                },
                                smart_price: { type: 'number' },
                                classic_price: { type: 'number' },
                                line_total: { type: 'number' },
                            },
                        },
                    },
                    smart_card_total: { type: 'number' },
                    classic_card_total: { type: 'number' },
                    total_amount: { type: 'number', description: 'Sum before discount.' },
                    discount: { type: 'number' },
                    payable_amount: { type: 'number', description: 'Total minus discount.' },
                    amount_with_gst: {
                        type: 'integer',
                        description: 'Payable plus 18% GST, truncated rather than rounded, matching the original calculation.',
                    },
                    unpriced_count: {
                        type: 'integer',
                        description: 'Certificates whose carat weight fell outside every band. Non-zero means the price table has a gap.',
                    },
                },
            },
            Transaction: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    amount: { type: 'string', examples: ['5000'] },
                    send_by: { type: 'integer', description: '0 for a dues collection from a walk-in customer.' },
                    received_by: { type: 'integer' },
                    order_id: { type: ['integer', 'null'] },
                    status: { type: 'integer', enum: [0, 1, 2], description: '0 pending, 1 approved, 2 declined.' },
                    transaction_type: { type: ['string', 'null'], examples: ['collected_by_order'] },
                    comission_on: { type: ['number', 'null'] },
                    pay_mode: { type: 'string', examples: ['cash'] },
                    transaction_no: { type: ['string', 'null'] },
                    remark: { type: ['string', 'null'] },
                    attachment: { type: ['string', 'null'] },
                },
            },
            CardData: {
                type: 'object',
                description: 'Everything printed on a certificate, before rendering.',
                properties: {
                    report_id: { type: 'integer' },
                    report_no: { type: 'string', examples: ['042400012608'] },
                    subcategory: { type: ['string', 'null'], examples: ['JEWELLERY'] },
                    gross_weight: { type: 'string' },
                    gross_wt_unit: { type: ['string', 'null'], examples: ['g'] },
                    carat_weight: { type: 'string' },
                    stone_wt_unit: { type: ['string', 'null'] },
                    size: { type: ['string', 'null'] },
                    comments: { type: ['string', 'null'] },
                    is_approx: { type: 'boolean' },
                    issued_on: { type: 'string', examples: ['2026-08-24'] },
                    verify_url: { type: 'string', examples: ['https://www.iigl.org/verify-report/22122'] },
                    qr: { type: 'string', description: 'PNG data URI of the verification QR code.' },
                    has_item_image: { type: 'boolean' },
                    has_signature: { type: 'boolean' },
                    smart_attributes: {
                        type: 'array',
                        items: { type: 'object', properties: { name: { type: 'string' }, value: { type: 'string' } } },
                    },
                    classic_attributes: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                value: { type: 'string' },
                                description: { type: ['string', 'null'] },
                            },
                        },
                    },
                },
            },
            Ledger: {
                type: 'object',
                description: 'Running account for one user. Only approved transactions move the balance; pending and declined entries appear so the history is complete.',
                properties: {
                    entries: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'integer' },
                                date: { type: ['string', 'null'] },
                                type: { type: ['string', 'null'], examples: ['collected_by_order'] },
                                direction: { type: 'string', enum: ['credit', 'debit'] },
                                amount: { type: 'number' },
                                status: { type: 'integer', enum: [0, 1, 2] },
                                counterparty: { type: 'integer', description: 'The other party: sender for a credit, receiver for a debit.' },
                                order_id: { type: ['integer', 'null'] },
                                pay_mode: { type: 'string' },
                                transaction_no: { type: ['string', 'null'] },
                                remark: { type: ['string', 'null'] },
                                balance: { type: 'number', description: 'Balance after this entry.' },
                            },
                        },
                    },
                    credit_total: { type: 'number' },
                    debit_total: { type: 'number' },
                    balance: { type: 'number' },
                    pending_out: { type: 'number', description: 'Sent but not yet approved.' },
                    pending_in: { type: 'number', description: 'Received but not yet approved.' },
                },
            },
            Wallet: {
                type: 'object',
                properties: {
                    received: { type: 'number', description: 'Sum of approved inbound transactions.' },
                    sent: { type: 'number', description: 'Sum of approved outbound transactions.' },
                    balance: { type: 'number', description: 'received minus sent.' },
                },
            },
            DashboardSummary: {
                type: 'object',
                properties: {
                    orders: {
                        type: 'object',
                        properties: {
                            total: { type: 'integer' },
                            active: { type: 'integer', description: 'Status "preparing".' },
                            delivered: { type: 'integer' },
                            today: { type: 'integer' },
                            active_today: {
                                type: 'integer',
                                description: 'Ordered today and still preparing.',
                            },
                        },
                    },
                    reports: {
                        type: 'object',
                        properties: { total: { type: 'integer' } },
                    },
                    money: {
                        type: 'object',
                        properties: {
                            sale: { type: 'number' },
                            paid: { type: 'number' },
                            dues: { type: 'number' },
                            sale_today: { type: 'number' },
                            paid_today: { type: 'number' },
                            dues_today: { type: 'number' },
                        },
                    },
                    lab: {
                        type: 'object',
                        nullable: true,
                        description: 'The figures the Laravel laboratory dashboard showed. Null for head office, whose dashboard is a different screen with different quantities on it: a laboratory counts cards rather than orders, and its money is its own ledger — what its staff have taken in, what has reached its wallet, and head office\u2019s share of that.',
                        properties: {
                            cards_ordered: { type: 'integer', description: 'Smart and classic together.' },
                            cards_generated: { type: 'integer' },
                            smart_generated: { type: 'integer' },
                            classic_generated: { type: 'integer' },
                            collected: {
                                type: 'number',
                                description: 'Everything this laboratory\u2019s staff have taken in. Carried over from Laravel without a status filter, so a collection nobody has approved counts the same as an approved one.',
                            },
                            employee_wallet: { type: 'number' },
                            my_wallet: { type: 'number' },
                            admin_commission: { type: 'number' },
                            today: {
                                type: 'object',
                                properties: {
                                    cards_ordered: { type: 'integer' },
                                    sale: { type: 'number' },
                                    paid: { type: 'number' },
                                    dues: { type: 'number' },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
    security: [{ cookieAuth: [] }],
    paths: {
        '/health': {
            get: {
                tags: ['Public'],
                summary: 'Liveness probe',
                security: [],
                responses: {
                    200: {
                        description: 'The process is up.',
                        content: {
                            'application/json': {
                                schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
                            },
                        },
                    },
                },
            },
        },
        '/openapi.json': {
            get: {
                tags: ['Public'],
                summary: 'This document',
                description: 'The raw OpenAPI description, for generating clients.',
                security: [],
                responses: {
                    200: {
                        description: 'OpenAPI 3.1 document.',
                        content: { 'application/json': { schema: { type: 'object' } } },
                    },
                },
            },
        },
        '/api/auth/login': {
            post: {
                tags: ['Auth'],
                summary: 'Sign in',
                description: 'Verifies the password against the existing Laravel bcrypt hash and sets the `iigl.sid` session cookie. A missing account and a wrong password return the same response, so the endpoint cannot be used to discover which mobile numbers are registered.',
                security: [],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['mobile', 'password'],
                                properties: {
                                    mobile: { type: 'string', examples: ['9800000000'] },
                                    password: { type: 'string', format: 'password' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: {
                        description: 'Signed in. The session cookie is set.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: { user: { $ref: '#/components/schemas/SessionUser' } },
                                },
                            },
                        },
                    },
                    400: errorResponse('Mobile number or password missing.'),
                    401: errorResponse('Credentials do not match, or the account is deactivated.'),
                },
            },
        },
        '/api/auth/logout': {
            post: {
                tags: ['Auth'],
                summary: 'Sign out',
                security: [],
                responses: { 200: { description: 'Session destroyed.' } },
            },
        },
        '/api/auth/me': {
            get: {
                tags: ['Auth'],
                summary: 'Current session',
                responses: {
                    200: {
                        description: 'The signed-in user.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: { user: { $ref: '#/components/schemas/SessionUser' } },
                                },
                            },
                        },
                    },
                    401: guarded[401],
                },
            },
        },
        '/api/auth/change-password': {
            post: {
                tags: ['Auth'],
                summary: 'Change your own password',
                description: 'Rehashes at bcrypt cost 10, matching the existing rows. `current_password` is **optional**: sent, it is verified and a wrong one is refused; omitted, the session is the authority. That means anybody who reaches an open session can change the password — a deliberate choice for the panel, recorded here rather than left to be discovered.',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['new_password'],
                                properties: {
                                    current_password: {
                                        type: 'string',
                                        format: 'password',
                                        description: 'Optional. Verified when present.',
                                    },
                                    new_password: { type: 'string', format: 'password', minLength: 8 },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: 'Password updated.' },
                    400: errorResponse('No new password, one under 8 characters, or a current password that was sent and is wrong.'),
                    401: guarded[401],
                },
            },
        },
        '/api/auth/forgot-password': {
            post: {
                tags: ['Auth'],
                summary: 'Ask for a password reset link',
                description: 'Public. Takes `identifier`: a **mobile number or an email address**, since people ' +
                    'sign in with their mobile and that is the identifier they are sure of. `email` is ' +
                    'still accepted as the field name. ' +
                    '**Says whether the account exists**, by decision: a 400 for no match, for an ' +
                    'account with no email address, and for one identifier on two active accounts. ' +
                    'That makes the page usable by somebody who mistyped their own number, at the ' +
                    'cost of letting it be used to test which numbers are registered — the rate ' +
                    'limit of 5 an hour is what stands in the way of that. On success the reply names ' +
                    'the destination masked, `rah•••@gmail.com`, so somebody with two mailboxes knows ' +
                    'which to open. The link is valid for one hour and its token is stored hashed in ' +
                    '`password_resets`.',
                security: [],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    identifier: {
                                        type: 'string',
                                        description: 'A mobile number or an email address.',
                                    },
                                    email: { type: 'string', description: 'The older name for `identifier`.' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: 'Accepted, whether or not any mail was sent.' },
                    400: errorResponse('No address given.'),
                    429: errorResponse('Too many reset requests from this address.'),
                },
            },
        },
        '/api/auth/reset-password': {
            post: {
                tags: ['Auth'],
                summary: 'Set a new password using a reset link',
                description: 'Public. Consumes the token from the emailed link: single use, one hour, compared ' +
                    'against the bcrypt hash in `password_resets`. Rehashes at cost 10, matching the ' +
                    'existing rows.',
                security: [],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['email', 'token', 'new_password'],
                                properties: {
                                    email: { type: 'string', format: 'email' },
                                    token: { type: 'string' },
                                    new_password: { type: 'string', format: 'password', minLength: 8 },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: 'Password updated.' },
                    400: errorResponse('Link expired, already used, incomplete, or the password is too short.'),
                    429: errorResponse('Too many reset attempts from this address.'),
                },
            },
        },
        '/api/cards/data/{id}': {
            get: {
                tags: ['Cards'],
                summary: 'Card data without rendering',
                description: 'Everything a card would print, for a preview screen. Image assets are reported as present or absent rather than inlined, because they are large data URIs.',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: {
                        description: 'Card data.',
                        content: { 'application/json': { schema: dataOf({ $ref: '#/components/schemas/CardData' }) } },
                    },
                    404: errorResponse('Certificate not found.'),
                    ...guarded,
                },
            },
        },
        '/api/cards/{kind}/{id}': {
            get: {
                tags: ['Cards'],
                summary: 'Print one certificate',
                description: 'Renders the card in headless Chrome from the same HTML and CSS the Laravel views produced, so the printed layout is unchanged. Add format=html to get the markup instead, which is what to compare against the Laravel output when checking for visual drift.',
                parameters: [
                    { name: 'kind', in: 'path', required: true, schema: { type: 'string', enum: ['smart', 'classic'] } },
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'format', in: 'query', schema: { type: 'string', enum: ['html'] }, description: 'Return HTML rather than PDF.' },
                ],
                responses: {
                    200: {
                        description: 'The certificate as a PDF, or as HTML when format=html.',
                        content: {
                            'application/pdf': { schema: { type: 'string', format: 'binary' } },
                            'text/html': { schema: { type: 'string' } },
                        },
                    },
                    400: errorResponse('Card type must be smart or classic.'),
                    404: errorResponse('Certificate not found.'),
                    ...guarded,
                },
            },
        },
        '/api/cards/{kind}': {
            post: {
                tags: ['Cards'],
                summary: 'Print several certificates as one PDF',
                description: 'For a print run. Certificates appear in the order requested. Capped at 50 per request so one job cannot tie up the renderer.',
                parameters: [
                    { name: 'kind', in: 'path', required: true, schema: { type: 'string', enum: ['smart', 'classic'] } },
                    { name: 'format', in: 'query', schema: { type: 'string', enum: ['html'] } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['report_ids'],
                                properties: {
                                    report_ids: {
                                        type: 'array',
                                        minItems: 1,
                                        maxItems: 50,
                                        items: { type: 'integer' },
                                        examples: [[22122, 22121, 22120]],
                                    },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: {
                        description: 'The certificate as a PDF, or as HTML when format=html.',
                        content: {
                            'application/pdf': { schema: { type: 'string', format: 'binary' } },
                            'text/html': { schema: { type: 'string' } },
                        },
                    },
                    400: errorResponse('No ids, more than 50, or a non-numeric id.'),
                    404: errorResponse('One of the certificates was not found.'),
                    ...guarded,
                },
            },
        },
        '/api/public/verify-by-id/{id}': {
            get: {
                tags: ['Public'],
                summary: 'Verify a certificate by its id',
                description: 'Every certificate printed so far carries a QR pointing at /verify-report/{id}, keyed by the report id rather than the report number. This path keeps those documents verifying after cutover. The response is identical to verifying by number.',
                security: [],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: {
                        description: 'Certificate found.',
                        content: { 'application/json': { schema: dataOf({ $ref: '#/components/schemas/Certificate' }) } },
                    },
                    404: errorResponse('No certificate matches that id.'),
                },
            },
        },
        '/api/public/verify/{reportNo}': {
            get: {
                tags: ['Public'],
                summary: 'Verify a certificate',
                description: 'The endpoint printed QR codes point at. Returns only what is on the card — never the customer or order behind it.',
                security: [],
                parameters: [
                    {
                        name: 'reportNo',
                        in: 'path',
                        required: true,
                        schema: { type: 'string' },
                        examples: { live: { value: '122600012608' } },
                    },
                ],
                responses: {
                    200: {
                        description: 'Certificate found.',
                        content: {
                            'application/json': {
                                schema: dataOf({ $ref: '#/components/schemas/Certificate' }),
                            },
                        },
                    },
                    404: errorResponse('No certificate matches that number.'),
                },
            },
        },
        '/api/public/verify-log': {
            post: {
                tags: ['Public'],
                summary: 'Record a verification lookup',
                security: [],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    fullname: { type: 'string' },
                                    mobile: { type: 'string' },
                                    report_no: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: { 200: { description: 'Logged, or ignored if a field was missing.' } },
            },
        },
        '/api/public/pages/{pageType}': {
            get: {
                tags: ['Public'],
                summary: 'Website page content',
                security: [],
                parameters: [{ name: 'pageType', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Page content.' }, 404: errorResponse('Page not found.') },
            },
        },
        '/api/public/blogs': {
            get: {
                tags: ['Public'],
                summary: 'List articles',
                security: [],
                responses: { 200: { description: 'Articles, newest first.' } },
            },
        },
        '/api/public/blogs/{slug}': {
            get: {
                tags: ['Public'],
                summary: 'Read an article',
                security: [],
                parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Article.' }, 404: errorResponse('Article not found.') },
            },
        },
        '/api/public/branches': {
            get: {
                tags: ['Public'],
                summary: 'List branch city pages',
                security: [],
                responses: { 200: { description: 'Branches.' } },
            },
        },
        '/api/public/branches/{slug}': {
            get: {
                tags: ['Public'],
                summary: 'Read a branch page',
                security: [],
                parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Branch page.' }, 404: errorResponse('Branch page not found.') },
            },
        },
        '/api/public/report-types': {
            get: {
                tags: ['Public'],
                summary: 'List certificate types',
                security: [],
                responses: { 200: { description: 'Report types.' } },
            },
        },
        '/api/public/banners': {
            get: {
                tags: ['Public'],
                summary: 'List active banners',
                security: [],
                parameters: [
                    { name: 'type', in: 'query', schema: { type: 'string' }, description: 'Filter by img_type.' },
                ],
                responses: { 200: { description: 'Banners with status 1.' } },
            },
        },
        '/api/catalog/categories': {
            get: {
                tags: ['Catalog'],
                summary: 'List categories',
                responses: {
                    200: {
                        description: 'Categories, alphabetical.',
                        content: {
                            'application/json': {
                                schema: dataOf({ type: 'array', items: { $ref: '#/components/schemas/Category' } }),
                            },
                        },
                    },
                    ...guarded,
                },
            },
        },
        '/api/catalog/categories/{id}/subcategories': {
            get: {
                tags: ['Catalog'],
                summary: 'Subcategories of a category',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: {
                        description: 'Subcategories.',
                        content: {
                            'application/json': {
                                schema: dataOf({ type: 'array', items: { $ref: '#/components/schemas/Subcategory' } }),
                            },
                        },
                    },
                    ...guarded,
                },
            },
        },
        '/api/catalog/subcategories': {
            get: {
                tags: ['Catalog'],
                summary: 'List all subcategories',
                responses: { 200: { description: 'Subcategories.' }, ...guarded },
            },
        },
        '/api/catalog/subcategories/{id}/attributes': {
            get: {
                tags: ['Catalog'],
                summary: 'Certificate form fields for a subcategory',
                description: 'Ordered by order_no, with MICROSCOPIC forced last — matching the PHP form.',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: {
                        description: 'Attributes.',
                        content: {
                            'application/json': {
                                schema: dataOf({ type: 'array', items: { $ref: '#/components/schemas/Attribute' } }),
                            },
                        },
                    },
                    ...guarded,
                },
            },
        },
        '/api/catalog/categories/{id}/attributes': {
            get: {
                tags: ['Catalog'],
                summary: 'Certificate form fields across a whole category',
                description: 'Same ordering as the per-subcategory list, but spanning every subcategory.',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: {
                        description: 'Attributes.',
                        content: {
                            'application/json': {
                                schema: dataOf({ type: 'array', items: { $ref: '#/components/schemas/Attribute' } }),
                            },
                        },
                    },
                    ...guarded,
                },
            },
        },
        '/api/catalog/attribute-values': {
            get: {
                tags: ['Catalog'],
                summary: 'Attribute values across a branch of the catalogue',
                description: 'Filter by attr_id, subcategory_id or category_id — at least one is required, since one category holds 3,899 values. Paginated, and ?q searches the value name.',
                parameters: [
                    { name: 'attr_id', in: 'query', schema: { type: 'integer' } },
                    { name: 'subcategory_id', in: 'query', schema: { type: 'integer' } },
                    { name: 'category_id', in: 'query', schema: { type: 'integer' } },
                    { name: 'q', in: 'query', schema: { type: 'string' } },
                    { name: 'page', in: 'query', schema: { type: 'integer' } },
                    { name: 'per_page', in: 'query', schema: { type: 'integer' } },
                ],
                responses: {
                    200: { description: 'Attribute values, paginated.' },
                    400: { description: 'No filter given.' },
                    ...guarded,
                },
            },
        },
        '/api/catalog/attributes/{id}/values': {
            get: {
                tags: ['Catalog'],
                summary: 'Allowed values for an attribute',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: {
                        description: 'Values.',
                        content: {
                            'application/json': {
                                schema: dataOf({ type: 'array', items: { $ref: '#/components/schemas/AttributeValue' } }),
                            },
                        },
                    },
                    ...guarded,
                },
            },
        },
        '/api/catalog/units': {
            get: {
                tags: ['Catalog'],
                summary: 'Weight units',
                responses: { 200: { description: 'Units.' }, ...guarded },
            },
        },
        '/api/catalog/report-types': {
            get: {
                tags: ['Catalog'],
                summary: 'Certificate types',
                responses: { 200: { description: 'Report types.' }, ...guarded },
            },
        },
        '/api/catalog/form-layouts/{categoryId}': {
            get: {
                tags: ['Catalog'],
                summary: 'Form layout for a category',
                parameters: [{ name: 'categoryId', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Layout rows, in label order.' },
                    404: errorResponse('No form layout for this category.'),
                    ...guarded,
                },
            },
        },
        '/api/orders': {
            get: {
                tags: ['Orders'],
                summary: 'List orders',
                description: 'Scoped to the caller’s laboratory. Administrators see every lab.\n\nEach row carries four figures the order table itself does not hold, resolved here rather than one query per row as `common/order/index.blade.php` did: `total_items` (`order_details.qty` summed), `total_reports` (what the order is owed — a line carrying both card kinds counts its quantity once for each, so this is not `total_items`), `reports_generated` (how many of those are written, weighted the same way) and `assigned_to_name`, null when the order is with nobody.',
                parameters: [
                    ...pageParams,
                    {
                        name: 'status',
                        in: 'query',
                        schema: { type: 'string', enum: ['preparing', 'not assigned', 'delivered'] },
                    },
                    {
                        name: 'dues',
                        in: 'query',
                        schema: { type: 'string', enum: ['1'] },
                        description: 'Delivered orders still carrying a balance. Laravel gives this its own screen, EmpOrderDuesList.',
                    },
                ],
                responses: {
                    200: {
                        description: 'A page of orders, newest first.',
                        content: { 'application/json': { schema: pagedOf('#/components/schemas/Order') } },
                    },
                    ...guarded,
                },
            },
            post: {
                tags: ['Orders'],
                summary: 'Create an order',
                description: 'Writes the order and its items in one database transaction. The order number is random, so a collision is retried rather than issued twice.',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateOrder' } } },
                },
                responses: {
                    201: {
                        description: 'Created.',
                        content: {
                            'application/json': {
                                schema: dataOf({ type: 'object', properties: { id: { type: 'integer' } } }),
                            },
                        },
                    },
                    400: errorResponse('Missing customer details, no items, or an item without a card type.'),
                    409: errorResponse('Could not allocate an order number after five attempts.'),
                    ...guarded,
                },
            },
        },
        '/api/orders/{id}': {
            patch: {
                tags: ['Orders'],
                summary: 'Amend an order',
                description: 'Updates customer details and, when items are supplied, replaces the item list - entries with an id are updated, entries without one are added, and existing items left out are removed. An item that already has certificates issued against it cannot be removed, and its quantity cannot drop below the number issued. The Laravel version applies neither guard, so reducing a quantity can strand issued certificates.',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    customer_name: { type: 'string' },
                                    mobile: { type: 'string' },
                                    alt_mobile: { type: ['string', 'null'] },
                                    email: { type: ['string', 'null'] },
                                    gst: { type: ['string', 'null'] },
                                    address: { type: ['string', 'null'] },
                                    dues_date: { type: ['string', 'null'] },
                                    show_name_in_card: { type: 'integer', enum: [0, 1] },
                                    show_image_in_card: { type: 'integer', enum: [0, 1] },
                                    items: {
                                        type: 'array',
                                        minItems: 1,
                                        items: {
                                            type: 'object',
                                            required: ['category_id', 'qty'],
                                            properties: {
                                                id: { type: 'integer', description: 'Omit to add a new item.' },
                                                category_id: { type: 'integer' },
                                                qty: { type: 'integer', minimum: 1 },
                                                smart_card: { type: 'boolean' },
                                                classic_card: { type: 'boolean' },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: {
                        description: 'Updated order with its items.',
                        content: { 'application/json': { schema: dataOf({ $ref: '#/components/schemas/OrderDetail' }) } },
                    },
                    400: errorResponse('Nothing to update, or an item is invalid.'),
                    409: errorResponse('An item with issued certificates cannot be removed or shrunk below what was issued.'),
                    404: errorResponse('Order not found.'),
                    ...guarded,
                },
            },
            get: {
                tags: ['Orders'],
                summary: 'Read an order with its items and certificates',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: {
                        description: 'Order detail.',
                        content: {
                            'application/json': {
                                schema: dataOf({ $ref: '#/components/schemas/OrderDetail' }),
                            },
                        },
                    },
                    404: errorResponse('Order not found.'),
                    ...guarded,
                },
            },
        },
        '/api/orders/customer/lookup': {
            get: {
                tags: ['Orders'],
                summary: 'Find a returning customer by mobile',
                description: 'Searches the caller’s own orders only, on both the primary and alternate number.',
                parameters: [
                    { name: 'mobile', in: 'query', required: true, schema: { type: 'string' } },
                ],
                responses: {
                    200: { description: 'The most recent match, or null.' },
                    ...guarded,
                },
            },
        },
        '/api/orders/items/{id}': {
            delete: {
                tags: ['Orders'],
                summary: 'Remove an item from an order',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Removed.' },
                    404: errorResponse('Order item not found.'),
                    ...guarded,
                },
            },
        },
        '/api/orders/{id}/quote': {
            get: {
                tags: ['Orders'],
                summary: 'Price an order',
                description: 'Prices every certificate on the order against the weight bands and returns the breakdown. Changes nothing, so it is safe to call while the operator adjusts the discount.',
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'discount', in: 'query', schema: { type: 'number', minimum: 0 }, description: 'Flat amount off, not a percentage.' },
                ],
                responses: {
                    200: {
                        description: 'The priced order.',
                        content: { 'application/json': { schema: dataOf({ $ref: '#/components/schemas/Quote' }) } },
                    },
                    404: errorResponse('Order not found.'),
                    ...guarded,
                },
            },
        },
        '/api/orders/{id}/deliver': {
            post: {
                tags: ['Orders'],
                summary: 'Settle and deliver an order',
                description: 'Prices the order, writes the totals, records the collection as a transaction and marks the order delivered — all in one database transaction. Totals are computed from the price bands and never taken from the request body; the Laravel screen posts total_amount from the browser, so whatever the client sends becomes the bill.',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    discount: { type: 'number', minimum: 0, default: 0, description: 'Flat amount off, not a percentage.' },
                                    paid_amount: { type: 'number', minimum: 0, description: 'Defaults to the full amount including GST. Any shortfall is recorded as dues.' },
                                    pay_mode: { type: 'string', default: 'cash' },
                                    transaction_no: { type: ['string', 'null'] },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: {
                        description: 'Delivered. Returns the quote plus what was paid and what remains outstanding.',
                        content: { 'application/json': { schema: dataOf({ $ref: '#/components/schemas/Quote' }) } },
                    },
                    400: errorResponse('Discount exceeds the total, or the paid amount exceeds the payable amount.'),
                    404: errorResponse('Order not found.'),
                    ...guarded,
                },
            },
        },
        '/api/reports': {
            get: {
                tags: ['Reports'],
                summary: 'List certificates',
                description: 'Attribute blobs are expanded to names and values in a batch, so a page costs two extra queries rather than two per row.',
                parameters: [
                    ...pageParams,
                    { name: 'order_id', in: 'query', schema: { type: 'integer' }, description: 'Filter to one order, by its id.' },
                ],
                responses: {
                    200: {
                        description: 'A page of certificates.',
                        content: { 'application/json': { schema: pagedOf('#/components/schemas/Report') } },
                    },
                    ...guarded,
                },
            },
            post: {
                tags: ['Reports'],
                summary: 'Issue a certificate',
                description: 'Allocates the next report number for the laboratory and writes the attribute values as a JSON blob. An order item accepts certificates up to its quantity and no more.',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateReport' } } },
                },
                responses: {
                    201: {
                        description: 'Issued.',
                        content: {
                            'application/json': {
                                schema: dataOf({
                                    type: 'object',
                                    properties: {
                                        id: { type: 'integer' },
                                        report_no: { type: 'string', examples: ['242700012608'] },
                                    },
                                }),
                            },
                        },
                    },
                    400: errorResponse('Missing order details, or an unknown attribute id.'),
                    409: errorResponse('Every certificate for this order item has already been issued.'),
                    ...guarded,
                },
            },
        },
        '/api/reports/{id}': {
            patch: {
                tags: ['Reports'],
                summary: 'Amend a certificate',
                description: 'The report number is never reallocated - it is printed on a document already in circulation. Supplying attributes replaces the whole set.',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    subcategory_id: { type: 'integer' },
                                    gross_weight: { type: ['string', 'null'] },
                                    gross_wt_unit: { type: ['integer', 'null'] },
                                    carat_weight: { type: ['string', 'null'] },
                                    stone_wt_unit: { type: ['integer', 'null'] },
                                    size: { type: ['string', 'null'] },
                                    comments: { type: ['string', 'null'] },
                                    is_approx: { type: 'integer', enum: [0, 1] },
                                    item_image: { type: ['string', 'null'] },
                                    attributes: { type: 'array', items: { type: 'object' } },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: {
                        description: 'Updated certificate with expanded attributes.',
                        content: { 'application/json': { schema: dataOf({ $ref: '#/components/schemas/Report' }) } },
                    },
                    400: errorResponse('Nothing to update, or an unknown attribute id.'),
                    404: errorResponse('Report not found.'),
                    ...guarded,
                },
            },
            get: {
                tags: ['Reports'],
                summary: 'Read a certificate',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: {
                        description: 'Certificate with expanded attributes.',
                        content: { 'application/json': { schema: dataOf({ $ref: '#/components/schemas/Report' }) } },
                    },
                    404: errorResponse('Report not found.'),
                    ...guarded,
                },
            },
        },
        '/api/transactions': {
            get: {
                tags: ['Transactions'],
                summary: 'List transactions',
                parameters: [
                    ...pageParams,
                    {
                        name: 'direction',
                        in: 'query',
                        schema: { type: 'string', enum: ['all', 'sent', 'received'], default: 'all' },
                    },
                    {
                        name: 'status',
                        in: 'query',
                        schema: { type: 'integer', enum: [0, 1, 2] },
                        description: '0 pending, 1 approved, 2 declined.',
                    },
                ],
                responses: {
                    200: {
                        description: 'A page of transactions.',
                        content: { 'application/json': { schema: pagedOf('#/components/schemas/Transaction') } },
                    },
                    ...guarded,
                },
            },
            post: {
                tags: ['Transactions'],
                summary: 'Send a remittance',
                description: 'A laboratory remits to the administrator; staff remit to their laboratory. Lands pending until the receiver decides.',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['amount', 'pay_mode'],
                                properties: {
                                    amount: { type: 'number', minimum: 0.01, examples: [5000] },
                                    pay_mode: { type: 'string', examples: ['upi'] },
                                    transaction_no: { type: ['string', 'null'] },
                                    transaction_type: { type: ['string', 'null'] },
                                    remark: { type: ['string', 'null'] },
                                    attachment: { type: ['string', 'null'], description: 'Stored path of an uploaded receipt.' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: { description: 'Recorded as pending.' },
                    400: errorResponse('Amount not above zero, or no payment mode.'),
                    ...guarded,
                },
            },
        },
        '/api/transactions/{id}/status': {
            post: {
                tags: ['Transactions'],
                summary: 'Approve or decline a remittance',
                description: 'Only the receiver, or an administrator, may decide. A decided transaction cannot be changed.',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['status'],
                                properties: {
                                    status: { type: 'integer', enum: [1, 2], description: '1 approve, 2 decline.' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: 'Decision recorded.' },
                    400: errorResponse('Status not 1 or 2, or the transaction was already decided.'),
                    403: errorResponse('Only the receiver can decide this transaction.'),
                    404: errorResponse('Transaction not found.'),
                    401: guarded[401],
                },
            },
        },
        '/api/transactions/dues/{orderId}': {
            post: {
                tags: ['Transactions'],
                summary: 'Collect dues against an order',
                description: 'Writes the transaction and moves the order balance in one database transaction. Refuses a collection larger than the outstanding amount.',
                parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['amount'],
                                properties: {
                                    amount: { type: 'number', minimum: 0.01 },
                                    pay_mode: { type: 'string', default: 'cash' },
                                    transaction_no: { type: ['string', 'null'] },
                                    remark: { type: ['string', 'null'] },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: 'Collected. Paid and dues amounts updated.' },
                    400: errorResponse('Amount not above zero, or larger than the outstanding balance.'),
                    404: errorResponse('Order not found.'),
                    ...guarded,
                },
            },
        },
        '/api/transactions/commission': {
            post: {
                tags: ['Transactions'],
                summary: 'Pay commission to the administrator',
                description: 'Laboratory accounts only. Supply the collected amount the commission is calculated on; the amount owed is derived from the rate held in users.commision for that laboratory, read according to its users.commission_type — a percentage of the base, or a flat amount for each piece, in which case `pieces` is required and the base is recorded as context only. The Laravel version accepts both the base and the amount from the browser, so a laboratory can post whatever commission it likes.',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['commission_on'],
                                properties: {
                                    commission_on: { type: 'number', minimum: 0.01, examples: [100], description: 'The collected amount the commission is calculated on.' },
                                    pieces: { type: 'integer', minimum: 1, examples: [12], description: 'Pieces certified. Required for a laboratory on per-piece terms and ignored for one on a percentage.' },
                                    pay_mode: { type: 'string', default: 'cash' },
                                    transaction_no: { type: ['string', 'null'] },
                                    remark: { type: ['string', 'null'] },
                                    attachment: { type: ['string', 'null'] },
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: {
                        description: 'Recorded as pending, awaiting the administrator.',
                        content: {
                            'application/json': {
                                schema: dataOf({
                                    type: 'object',
                                    properties: {
                                        id: { type: 'integer' },
                                        commission_on: { type: 'number', examples: [100] },
                                        rate: { type: 'number', examples: [10] },
                                        commission_type: { type: 'string', examples: ['percent'] },
                                        amount: { type: 'number', examples: [10] },
                                    },
                                }),
                            },
                        },
                    },
                    400: errorResponse('Not a laboratory account, no rate configured, the base is not above zero, or a per-piece laboratory sent no piece count.'),
                    ...guarded,
                },
            },
        },
        '/api/transactions/ledger': {
            get: {
                tags: ['Transactions'],
                summary: 'Running account',
                description: 'Every transaction touching this user, oldest first, with the balance after each entry.',
                parameters: [
                    {
                        name: 'user_id',
                        in: 'query',
                        schema: { type: 'integer' },
                        description: 'Administrators only: read another user ledger. Ignored for other roles.',
                    },
                ],
                responses: {
                    200: {
                        description: 'Ledger.',
                        content: { 'application/json': { schema: dataOf({ $ref: '#/components/schemas/Ledger' }) } },
                    },
                    ...guarded,
                },
            },
        },
        '/api/transactions/wallet': {
            get: {
                tags: ['Transactions'],
                summary: 'Your balance',
                description: 'Approved inbound minus approved outbound. Pending transactions are excluded.',
                responses: {
                    200: {
                        description: 'Balance.',
                        content: { 'application/json': { schema: dataOf({ $ref: '#/components/schemas/Wallet' }) } },
                    },
                    ...guarded,
                },
            },
        },
        '/api/users/me': {
            get: {
                tags: ['Users'],
                summary: 'Your account record',
                description: 'Carries `employment` — the posting you currently hold, with the employer named and resolved to a user id, their mobile, your joining date and your salary. Null for a laboratory, for head office, and for anybody whose employment was ended.',
                responses: {
                    200: {
                        description: 'Account, with your current employment.',
                        content: { 'application/json': { schema: dataOf({ $ref: '#/components/schemas/User' }) } },
                    },
                    ...guarded,
                },
            },
        },
        '/api/users/laboratories': {
            get: {
                tags: ['Users'],
                summary: 'List laboratories',
                description: 'Head office sees every laboratory; a laboratory sees only itself. Each row carries a `staff` count — how many working employments point at it through `employements.parent_id`, which holds the laboratory’s `empid`.',
                responses: {
                    200: {
                        description: 'Laboratories.',
                        content: {
                            'application/json': {
                                schema: dataOf({ type: 'array', items: { $ref: '#/components/schemas/User' } }),
                            },
                        },
                    },
                    ...guarded,
                },
            },
        },
        '/api/users/staff': {
            get: {
                tags: ['Users'],
                summary: 'List staff',
                description: 'Joined through `employements`, filtered to people currently working. Each row carries the person’s own `empid` and `lab_empid` — the `employements.parent_id` as stored, the employer’s **`empid`** — alongside `lab_id`, that employer resolved to a **user id**, with `lab_name` and `employer_role_id`, so the caller can name the employer without a second request. An `employer_role_id` of 1 means they work for head office rather than for a laboratory. `lab_id`, `lab_name` and `employer_role_id` are null when no account holds the stored `empid`; `npm run check:parents` names those rows.\n\n`profile_photo` is the stored path as Laravel wrote it — `public/uploads/…` — not a URL; it is served under `/uploads/`.',
                parameters: [
                    ...pageParams,
                    {
                        name: 'lab_id',
                        in: 'query',
                        schema: { type: 'integer' },
                        description: 'Administrators only. Other roles are always scoped to their own laboratory.',
                    },
                ],
                responses: { 200: { description: 'Staff.' }, ...guarded },
            },
        },
        '/api/users': {
            post: {
                tags: ['Users'],
                summary: 'Create an account',
                description: 'Administrators only. Hashes at bcrypt cost 10, matching the existing rows.\n\nThe account arrives usable rather than half-made. It is given an `empid` — `LAB0001` for a laboratory, `EMP0007` for anybody else, the next free number for that prefix — because `employements.parent_id` and `users.parent_id` name an employer by empid, and an account without one can neither employ anybody nor be found by the staff list.\n\nSend `empid` to choose it instead; one another account already holds is refused.\n\nA staff account is employed in the same request: an employment row is written and `users.parent_id` set. The employer is `lab_id` when given, otherwise whoever asked — head office creating staff gets head office employees, a laboratory gets its own. A laboratory is nobody’s employee, so none is written for one and `employment` comes back null.',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['fullname', 'mobile', 'password', 'role_id'],
                                properties: {
                                    fullname: { type: 'string', examples: ['IIGL-PATNA'] },
                                    mobile: { type: 'string', examples: ['9800000001'] },
                                    password: { type: 'string', format: 'password', minLength: 8 },
                                    role_id: { type: ['integer', 'null'], examples: [3] },
                                    email: { type: ['string', 'null'] },
                                    empid: { type: 'string', examples: ['EMP00012'] },
                                    lab_id: { type: 'integer', examples: [4] },
                                    joining_date: { type: 'string', format: 'date' },
                                    salary: { type: 'string', examples: ['12000'] },
                                    remark: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: {
                        description: 'Created.',
                        content: {
                            'application/json': {
                                schema: dataOf({
                                    type: 'object',
                                    properties: {
                                        id: { type: 'integer' },
                                        empid: { type: 'string', examples: ['EMP00012'] },
                                        employment: {
                                            type: ['integer', 'null'],
                                            description: 'The employment row written, or null for a laboratory.',
                                        },
                                    },
                                }),
                            },
                        },
                    },
                    400: errorResponse('A required field is missing, the password is under 8 characters, or the employer is not head office or a laboratory.'),
                    409: errorResponse('That mobile number or employee ID is already in use.'),
                    ...guarded,
                },
            },
        },
        '/api/users/{id}/active': {
            patch: {
                tags: ['Users'],
                summary: 'Activate or deactivate an account',
                description: 'Administrators only.',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { type: 'object', properties: { is_active: { type: 'boolean' } } },
                        },
                    },
                },
                responses: {
                    200: { description: 'Updated.' },
                    404: errorResponse('User not found.'),
                    ...guarded,
                },
            },
        },
        '/api/dashboard/trend': {
            get: {
                tags: ['Dashboard'],
                summary: 'Twelve months of orders and certificates',
                description: 'One row per month including empty ones, oldest first. Scoped to the caller’s laboratory, or every lab for an administrator.',
                responses: {
                    200: { description: 'Monthly counts.' },
                    ...guarded,
                },
            },
        },
        '/api/dashboard/summary': {
            get: {
                tags: ['Dashboard'],
                summary: 'Counts and totals',
                description: 'Scoped to the caller’s laboratory, or every lab for an administrator. Today is matched against order_date, which is dd-mm-yyyy text rather than a date column.\n\nThe three `_today` money figures are the same three columns over the same set of orders — delivered, dated today — so `sale_today` less `paid_today` is `dues_today`. The Laravel dashboard read its today’s-paid from `transactions` and its today’s-sale from `delivery_date`, and the two never reconciled against each other.',
                responses: {
                    200: {
                        description: 'Summary.',
                        content: {
                            'application/json': {
                                schema: dataOf({ $ref: '#/components/schemas/DashboardSummary' }),
                            },
                        },
                    },
                    ...guarded,
                },
            },
        },
    },
};
/**
 * Derives an operationId for every operation: the method plus the path with
 * separators and braces collapsed to camel case. Generated rather than written
 * by hand so an id can never drift from the path it names, and so client
 * generators produce stable function names.
 *
 *   GET  /api/orders/{id}   ->  getApiOrdersById
 *   POST /api/auth/login    ->  postApiAuthLogin
 */
function operationIdFor(method, path) {
    const words = path
        .split('/')
        .filter(Boolean)
        .flatMap((segment) => {
        const param = segment.match(/^\{(.+)\}$/);
        return param ? ['by', param[1]] : segment.split(/[-_.]/);
    });
    return (method +
        words
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(''));
}
// The document is written in two files for length; they are one contract.
// Merged per path rather than per file: a path may carry a GET in one half and
// a PATCH in the other, and a wholesale assign would drop the first.
for (const [path, operations] of Object.entries(extraPaths)) {
    const existing = document.paths[path];
    document.paths[path] = existing
        ? { ...existing, ...operations }
        : operations;
}
document.tags.push(...extraTags);
for (const [path, operations] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
        operation.operationId ??= operationIdFor(method, path);
    }
}
export const openApiDocument = document;
