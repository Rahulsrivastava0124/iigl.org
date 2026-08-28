/**
 * The second half of the OpenAPI document: catalogue administration, uploads,
 * attendance, content management, permissions and order paperwork.
 *
 * Split from openapi.ts only for length. The two are merged before the document
 * is served, and check-spec.ts holds the merged result against the routers.
 */

const err = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

const guarded = {
  401: err('No session, or the session has expired.'),
  403: err('The record belongs to another laboratory, or the role lacks access.'),
};

const ok = (description: string) => ({ description });

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'integer' },
};

const body = (properties: Record<string, unknown>, required?: string[]) => ({
  required: true,
  content: {
    'application/json': {
      schema: { type: 'object', ...(required ? { required } : {}), properties },
    },
  },
});

const str = { type: ['string', 'null'] };
const bool = { type: 'boolean' };
const int = { type: 'integer' };

/** A create/update pair for one catalogue resource. */
function crud(
  tag: string,
  noun: string,
  collection: string,
  createProps: Record<string, unknown>,
  createRequired: string[],
  patchProps: Record<string, unknown>,
  extras: Record<string, unknown> = {},
) {
  return {
    [collection]: {
      post: {
        tags: [tag],
        summary: `Add a ${noun}`,
        requestBody: body(createProps, createRequired),
        responses: {
          201: ok(`${noun} created.`),
          400: err('A required field is missing or invalid.'),
          409: err('Something with that name or address already exists.'),
          ...guarded,
        },
      },
      ...(extras[collection] ?? {}),
    },
    [`${collection}/{id}`]: {
      patch: {
        tags: [tag],
        summary: `Update a ${noun}`,
        description: 'Only the fields present in the body are changed.',
        parameters: [idParam],
        requestBody: body(patchProps),
        responses: {
          200: ok('Updated.'),
          400: err('Nothing to update, or a value is invalid.'),
          404: err(`${noun} not found.`),
          ...guarded,
        },
      },
      ...(extras[`${collection}/{id}`] ?? {}),
    },
  };
}

export const extraTags = [
  { name: 'Catalogue admin', description: 'Creating and editing categories, attributes and prices. Administrators only.' },
  { name: 'Content', description: 'The public site: articles, branch pages, certificate types, banners and static pages. Administrators only.' },
  { name: 'Uploads', description: 'Images and documents, written into the directories the Laravel application uses.' },
  { name: 'Attendance', description: 'Clocking in and out, breaks, and the record of both.' },
  { name: 'Permissions', description: 'The role permission matrix, and what the signed-in user may do.' },
  { name: 'Customers', description: 'Views over orders, grouped by mobile number. There is no customer table.' },
];

export const extraPaths: Record<string, unknown> = {
  // ------------------------------------------------------- catalogue admin
  ...crud(
    'Catalogue admin',
    'category',
    '/api/admin/categories',
    {
      name: { type: 'string' },
      unit: { type: 'integer', description: 'A units.id. Required: the column is NOT NULL with no default.' },
      description: str,
      short_description: str,
      banner: str,
      icon: str,
    },
    ['name', 'unit'],
    { name: { type: 'string' }, unit: int, description: str, short_description: str, banner: str, icon: str },
  ),

  ...crud(
    'Catalogue admin',
    'subcategory',
    '/api/admin/subcategories',
    { name: { type: 'string' }, category_id: int, description: str, banner: str, icon: str },
    ['name', 'category_id'],
    { name: { type: 'string' }, category_id: int, description: str, banner: str, icon: str },
  ),

  ...crud(
    'Catalogue admin',
    'attribute',
    '/api/admin/attributes',
    {
      attr_name: { type: 'string' },
      category_id: int,
      subcategory_id: int,
      order_no: int,
      show_in_smart_card: bool,
      show_in_classic_card: bool,
      show_description: bool,
      show_image: bool,
      is_opensource: { type: 'boolean', description: 'Accepts a value outside the list, which is then added to it.' },
      is_required: bool,
    },
    ['attr_name', 'category_id', 'subcategory_id'],
    {
      attr_name: { type: 'string' },
      order_no: int,
      show_in_smart_card: bool,
      show_in_classic_card: bool,
      show_description: bool,
      show_image: bool,
      is_opensource: bool,
      is_required: bool,
    },
    {
      '/api/admin/attributes/{id}': {
        delete: {
          tags: ['Catalogue admin'],
          summary: 'Retire an attribute',
          description:
            'A soft delete. 22,103 certificates hold attribute ids inside reports.description, and removing the row would render those cards with a blank field.',
          parameters: [idParam],
          responses: { 200: ok('Retired.'), 404: err('Attribute not found.'), ...guarded },
        },
      },
    },
  ),

  ...crud(
    'Catalogue admin',
    'attribute value',
    '/api/admin/attribute-values',
    { attr_id: int, value_name: { type: 'string' }, description: str, icon: str },
    ['attr_id', 'value_name'],
    { value_name: { type: 'string' }, description: str, icon: str },
    {
      '/api/admin/attribute-values/{id}': {
        delete: {
          tags: ['Catalogue admin'],
          summary: 'Retire an attribute value',
          description: 'A soft delete, for the same reason as an attribute.',
          parameters: [idParam],
          responses: { 200: ok('Retired.'), 404: err('Value not found.'), ...guarded },
        },
      },
    },
  ),

  ...crud(
    'Catalogue admin',
    'price band',
    '/api/admin/prices',
    {
      category_id: int,
      lab_id: { type: ['integer', 'null'], description: 'Null for the standard rate that applies to every laboratory.' },
      min_wt: { type: 'number' },
      max_wt: { type: 'number' },
      smart_price: { type: 'number' },
      classic_price: { type: 'number' },
      rate: str,
    },
    ['category_id', 'min_wt', 'max_wt', 'smart_price', 'classic_price'],
    { min_wt: { type: 'number' }, max_wt: { type: 'number' }, smart_price: { type: 'number' }, classic_price: { type: 'number' }, rate: str },
    {
      '/api/admin/prices': {
        get: {
          tags: ['Catalogue admin'],
          summary: 'List price bands',
          parameters: [
            { name: 'lab_id', in: 'query', schema: { type: 'string' }, description: '"standard" for the shared rates, or a laboratory id.' },
            { name: 'category_id', in: 'query', schema: { type: 'integer' } },
          ],
          responses: { 200: ok('Price bands.'), ...guarded },
        },
      },
      '/api/admin/prices/{id}': {
        delete: {
          tags: ['Catalogue admin'],
          summary: 'Delete a price band',
          description:
            'A real delete. An order keeps the total it was billed rather than a reference to the band that produced it, so nothing points here.',
          parameters: [idParam],
          responses: { 200: ok('Deleted.'), 404: err('Price band not found.'), ...guarded },
        },
      },
    },
  ),

  '/api/admin/laboratories/{id}/commission': {
    patch: {
      tags: ['Catalogue admin'],
      summary: 'Set a laboratory commission rate',
      description: 'The percentage it owes on what it collects. Commission payments are derived from this.',
      parameters: [idParam],
      requestBody: body({ commision: { type: 'number', minimum: 0, maximum: 100 } }, ['commision']),
      responses: {
        200: ok('Updated.'),
        400: err('Rate outside 0 to 100, or the account is not a laboratory.'),
        404: err('Laboratory not found.'),
        ...guarded,
      },
    },
  },

  // ------------------------------------------------------------ customers
  '/api/customers/registered': {
    get: {
      tags: ['Customers'],
      summary: 'Customers with a GST number',
      description:
        'There is no customer table. A customer is whoever has placed an order, so this groups orders by mobile number. "Registered" means a GST number was given, which is the only distinction the data draws. Scoped the same way the order list is, including the product_collection narrowing for staff.',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'per_page', in: 'query', schema: { type: 'integer', maximum: 200 } },
      ],
      responses: { 200: ok('A page of customers, busiest first.'), ...guarded },
    },
  },

  '/api/customers/unregistered': {
    get: {
      tags: ['Customers'],
      summary: 'Customers with no GST number',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'per_page', in: 'query', schema: { type: 'integer', maximum: 200 } },
      ],
      responses: { 200: ok('A page of customers, busiest first.'), ...guarded },
    },
  },

  '/api/customers/verifiers': {
    get: {
      tags: ['Customers'],
      summary: 'People who looked up a certificate',
      description:
        'From reportsearches, which the public verification form writes one row to per lookup. Grouped by mobile number.',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'per_page', in: 'query', schema: { type: 'integer', maximum: 200 } },
      ],
      responses: { 200: ok('A page of people, most lookups first.'), ...guarded },
    },
  },

  // -------------------------------------------------------------- uploads
  '/api/uploads': {
    get: {
      tags: ['Uploads'],
      summary: 'Upload limits and accepted types',
      description: 'What a client needs to validate a file before sending it.',
      responses: { 200: ok('Buckets, size limit and accepted MIME types.'), ...guarded },
    },
  },

  '/api/uploads/{bucket}': {
    post: {
      tags: ['Uploads'],
      summary: 'Upload one or more files',
      description:
        'Multipart, in a field named "files", up to ten at a time and 8 MB each. Files are written into the directories the Laravel application uses and returned as `public/uploads/...` paths, so a record written here is indistinguishable from one written by the old system. Uploading does not attach anything: submit the returned path with the form it belongs to.',
      parameters: [
        {
          name: 'bucket',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            enum: ['report', 'order', 'signature', 'employee', 'banner', 'icon', 'website', 'documentation', 'screenshot'],
          },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Stored. Returns the paths to save on a record.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        path: { type: 'string', examples: ['public/uploads/report/8f3c….png'] },
                        original_name: { type: 'string' },
                        bytes: int,
                        mime: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        400: err('Unknown bucket, no file, wrong type, or an administrator-only bucket.'),
        ...guarded,
      },
    },
  },

  // ----------------------------------------------------------- attendance
  '/api/attendance': {
    get: {
      tags: ['Attendance'],
      summary: 'Attendance history',
      description: 'Your own by default. A laboratory or administrator can read one of their people with emp_id.',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'per_page', in: 'query', schema: { type: 'integer', maximum: 200 } },
        { name: 'emp_id', in: 'query', schema: { type: 'integer' } },
      ],
      responses: { 200: ok('A page of days, newest first.'), 400: err('Not permitted to read that person.'), ...guarded },
    },
  },

  '/api/attendance/today': {
    get: {
      tags: ['Attendance'],
      summary: "Today's own record",
      description: 'Includes can_clock_in, can_clock_out and on_break so a client can show the right button.',
      responses: { 200: ok("Today's state."), ...guarded },
    },
  },

  '/api/attendance/clock-in': {
    post: {
      tags: ['Attendance'],
      summary: 'Clock in',
      description: 'The Laravel version does this over GET, so a link or an image tag could clock someone in.',
      responses: { 201: ok('Clocked in.'), 409: err('Already clocked in today.'), ...guarded },
    },
  },

  '/api/attendance/clock-out': {
    post: {
      tags: ['Attendance'],
      summary: 'Clock out',
      responses: {
        200: ok('Clocked out and the day closed.'),
        400: err('Not clocked in today.'),
        409: err('Already clocked out.'),
        ...guarded,
      },
    },
  },

  '/api/attendance/break': {
    post: {
      tags: ['Attendance'],
      summary: 'Start or end a break',
      requestBody: body({ on_break: { type: 'boolean', description: 'True starts a break, false ends it.' } }, ['on_break']),
      responses: { 200: ok('Break state recorded.'), 400: err('Not clocked in today.'), ...guarded },
    },
  },

  // -------------------------------------------------------------- content
  ...crud(
    'Content',
    'article',
    '/api/content/blogs',
    {
      page_name: { type: 'string' },
      slug: { type: 'string', description: 'Defaults to a slug of the title.' },
      content: { type: 'string' },
      thumbnail: str,
      banner: str,
      meta_title: str,
      meta_description: str,
      meta_keywords: str,
    },
    ['page_name'],
    {
      page_name: { type: 'string' },
      slug: { type: 'string', description: 'The public address. Changing it breaks existing links, so it moves only when sent explicitly.' },
      content: { type: 'string' },
      thumbnail: str,
      banner: str,
      meta_title: str,
      meta_description: str,
      meta_keywords: str,
    },
  ),

  ...crud(
    'Content',
    'branch page',
    '/api/content/branches',
    { city: { type: 'string' }, pageURL: { type: 'string' }, h1: str, content: str, img: str, title: str, description: str, keywords: str },
    ['city'],
    { city: str, pageURL: { type: 'string' }, h1: str, content: str, img: str, title: str, description: str, keywords: str },
  ),

  ...crud(
    'Content',
    'certificate type',
    '/api/content/report-types',
    { name: { type: 'string' }, short_description: str, description: str, banner: str, icon: str, meta_title: str, meta_description: str, meta_keywords: str },
    ['name'],
    { name: { type: 'string' }, short_description: str, description: str, banner: str, icon: str, meta_title: str, meta_description: str, meta_keywords: str },
  ),

  ...crud(
    'Content',
    'banner',
    '/api/content/banners',
    { path: { type: 'string', description: 'An uploaded path from POST /api/uploads/banner.' }, img_type: { type: 'string' }, name: str, url: str, status: bool },
    ['path', 'img_type'],
    { path: { type: 'string' }, img_type: { type: 'string' }, name: str, url: str, status: bool },
    {
      '/api/content/banners': {
        get: {
          tags: ['Content'],
          summary: 'List every banner',
          description: 'Including inactive ones. The public endpoint returns only active banners.',
          responses: { 200: ok('Banners.'), ...guarded },
        },
      },
      '/api/content/banners/{id}': {
        delete: {
          tags: ['Content'],
          summary: 'Delete a banner',
          parameters: [idParam],
          responses: { 200: ok('Deleted.'), 404: err('Banner not found.'), ...guarded },
        },
      },
    },
  ),

  '/api/content/pages': {
    get: {
      tags: ['Content'],
      summary: 'List the static pages',
      responses: { 200: ok('Pages, without their bodies.'), ...guarded },
    },
  },

  '/api/content/pages/{id}': {
    patch: {
      tags: ['Content'],
      summary: 'Edit a static page',
      parameters: [idParam],
      requestBody: body({
        page_name: { type: 'string' },
        content: { type: 'string' },
        banner: str,
        meta_title: str,
        meta_description: str,
        meta_keywords: str,
      }),
      responses: { 200: ok('Updated.'), 400: err('Nothing to update.'), 404: err('Page not found.'), ...guarded },
    },
  },

  '/api/content/roles': {
    post: {
      tags: ['Content'],
      summary: 'Add a role',
      description: 'New roles start with no permissions. Grant them before anyone signs in.',
      requestBody: body({ role_name: { type: 'string' } }, ['role_name']),
      responses: { 201: ok('Role created.'), 409: err('A role with that name exists.'), ...guarded },
    },
  },

  '/api/content/roles/{id}': {
    patch: {
      tags: ['Content'],
      summary: 'Rename a role',
      parameters: [idParam],
      requestBody: body({ role_name: { type: 'string' } }, ['role_name']),
      responses: { 200: ok('Renamed.'), 404: err('Role not found.'), ...guarded },
    },
  },

  // ---------------------------------------------------------- permissions
  '/api/users/me/permissions': {
    get: {
      tags: ['Permissions'],
      summary: 'What you may do',
      description: 'Administrators are granted everything unconditionally; the matrix describes staff and laboratories.',
      responses: { 200: ok('One entry per action type.'), ...guarded },
    },
  },

  '/api/users/roles/{id}/permissions': {
    get: {
      tags: ['Permissions'],
      summary: 'The matrix for a role',
      parameters: [idParam],
      responses: { 200: ok('One entry per action type, absent rows reported as no rights.'), ...guarded },
    },
    put: {
      tags: ['Permissions'],
      summary: 'Set the permissions for one action type',
      description:
        'Replaces the four flags for that action type on that role. This is enforced: staff without view and create on product_collection see only the orders they took or were assigned.',
      parameters: [idParam],
      requestBody: body(
        {
          action_type: {
            type: 'string',
            enum: ['account', 'admin_employee', 'customer', 'employee_management', 'laboratory', 'product_collection', 'report', 'visitor_book', 'website_blog', 'website_contact', 'website_education', 'website_enquiry', 'website_home', 'website_report'],
          },
          view: bool,
          create: bool,
          update: bool,
          delete: bool,
        },
        ['action_type'],
      ),
      responses: { 200: ok('Saved. The cached matrix is dropped, so it applies at once.'), 400: err('Unknown action type.'), ...guarded },
    },
  },

  // -------------------------------------------------------------- accounts
  '/api/users/me': {
    patch: {
      tags: ['Users'],
      summary: 'Update your own profile',
      description:
        'Excludes mobile, role, active flag and commission: the first is the sign-in identifier and the rest decide what the account may do.',
      requestBody: body({
        fullname: { type: 'string' },
        owner_name: str,
        alt_mobile: str,
        email: str,
        address: str,
        city: str,
        state: str,
        pincode: str,
        gst_no: str,
        bank_name: str,
        ifsc_code: str,
        account_no: str,
        profile_photo: str,
        company_logo: str,
        signature: str,
      }),
      responses: { 200: ok('The updated record.'), 400: err('Nothing to update, or the name is blank.'), ...guarded },
    },
  },

  '/api/users/{id}': {
    get: {
      tags: ['Users'],
      summary: 'Read one account',
      description: 'Administrators only. Everyone else reads themselves at /api/users/me.',
      parameters: [idParam],
      responses: { 200: ok('Account.'), 404: err('Account not found.'), ...guarded },
    },
    patch: {
      tags: ['Users'],
      summary: 'Update any account',
      description:
        'Administrators only. A mobile number is checked against every other account first: the column carries no unique constraint, and duplicates are what locked three staff out of the old system.',
      parameters: [idParam],
      requestBody: body({
        fullname: { type: 'string' },
        mobile: { type: 'string' },
        email: str,
        role_id: int,
        is_active: bool,
        commision: { type: 'number' },
        empid: str,
        address: str,
        city: str,
        state: str,
      }),
      responses: {
        200: ok('Updated.'),
        400: err('Nothing to update, or a blank mobile number.'),
        409: err('Another account already uses that mobile number.'),
        404: err('Account not found.'),
        ...guarded,
      },
    },
  },

  '/api/users/{id}/password': {
    post: {
      tags: ['Users'],
      summary: "Reset someone's password",
      description: 'Administrators only. Tell them the new password through a separate channel.',
      parameters: [idParam],
      requestBody: body({ password: { type: 'string', minLength: 8 } }, ['password']),
      responses: { 200: ok('Password set.'), 400: err('Under 8 characters.'), 404: err('Account not found.'), ...guarded },
    },
  },

  '/api/users/{id}/employment': {
    post: {
      tags: ['Users'],
      summary: 'Attach a person to a laboratory',
      description:
        'Without this an account created by POST /api/users belongs to nobody and cannot do any work, because every scoped query resolves the laboratory through this table.',
      parameters: [idParam],
      requestBody: body(
        { lab_id: int, joining_date: { type: 'string' }, salary: { type: 'string' }, remark: str },
        ['lab_id'],
      ),
      responses: {
        201: ok('Employed.'),
        400: err('Not a laboratory, or not a staff account.'),
        409: err('Already employed somewhere. End that first.'),
        404: err('Account not found.'),
        ...guarded,
      },
    },
  },

  '/api/users/{id}/employment/end': {
    post: {
      tags: ['Users'],
      summary: 'End an employment',
      description: 'The row is kept so the history survives.',
      parameters: [idParam],
      requestBody: body({ leave_date: { type: 'string' }, remark: str }),
      responses: { 200: ok('Ended.'), 404: err('Not currently employed anywhere.'), ...guarded },
    },
  },

  // ------------------------------------------------------------ paperwork
  '/api/cards/order/{kind}/{id}': {
    get: {
      tags: ['Cards'],
      summary: 'Print a receipt or an invoice',
      description:
        'A receipt lists what was taken in and carries no prices, because nothing is priced until the certificates exist. An invoice adds the money, taken from the pricing service rather than the stored columns so it can never disagree with the settle screen.',
      parameters: [
        { name: 'kind', in: 'path', required: true, schema: { type: 'string', enum: ['receipt', 'invoice'] } },
        idParam,
        { name: 'format', in: 'query', schema: { type: 'string', enum: ['html'] } },
      ],
      responses: {
        200: {
          description: 'The document as a PDF, or as HTML when format=html.',
          content: {
            'application/pdf': { schema: { type: 'string', format: 'binary' } },
            'text/html': { schema: { type: 'string' } },
          },
        },
        400: err('Document must be a receipt or an invoice.'),
        404: err('Order not found.'),
        ...guarded,
      },
    },
  },
};
