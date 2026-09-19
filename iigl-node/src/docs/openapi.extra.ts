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
  { name: 'Permissions', description: 'Roles, the permissions on them, and grants made to one person. Head office and a laboratory can both create roles.' },
  { name: 'Customers', description: 'Views over orders, grouped by mobile number. There is no customer table.' },
  { name: 'Students', description: 'The student pipeline: enquiry, registration, course, discount, certificate. New in this system — the Laravel menu had the entries but no tables.' },
  { name: 'Courses', description: 'The course catalogue, the enrolments on it, and the discount that sits on the fee.' },
  { name: 'Enquiries', description: 'The general enquiry book: questions, visits, leads and complaints.' },
  { name: 'Statements', description: 'Commission billed to a laboratory on a period, its grace days, and the lock on certificate generation when a statement goes unpaid.' },
];

/**
 * The five master lists.
 *
 * Written from one description rather than five, because the router is one
 * factory rather than five copies: documenting them by hand would be five
 * chances for the docs and the code to disagree about the same twenty lines.
 */
const MASTER_DOCS: Array<{
  path: string;
  noun: string;
  props: Record<string, unknown>;
  required: string[];
  /** A parent filter this list accepts on the query. */
  parent?: string;
  note?: string;
}> = [
  {
    path: 'gst',
    noun: 'GST rate',
    props: { name: { type: 'string' }, percent: { type: 'number' }, is_active: bool },
    required: ['name', 'percent'],
    note: 'Offered when a course fee or a report price is set. Order pricing itself still applies the ported 18% in money.ts.',
  },
  {
    path: 'enquiry-types',
    noun: 'Enquiry type',
    props: {
      code: { type: 'string' },
      label: { type: 'string' },
      sort: int,
      is_active: bool,
    },
    required: ['code', 'label'],
    note: 'What `enquiries.kind` holds. The code is set once and cannot be edited: renaming it would orphan every enquiry filed under the old one.',
  },
  {
    path: 'countries',
    noun: 'Country',
    props: { name: { type: 'string' }, code: str, is_active: bool },
    required: ['name'],
  },
  {
    path: 'states',
    noun: 'State',
    props: {
      country_id: int,
      name: { type: 'string' },
      code: str,
      is_active: bool,
    },
    required: ['country_id', 'name'],
    parent: 'country_id',
  },
  {
    path: 'districts',
    noun: 'District',
    props: { state_id: int, name: { type: 'string' }, is_active: bool },
    required: ['state_id', 'name'],
    parent: 'state_id',
  },
];

const masterPaths: Record<string, unknown> = {};
for (const m of MASTER_DOCS) {
  const patchProps = { ...m.props };
  // The code is immutable; the parent can be corrected.
  delete (patchProps as Record<string, unknown>).code;
  if (m.path !== 'enquiry-types') Object.assign(patchProps, {});

  masterPaths[`/api/master/${m.path}`] = {
    get: {
      tags: ['Master'],
      summary: `${m.noun}s`,
      description: [m.note, 'Administrators only.'].filter(Boolean).join(' '),
      parameters: [
        {
          name: 'active',
          in: 'query',
          schema: { type: 'string', enum: ['1'] },
          description: 'Only what a form should offer. Omit it to see retired rows as well.',
        },
        ...(m.parent
          ? [{ name: m.parent, in: 'query', schema: int, description: 'Only the rows under one parent.' }]
          : []),
      ],
      responses: { 200: ok(`Every ${m.noun.toLowerCase()}.`), ...guarded },
    },
    post: {
      tags: ['Master'],
      summary: `Add a ${m.noun.toLowerCase()}`,
      requestBody: body(m.props, m.required),
      responses: {
        201: ok(`${m.noun} created.`),
        400: err('A required field is missing or invalid.'),
        409: err('One with that value already exists.'),
        ...guarded,
      },
    },
  };

  masterPaths[`/api/master/${m.path}/{id}`] = {
    patch: {
      tags: ['Master'],
      summary: `Update a ${m.noun.toLowerCase()}`,
      parameters: [idParam],
      requestBody: body(patchProps),
      responses: {
        200: ok('Updated.'),
        400: err('Nothing to update, or a value is invalid.'),
        404: err(`${m.noun} not found.`),
        ...guarded,
      },
    },
    delete: {
      tags: ['Master'],
      summary: `Delete a ${m.noun.toLowerCase()}`,
      description:
        'For the row written by mistake. Refused as soon as anything points at it — retire those with the active endpoint instead, so what already refers to them still reads.',
      parameters: [idParam],
      responses: {
        200: ok('Deleted.'),
        404: err(`${m.noun} not found.`),
        409: err('Something already refers to it.'),
        ...guarded,
      },
    },
  };

  masterPaths[`/api/master/${m.path}/{id}/active`] = {
    patch: {
      tags: ['Master'],
      summary: `Retire or restore a ${m.noun.toLowerCase()}`,
      description:
        "The ordinary end of a master row's life. A retired row stops being offered on new records and stays readable on old ones.",
      parameters: [idParam],
      requestBody: body({ is_active: bool }, ['is_active']),
      responses: { 200: ok('Updated.'), 404: err(`${m.noun} not found.`), ...guarded },
    },
  };
}
/** Content bodies: a branch's list line and map pin, and a banner's placement and phone picture. */
const BRANCH_CARD = {
  state: { type: ['string', 'null'], maxLength: 60 },
  blurb: { type: ['string', 'null'], maxLength: 120, description: 'The line under the city in the website branch list.' },
  lat: { type: ['number', 'string', 'null'], description: 'Map pin latitude, decimal degrees, -90 to 90.' },
  lon: { type: ['number', 'string', 'null'], description: 'Map pin longitude, decimal degrees, -180 to 180.' },
};
const BANNER_TYPE = { type: 'string', enum: ['slider', 'banner'], description: 'slider is the website home page slider.' };
const MOBILE_SLIDER = { type: ['string', 'null'], description: 'The picture phones get instead, a path in uploads/banner.' };
const REVIEW_RATING = { type: 'integer', minimum: 1, maximum: 5, description: 'Stars; 5 when not given.' };
const REVIEW_KIND = { type: 'string', enum: ['client', 'student'], description: 'client for the home page’s Our Reviews, student for the Education page’s testimonials; client when not given.' };
const CERTIFICATE_ICON = { type: 'string', enum: ['award', 'building', 'gear', 'handshake', 'shield'], description: 'Beside the title; award when not given.' };
const CERTIFICATE_IMAGE = { type: 'string', description: 'An uploaded path from POST /api/uploads/website.' };
/** A website page's own settings: head office's, or a laboratory's branch page. */
const SITE_BODY = {
  banner: { type: ['string', 'null'], description: 'A path in uploads/banner.' },
  content: { type: 'string', description: 'HTML from the panel editor.' },
  gallery: { type: 'array', maxItems: 24, items: { type: 'string', description: 'A path in uploads/banner.' } },
  whatsapp: { type: ['string', 'null'], description: 'With country code; ten digits get 91 in front.' },
  facebook: { type: ['string', 'null'], description: 'A link on facebook.com.' },
  instagram: { type: ['string', 'null'], description: 'A link on instagram.com.' },
};
const LAB_PARAM = { name: 'labId', in: 'path', required: true, schema: { type: 'integer' } };


export const extraPaths: Record<string, unknown> = {
  '/api/site/profile': {
    get: {
      tags: ['Website'],
      summary: 'Your own website page',
      description: 'Head office: its own page, the main site. A laboratory: its branch page. Staff are refused.',
      responses: { ...guarded, 200: ok('Banner, content, gallery and social links.'), 403: err('Only head office and a laboratory have a page.') },
    },
    put: {
      tags: ['Website'],
      summary: 'Save your own website page',
      description: 'Only the fields sent change: head office saves its social links and its gallery separately.',
      requestBody: body(SITE_BODY),
      responses: {
        ...guarded,
        200: ok('Saved; the settings as stored.'),
        400: err('A picture is not an upload, a link is not on its site, or the WhatsApp number is not a number.'),
        403: err('Only head office and a laboratory have a page.'),
      },
    },
  },

  '/api/site/profile/{labId}': {
    get: {
      tags: ['Website'],
      summary: "A laboratory's branch page",
      description: 'Head office only.',
      parameters: [LAB_PARAM],
      responses: { ...guarded, 200: ok('Banner, content, gallery and social links.'), 403: err('Head office only.'), 404: err('Laboratory not found.') },
    },
    put: {
      tags: ['Website'],
      summary: "Save a laboratory's branch page",
      description: 'Head office only. Only the fields sent change.',
      parameters: [LAB_PARAM],
      requestBody: body(SITE_BODY),
      responses: {
        ...guarded,
        200: ok('Saved; the settings as stored.'),
        400: err('A picture is not an upload, a link is not on its site, or the WhatsApp number is not a number.'),
        403: err('Head office only.'),
        404: err('Laboratory not found.'),
      },
    },
  },

  '/api/statements': {
    get: {
      tags: ['Statements'],
      summary: 'A laboratory’s commission statements',
      description:
        'Each finished period (`statement_period` months, from `statement_from`) is billed the day after it ends and falls due `statement_grace_days` later. A `statement_period` of 0 is None: one statement from billing start to today, billed today, never overdue and never locked. What it bills is the commission on orders delivered or paid on in it, dated by `order_date`, at the laboratory’s rate. Approved commission payments since billing started settle the oldest statement first.\n\n`standing` is `clear`, `grace` (a billed statement is unpaid and inside its grace days — the reminder) or `locked` (past them: `POST /api/reports` is refused with 423 until head office approves a payment that covers it). `reminder` names the oldest unpaid statement.\n\nHead office names the laboratory with `lab_id`; a laboratory reads its own; a laboratory’s staff receive `standing` alone.',
      parameters: [{ name: 'lab_id', in: 'query', schema: { type: 'integer' }, description: 'Head office only: which laboratory.' }],
      responses: {
        ...guarded,
        200: ok('The statements, newest first, the running period, and where the laboratory stands.'),
        400: err('Head office did not name a laboratory.'),
        403: err('The account is not linked to a laboratory.'),
        404: err('Laboratory not found.'),
      },
    },
  },
  '/api/statements/{key}/download': {
    get: {
      tags: ['Statements'],
      summary: 'Download one billed statement',
      description:
        'The statement as an A4 sheet: its orders, what was billed, what payments have covered of it, and the laboratory’s outstanding balance. `key` is the period’s first month. Only billed periods can be downloaded. `?format=html` returns the markup the PDF is rendered from.',
      parameters: [
        { name: 'key', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' }, description: 'YYYY-MM, the first month of the period.' },
        { name: 'lab_id', in: 'query', schema: { type: 'integer' }, description: 'Head office only: which laboratory.' },
        { name: 'format', in: 'query', schema: { type: 'string', enum: ['html'] }, description: 'Return the markup instead of a PDF.' },
      ],
      responses: {
        200: {
          description: 'The statement as a PDF, or as HTML when format=html.',
          content: {
            'application/pdf': { schema: { type: 'string', format: 'binary' } },
            'text/html': { schema: { type: 'string' } },
          },
        },
        ...guarded,
        400: err('The period is not YYYY-MM, or head office did not name a laboratory.'),
        403: err('Only the laboratory and head office can download it.'),
        404: err('Laboratory not found, or the period has not been billed yet.'),
      },
    },
  },
  ...masterPaths,

  '/api/courses/{id}/students': {
    get: {
      tags: ['Students'],
      summary: 'Who is on one course, and what it has brought in',
      description:
        'The enrolled students with what each was charged, has paid and still owes, and the same three figures totalled for the course. Totalled from the rows returned, so the figures and the list cannot disagree. Not paged: a course holds a class, and a caller wanting to page through enrolments has /api/courses/enrolments.',
      parameters: [idParam],
      responses: {
        200: ok('The course, its students and its totals.'),
        404: err('Course not found.'),
        ...guarded,
      },
    },
  },

  '/api/courses/enrolments/summary': {
    get: {
      tags: ['Students'],
      summary: 'Enrolment money, totalled',
      description:
        'Billed, paid and outstanding across every enrolment, with the count. Summed on the server because a client only ever holds one page and would total that page rather than the business. `billed` is the fee after any discount, falling back to `fee` on a row that never had one, so billed minus paid is what is owed. `due` is never negative: an overpayment is a credit to sort out on the enrolment.',
      responses: { 200: ok('The three totals and the count.'), ...guarded },
    },
  },

  '/api/settings/test-smtp': {
    post: {
      tags: ['Settings'],
      summary: 'Test the mail connection',
      description:
        'Connects, starts TLS and authenticates — everything except sending a message — and reports what happened. Nothing is stored and no mail is sent, so it is safe to run against a URL before saving it. Send `url` to test what somebody has just typed; omit it to test the stored one, which is how the button works on a field that is empty because its secret is held back. A refusal comes back as `{ ok: false, message }` with a 200, because the request succeeded even when the mail server said no.',
      requestBody: body({ url: str }),
      responses: {
        200: ok('Whether it connected, and what the server said if it did not.'),
        400: err('No URL given and none stored.'),
        ...guarded,
      },
    },
  },

  '/api/holidays': {
    get: {
      tags: ['Settings'],
      summary: 'The days the office is shut',
      description:
        'Two lists, not one. Head office keeps the national list, which everybody works to; a laboratory keeps its own, for the days only it closes — a local festival, a shutdown for stocktaking.\n\nHead office reads the shared list, or one laboratory’s with `lab_id`. Anybody else reads the shared list **and their own laboratory’s**, which together are what their calendar draws and what their pay is worked out against. `shared` on each row says which list it came from, and therefore who may change it.\n\n`from` and `to` narrow it to a month, which is how a calendar asks. Without them it is the whole list.',
      parameters: [
        { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'lab_id', in: 'query', schema: { type: 'integer' }, description: 'Head office only: one laboratory’s own list.' },
      ],
      responses: { 200: ok('Holidays, earliest first.'), 400: err('A date that is not YYYY-MM-DD.'), ...guarded },
    },
    post: {
      tags: ['Settings'],
      summary: 'Add a holiday',
      description:
        'To the caller’s own list: head office writes the shared one, a laboratory writes its own. One entry per date per list — a second holiday on one date is a mistake every time, and everything that reads this counts days.',
      requestBody: body({ date: { type: 'string', format: 'date' }, name: str }, ['date', 'name']),
      responses: {
        201: ok('Added.'),
        400: err('A date that is not YYYY-MM-DD, or no name.'),
        409: err('That date is already on this list.'),
        ...guarded,
      },
    },
  },

  '/api/holidays/{id}': {
    patch: {
      tags: ['Settings'],
      summary: 'Change a holiday',
      description:
        'Only on the caller’s own list. A laboratory cannot edit head office’s: a shared holiday changed by one franchise would silently move everybody’s calendar and everybody’s pay.',
      parameters: [idParam],
      requestBody: body({ date: { type: 'string', format: 'date' }, name: str }),
      responses: {
        200: ok('Saved.'),
        400: err('Somebody else’s list, or a date that is not YYYY-MM-DD.'),
        404: err('Holiday not found.'),
        ...guarded,
      },
    },
    delete: {
      tags: ['Settings'],
      summary: 'Remove a holiday',
      description:
        'Only from the caller’s own list. A real delete: this is a short list kept by hand, and a day that is no longer a holiday is not history worth keeping.',
      parameters: [idParam],
      responses: {
        204: { description: 'Gone.' },
        400: err('Somebody else’s list.'),
        404: err('Holiday not found.'),
        ...guarded,
      },
    },
  },

  '/api/settings': {
    get: {
      tags: ['Settings'],
      summary: 'Every setting',
      description:
        'Each setting with its value, its built-in default, and whether anybody has set it. Nothing is seeded: an unset setting reads as the constant or environment variable the code used before the table existed, so an empty table behaves exactly as the hardcoded version did. A secret comes back empty, with `set` saying whether one is stored and `preview` showing it with the password replaced by dots — enough to check the server, account and port without the secret leaving the server.\n\nHead office reads all of them. A laboratory and its staff read the `holidays` group and nothing else — the calendar the whole company works to — and may not write any of them.',
      responses: { 200: ok('Every setting, grouped by the part of its key before the dot.'), ...guarded },
    },
    patch: {
      tags: ['Settings'],
      summary: 'Save settings',
      description:
        'Send only what changed, keyed. An empty value puts a setting back to its default by deleting the row — except a secret, where empty means leave what is stored. An unknown key is refused rather than written, since a typo that becomes a row is a setting nothing reads.',
      requestBody: body({
        'company.name': str,
        'session.hours': str,
        'mail.smtp_url': str,
      }),
      responses: {
        200: ok('The keys written.'),
        400: err('An unknown key, or a value the readers could not use.'),
        ...guarded,
      },
    },
  },
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
      category_id: int,
      subcategory_id: int,
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
    { attr_id: int, value_name: { type: 'string' }, description: str, icon: str },
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
    'attribute master list',
    '/api/admin/attribute-masters',
    {
      category_id: int,
      attr_name: { type: 'string' },
      values: {
        type: 'array',
        items: { type: 'string' },
        description:
          'The values this attribute normally takes, in the order they should be offered. Blanks and repeats are dropped; grades read D, E, F, so the order given is kept rather than sorted.',
      },
    },
    ['category_id', 'attr_name', 'values'],
    {
      category_id: int,
      attr_name: { type: 'string' },
      values: {
        type: 'array',
        items: { type: 'string' },
        description: 'Replaces the list whole. Absent leaves it alone.',
      },
    },
    {
      '/api/admin/attribute-masters/{id}': {
        delete: {
          tags: ['Catalogue admin'],
          summary: 'Delete a master list',
          description:
            'A hard delete, unlike an attribute or an attribute value. Nothing points at a master: what was made from it is an attribute value of its own, and removing the template leaves every value already created where it is.',
          parameters: [idParam],
          responses: { 200: ok('Deleted.'), 404: err('Master list not found.'), ...guarded },
        },
      },
    },
  ),

  '/api/admin/attribute-values/bulk': {
    post: {
      tags: ['Catalogue admin'],
      summary: 'Add several values to one attribute',
      description:
        'What the Add Value form\u2019s multi-select sends. A name the attribute already carries is skipped rather than refused: the point of picking from a list is that nobody checks first, and half a list created plus a 409 is worse than either outcome on its own.',
      requestBody: body({ attr_id: int, values: { type: 'array', items: { type: 'string' } } }, [
        'attr_id',
        'values',
      ]),
      responses: {
        201: ok('Created. The body says how many were added and how many were already there.'),
        400: err('No attribute, or an empty list.'),
        ...guarded,
      },
    },
  },

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
      gst_id: { type: ['integer', 'null'], description: 'A row of the GST master list.' },
      gst_percent: {
        type: ['number', 'string', 'null'],
        description:
          'A rate typed on this record instead of chosen from the list. One of the two is stored and the other cleared, so they cannot disagree.',
      },
      rate: str,
    },
    ['category_id', 'min_wt', 'max_wt', 'smart_price', 'classic_price'],
    {
      min_wt: { type: 'number' },
      max_wt: { type: 'number' },
      smart_price: { type: 'number' },
      classic_price: { type: 'number' },
      gst_id: { type: ['integer', 'null'] },
      gst_percent: { type: ['number', 'string', 'null'] },
      rate: str,
    },
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
  // ---------------------------------------------------------------- roles
  '/api/roles': {
    get: {
      tags: ['Permissions'],
      summary: 'Roles this account can use',
      description:
        'Head office sees every role. A laboratory sees the shared roles and its own, not another laboratory\'s. Each row carries how many people hold it.',
      responses: { 200: ok('Roles, system ones first.'), ...guarded },
    },
    post: {
      tags: ['Permissions'],
      summary: 'Create a role',
      description:
        'Head office or a laboratory only — an employee is refused. Head office creates a shared role; a laboratory creates one of its own, which only its staff can be given. The name must be unique among the roles the creator can see — two laboratories may both have a "Front desk".',
      requestBody: body({ name: { type: 'string' }, description: str }, ['name']),
      responses: {
        201: ok('Role created.'),
        400: err('A name is required.'),
        409: err('That name is already in use.'),
        ...guarded,
      },
    },
  },

  '/api/roles/{id}': {
    patch: {
      tags: ['Permissions'],
      summary: 'Rename a role',
      description: 'Head office or a laboratory only (its own roles).',
      parameters: [idParam],
      requestBody: body({ name: { type: 'string' }, description: str }),
      responses: {
        200: ok('Updated.'),
        400: err('Nothing to update.'),
        404: err('Role not found.'),
        ...guarded,
      },
    },
    delete: {
      tags: ['Permissions'],
      summary: 'Delete a role',
      description: 'Head office or a laboratory only. Refused while anybody holds it, and never for super admin, admin and team.',
      parameters: [idParam],
      responses: {
        200: ok('Deleted.'),
        404: err('Role not found.'),
        409: err('Somebody still holds it.'),
        ...guarded,
      },
    },
  },

  '/api/roles/actions': {
    get: {
      tags: ['Permissions'],
      summary: 'Every permission that can be granted',
      description:
        'From `permission_actions`, each with `applies_to` (`laboratory`, `head_office`: whose employees can be given it), `abilities` (which of view/create/update/delete it uses) and `description` (what each opens). `enforced` is true exactly for the permissions an employee can be given; the rest (account, employees, attendance, messages…) are not employee permissions and appear on no permission screen.',
      responses: { 200: ok('The permission list.'), ...guarded },
    },
    post: {
      tags: ['Permissions'],
      summary: 'Add a permission to the list',
      description:
        'Head office only. The name is lower-cased and underscored. Adding one puts it on every permission screen; it is a label until the API reads it.',
      requestBody: body({ name: { type: 'string' }, label: { type: 'string' }, description: str }, ['name']),
      responses: {
        201: ok('Added.'),
        400: err('A name is required.'),
        409: err('Already on the list.'),
        ...guarded,
      },
    },
  },

  '/api/roles/{id}/users': {
    get: {
      tags: ['Permissions'],
      summary: 'Who holds this role',
      description:
        'The accounts on it, by name. Scoped like the role itself: head office sees any role, a laboratory only the shared ones and its own.',
      parameters: [idParam],
      responses: { 200: ok('Accounts holding the role.'), 404: err('Role not found.'), ...guarded },
    },
  },

  '/api/roles/{id}/permissions': {
    get: {
      tags: ['Permissions'],
      summary: 'The matrix for one role',
      description:
        'Employee permissions only, each row with `label`, `description`, `abilities` and `applies_to`. A laboratory’s own role lists the laboratory side (orders, certificates, customers); a shared role may be held by either kind of employee and lists both sides. Super admin returns an empty list; laboratory lists its side with every box granted. Neither is limited by permissions, and neither can be changed.',
      parameters: [idParam],
      responses: { 200: ok('One row per permission the role can carry.'), 404: err('Role not found.'), ...guarded },
    },
    put: {
      tags: ['Permissions'],
      summary: 'Set one permission on one role',
      description:
        'Head office or a laboratory only — and a laboratory only on a role it owns. Refused for a permission the role cannot carry (a head-office screen on a laboratory’s role). Flags the permission does not use are stored off.',
      parameters: [idParam],
      requestBody: body(
        { action_type: { type: 'string' }, view: bool, create: bool, update: bool, delete: bool },
        ['action_type'],
      ),
      responses: {
        200: ok('Saved.'),
        400: err('Not a permission, or not one this role can carry.'),
        404: err('Role not found.'),
        ...guarded,
      },
    },
  },

  '/api/users/{id}/permissions': {
    get: {
      tags: ['Permissions'],
      summary: 'What one person has been granted individually',
      description:
        'Separate from their role. Head office or a laboratory only: head office for any employee, a laboratory for its own staff. Nobody reads or changes their own, and head office and laboratory accounts have none (403).\n\n`staff_of` is whose employee they are, and the rows are the permissions that side can have — a laboratory’s staff: orders, certificates, customers; head office’s staff: laboratories, customers, enquiry book, student enquiries, website setup. Each carries `label`, `description` and `abilities`, with `own` saying which of them this person actually has a row for. A filled gap and a stored row of four zeros are not the same thing — the first is “whatever the role says”, the second is “not this, whatever the role says” — and both look like four unticked boxes, so `own` is what tells them apart.',
      parameters: [idParam],
      responses: {
        200: ok('One row per permission, each with an `own` flag.'),
        404: err('User not found.'),
        ...guarded,
      },
    },
    put: {
      tags: ['Permissions'],
      summary: 'Grant or withdraw one permission for one person',
      description:
        'Head office or the laboratory that employs them. An individual grant **replaces** the role\'s answer for that action rather than adding to it, so it can take away as well as give — all four flags off means "not this, whatever the role says". Refused for a permission their side cannot have; flags the permission does not use are stored off.',
      parameters: [idParam],
      requestBody: body(
        { action_type: { type: 'string' }, view: bool, create: bool, update: bool, delete: bool },
        ['action_type'],
      ),
      responses: {
        200: ok('Saved.'),
        400: err('Not a permission, or not one this employee can have.'),
        404: err('User not found.'),
        ...guarded,
      },
    },
  },

  '/api/users/{id}/permissions/{action}': {
    delete: {
      tags: ['Permissions'],
      summary: 'Drop an individual grant',
      description: 'Puts the person back on whatever their role says.',
      parameters: [
        idParam,
        { name: 'action', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: { 200: ok('Removed, or there was nothing to remove.'), ...guarded },
    },
  },

  // ------------------------------------------------------ students: enquiry
  '/api/students/enquiries': {
    get: {
      tags: ['Students'],
      summary: 'Course enquiries',
      description:
        'The first stage: somebody asking about a course. Distinct from /api/enquiries, which is the general enquiry book — a course enquiry carries the course they are interested in and converts into a registration.',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'per_page', in: 'query', schema: { type: 'integer', maximum: 200 } },
        {
          name: 'status',
          in: 'query',
          schema: {
            type: 'string',
            enum: ['new', 'contacted', 'interested', 'converted', 'not_interested'],
          },
        },
        {
          name: 'lab_id',
          in: 'query',
          description: 'Only the enquiries a given laboratory took.',
          schema: { type: 'integer' },
        },
        { name: 'q', in: 'query', schema: { type: 'string' } },
      ],
      responses: { 200: ok('A page of enquiries, newest first.'), ...guarded },
    },
    post: {
      tags: ['Students'],
      summary: 'Record a course enquiry',
      requestBody: body(
        {
          name: { type: 'string' },
          mobile: { type: 'string' },
          email: str,
          course_id: { type: ['integer', 'null'], description: 'When it is a course we run.' },
          course_interested: { type: ['string', 'null'], description: 'Free text, for one we do not.' },
          enquiry_date: str,
          source: str,
          status: { type: 'string', enum: ['new', 'contacted', 'interested', 'not_interested'] },
          remarks: str,
          follow_up_on: str,
        },
        ['name', 'mobile'],
      ),
      responses: { 201: ok('Enquiry recorded.'), 400: err('A required field is missing.'), ...guarded },
    },
  },

  '/api/students/enquiries/{id}': {
    patch: {
      tags: ['Students'],
      summary: 'Update a course enquiry',
      description:
        'Every field but the status, which walks new → contacted → interested and then either not_interested or — through the convert endpoint only — converted.',
      parameters: [idParam],
      requestBody: body({
        name: { type: 'string' },
        mobile: { type: 'string' },
        email: str,
        course_id: { type: ['integer', 'null'] },
        course_interested: str,
        enquiry_date: str,
        source: str,
        status: { type: 'string', enum: ['new', 'contacted', 'interested', 'not_interested'] },
        remarks: str,
        follow_up_on: str,
      }),
      responses: {
        200: ok('Updated.'),
        400: err('Nothing to update, or converted was set by hand.'),
        404: err('Enquiry not found.'),
        ...guarded,
      },
    },
    delete: {
      tags: ['Students'],
      summary: 'Delete a course enquiry',
      parameters: [idParam],
      responses: { 200: ok('Deleted.'), 404: err('Enquiry not found.'), ...guarded },
    },
  },

  '/api/students/enquiries/{id}/followups': {
    get: {
      tags: ['Students'],
      summary: 'The follow-up history of one course enquiry',
      description:
        'Newest first. The same log and the same code as `/api/enquiries/{id}/followups` — both books are worked the same way, so one mechanism serves them.',
      parameters: [idParam],
      responses: { 200: ok('The history.'), 404: err('Enquiry not found.'), ...guarded },
    },
    post: {
      tags: ['Students'],
      summary: 'Record a follow-up on a course enquiry',
      description:
        "Writes the log row, the enquiry's next follow-up date, and — when one is asked for and it differs — its status. The move is written onto the log row as well as applied, so the history says how the enquiry reached its status.",
      parameters: [idParam],
      requestBody: body({
        note: str,
        outcome: {
          type: 'string',
          enum: ['reached', 'no_answer', 'interested', 'not_interested', 'converted', 'pending', 'in_progress', 'resolved'],
        },
        next_follow_up_on: { type: ['string', 'null'], format: 'date' },
        status: {
          type: 'string',
          enum: ['new', 'contacted', 'interested', 'converted', 'not_interested'],
        },
      }),
      responses: {
        201: ok('Recorded.'),
        400: err('Unknown outcome or status, or a date that is not YYYY-MM-DD.'),
        404: err('Enquiry not found.'),
        ...guarded,
      },
    },
  },

  '/api/students/enquiries/{id}/convert': {
    post: {
      tags: ['Students'],
      summary: 'Convert an enquiry into a registration',
      description:
        'One transaction: the student is registered, given a registration number, and the enquiry is marked converted and pointed at them. A converted enquiry with no student behind it would drop off the follow-up list while nobody was registered.',
      parameters: [idParam],
      requestBody: body({
        name: { type: 'string', description: 'Defaults to the name on the enquiry.' },
        mobile: { type: 'string' },
        email: str,
        course_id: { type: ['integer', 'null'] },
        registration_date: str,
        status: { type: 'string', enum: ['pending', 'registered', 'active'] },
      }),
      responses: {
        201: ok('The new registration.'),
        404: err('Enquiry not found.'),
        409: err('Already converted.'),
        ...guarded,
      },
    },
  },

  // ------------------------------------------------- students: registration
  '/api/students': {
    get: {
      tags: ['Students'],
      summary: 'List registrations',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'per_page', in: 'query', schema: { type: 'integer', maximum: 200 } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'registered', 'active'] } },
        { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Name, mobile, email or registration number.' },
      ],
      responses: { 200: ok('A page of students.'), ...guarded },
    },
    post: {
      tags: ['Students'],
      summary: 'Register a student',
      description:
        'The registration number is issued here — IIGL-YYYY-NNNN, counted within the year and taken in the same transaction as the row, so two registrations at once cannot share one.',
      requestBody: body(
        {
          name: { type: 'string' },
          father_name: str,
          dob: str,
          gender: str,
          mobile: { type: 'string' },
          alt_mobile: str,
          email: str,
          address: str,
          city: str,
          state: str,
          pincode: str,
          photo: str,
          id_proof: str,
          qualification_doc: str,
          extra_doc: str,
          registration_date: str,
          course_id: { type: ['integer', 'null'] },
          status: { type: 'string', enum: ['pending', 'registered', 'active'] },
          remark: str,
        },
        ['name', 'mobile'],
      ),
      responses: { 201: ok('The new registration.'), 400: err('A required field is missing.'), ...guarded },
    },
  },

  '/api/students/summary': {
    get: {
      tags: ['Students'],
      summary: 'Counts across the whole pipeline',
      description: 'Enquiries, registrations and enrolments by status, the fee position, and how many certificates have been issued.',
      responses: { 200: ok('Counts and totals.'), ...guarded },
    },
  },

  '/api/students/{id}': {
    get: {
      tags: ['Students'],
      summary: 'One student, with their enrolments and certificates',
      parameters: [idParam],
      responses: { 200: ok('The student.'), 404: err('Student not found.'), ...guarded },
    },
    patch: {
      tags: ['Students'],
      summary: 'Update a registration',
      description: 'The registration number is not editable: it is printed on the paperwork the student is holding.',
      parameters: [idParam],
      requestBody: body({
        name: { type: 'string' },
        father_name: str,
        dob: str,
        gender: str,
        mobile: { type: 'string' },
        alt_mobile: str,
        email: str,
        address: str,
        city: str,
        state: str,
        pincode: str,
        photo: str,
        id_proof: str,
        qualification_doc: str,
        extra_doc: str,
        registration_date: str,
        course_id: { type: ['integer', 'null'] },
        status: { type: 'string', enum: ['pending', 'registered', 'active'] },
        remark: str,
      }),
      responses: {
        200: ok('Updated.'),
        400: err('Nothing to update, or a value is invalid.'),
        404: err('Student not found.'),
        ...guarded,
      },
    },
    delete: {
      tags: ['Students'],
      summary: 'Delete a registration',
      description: 'Refused while an enrolment exists. Any enquiry behind it goes back to being an enquiry.',
      parameters: [idParam],
      responses: {
        200: ok('Deleted.'),
        404: err('Student not found.'),
        409: err('The student is enrolled on a course.'),
        ...guarded,
      },
    },
  },

  // --------------------------------------------------- courses: the catalogue
  '/api/courses': {
    get: {
      tags: ['Courses'],
      summary: 'The course catalogue',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'per_page', in: 'query', schema: { type: 'integer', maximum: 200 } },
        { name: 'active', in: 'query', schema: { type: 'string', enum: ['0', '1'] } },
        { name: 'q', in: 'query', schema: { type: 'string' } },
      ],
      responses: {
        200: ok(
          'Courses, by name. Each carries `enrolled` — how many are on it — and, where the course names a GST rate either from the master list or typed on itself, the resolved `gst_rate` with `gst_amount` and `fee_with_gst`. All three are null when no rate is named. Rounded, not truncated: the truncation in money.ts is the ported rule for what an order is billed, and a course fee is not an order.',
        ),
        ...guarded,
      },
    },
    post: {
      tags: ['Courses'],
      summary: 'Add a course',
      requestBody: body(
        {
          name: { type: 'string' },
          code: str,
          duration: { type: ['string', 'null'], description: 'Free text — "6 months" — because that is how a prospectus says it.' },
          fee: { type: 'number' },
          gst_id: { type: ['integer', 'null'], description: 'A row of the GST master list.' },
          gst_percent: {
            type: ['number', 'string', 'null'],
            description:
              'A rate typed on this record instead of chosen from the list. One of the two is stored and the other cleared.',
          },
          description: str,
          level: { type: ['string', 'null'], enum: ['Beginner', 'Intermediate', 'Advanced', 'Certification', null], description: 'The badge on the website card.' },
          categories: { type: ['array', 'null'], items: { type: 'string', maxLength: 40 }, maxItems: 20, description: 'Typed in the panel. The website lists the course under each. Duplicates, ignoring case, are dropped.' },
          lessons: { type: ['string', 'null'], maxLength: 40, description: 'As the card prints it — "12 Lessons", "Self Paced".' },
        title: { type: ['string', 'null'], maxLength: 150, description: 'The heading on the website card.' },
        subtitle: { type: ['string', 'null'], maxLength: 255, description: 'The line under the title on the website card.' },
        details: { type: ['string', 'null'], maxLength: 20000, description: 'The course page: the full description.' },
        syllabus: { type: ['string', 'null'], maxLength: 5000, description: 'The course page: one topic per line.' },
          image: { type: ['string', 'null'], description: 'The card picture, a path in uploads/website.' },
          is_active: bool,
        },
        ['name'],
      ),
      responses: {
        201: ok('Course created.'),
        400: err('A required field is missing.'),
        409: err('That course name already exists.'),
        ...guarded,
      },
    },
  },

  '/api/courses/{id}': {
    patch: {
      tags: ['Courses'],
      summary: 'Update a course',
      description:
        'Changing the catalogue fee does not touch anybody\'s enrolment: an enrolment holds what that student was billed.',
      parameters: [idParam],
      requestBody: body({
        name: { type: 'string' },
        code: str,
        duration: str,
        fee: { type: 'number' },
        description: str,
        level: { type: ['string', 'null'], enum: ['Beginner', 'Intermediate', 'Advanced', 'Certification', null], description: 'The badge on the website card.' },
        categories: { type: ['array', 'null'], items: { type: 'string', maxLength: 40 }, maxItems: 20, description: 'Typed in the panel. The website lists the course under each. Duplicates, ignoring case, are dropped.' },
        lessons: { type: ['string', 'null'], maxLength: 40, description: 'As the card prints it — "12 Lessons", "Self Paced".' },
        title: { type: ['string', 'null'], maxLength: 150, description: 'The heading on the website card.' },
        subtitle: { type: ['string', 'null'], maxLength: 255, description: 'The line under the title on the website card.' },
        details: { type: ['string', 'null'], maxLength: 20000, description: 'The course page: the full description.' },
        syllabus: { type: ['string', 'null'], maxLength: 5000, description: 'The course page: one topic per line.' },
        image: { type: ['string', 'null'], description: 'The card picture, a path in uploads/website.' },
        is_active: bool,
      }),
      responses: {
        200: ok('Updated.'),
        400: err('Nothing to update.'),
        404: err('Course not found.'),
        ...guarded,
      },
    },
    delete: {
      tags: ['Courses'],
      summary: 'Delete a course',
      description: 'Refused while anybody is enrolled; retire it with is_active instead.',
      parameters: [idParam],
      responses: {
        200: ok('Deleted.'),
        404: err('Course not found.'),
        409: err('Students are enrolled on it.'),
        ...guarded,
      },
    },
  },

  // -------------------------------------------------- courses: the enrolments
  '/api/courses/enrolments': {
    get: {
      tags: ['Courses'],
      summary: 'List enrolments',
      description: 'One student on one course in one batch, joined to the names a screen has to show.',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'per_page', in: 'query', schema: { type: 'integer', maximum: 200 } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['upcoming', 'ongoing', 'completed'] } },
        { name: 'student_id', in: 'query', schema: { type: 'integer' } },
        { name: 'discounted', in: 'query', schema: { type: 'string', enum: ['1'] }, description: 'Only enrolments carrying a discount.' },
        { name: 'q', in: 'query', schema: { type: 'string' } },
      ],
      responses: { 200: ok('A page of enrolments.'), ...guarded },
    },
    post: {
      tags: ['Courses'],
      summary: 'Enrol a student',
      description:
        'The fee is copied from the catalogue rather than read through it, so a price change next year cannot restate what this student was billed. Enrolling also makes the registration active.',
      requestBody: body(
        {
          student_id: int,
          course_id: int,
          batch: str,
          start_date: str,
          end_date: str,
          fee: { type: 'number', description: 'Defaults to the catalogue fee.' },
          fee_paid: { type: 'number' },
          status: { type: 'string', enum: ['upcoming', 'ongoing', 'completed'] },
          remark: str,
        },
        ['student_id', 'course_id'],
      ),
      responses: {
        201: ok('Enrolled.'),
        400: err('A student and a course are required.'),
        404: err('Student or course not found.'),
        409: err('That student is already on this course.'),
        ...guarded,
      },
    },
  },

  '/api/courses/enrolments/{id}': {
    patch: {
      tags: ['Courses'],
      summary: 'Update an enrolment',
      description:
        'Changing the fee recomputes the discount, because a discount is a rule rather than a number. Marking it completed stamps the completion date.',
      parameters: [idParam],
      requestBody: body({
        batch: str,
        start_date: str,
        end_date: str,
        fee: { type: 'number' },
        fee_paid: { type: 'number' },
        status: { type: 'string', enum: ['upcoming', 'ongoing', 'completed'] },
        completed_on: str,
        result: str,
        remark: str,
      }),
      responses: {
        200: ok('Updated.'),
        400: err('Nothing to update, or a value is invalid.'),
        404: err('Enrolment not found.'),
        ...guarded,
      },
    },
    delete: {
      tags: ['Courses'],
      summary: 'Delete an enrolment',
      parameters: [idParam],
      responses: {
        200: ok('Deleted.'),
        404: err('Enrolment not found.'),
        409: err('A certificate has been issued against it.'),
        ...guarded,
      },
    },
  },

  '/api/courses/enrolments/{id}/discount': {
    patch: {
      tags: ['Courses'],
      summary: 'Apply or clear a discount',
      description:
        'The discount lives on the enrolment beside the fee it reduces, so the two cannot disagree. `final_fee` is computed here and never accepted from the request. An empty type clears it. Who approved it is the signed-in administrator, not a typed name.\n\n**Only before the first payment.** Once anything has been paid the fee is what the student was told and part-paid: changing it rewrites the sum a statement was printed from, and clearing it can put the payable below what has already been handed over. Refund and re-enrol is the path for that.',
      parameters: [idParam],
      requestBody: body({
        type: { type: ['string', 'null'], enum: ['percent', 'fixed', null] },
        value: { type: 'number', description: 'Per cent, or rupees, depending on the type.' },
        reason: str,
        applied_on: str,
      }),
      responses: {
        200: ok('The fee, the discount and what it leaves.'),
        400: err('Over 100%, more than the fee, or below what is already paid.'),
        404: err('Enrolment not found.'),
        ...guarded,
      },
    },
  },

  '/api/courses/enrolments/{id}/payment': {
    post: {
      tags: ['Courses'],
      summary: 'Take a fee payment',
      description:
        'Added to what is already paid rather than replacing it, and refused above the amount due. What is due is the fee after discount plus its GST — `final_fee + gst_amount` — where the rate was snapshotted onto the enrolment when it was made. An enrolment created before migration 020 carries zero GST, so its cap is exactly what it always was.',
      parameters: [idParam],
      requestBody: body({ amount: { type: 'number' } }, ['amount']),
      responses: {
        200: ok('The new paid total and what is still due.'),
        400: err('Zero or less, or more than is due.'),
        404: err('Enrolment not found.'),
        ...guarded,
      },
    },
  },

  '/api/courses/enrolments/{id}/statement': {
    get: {
      tags: ['Courses'],
      summary: 'Print the fee statement',
      description:
        'What the course costs, what has come in and what is left, as an A4 sheet to hand over. A statement rather than a numbered receipt: nothing in the schema issues fee receipt numbers, so the enrolment id is the reference and no official-looking number is invented for it.\n\nEvery figure is read from the enrolment rather than recomputed, so the sheet and the screen the money was taken on can never disagree. `?format=html` returns the markup the PDF is rendered from.',
      parameters: [
        idParam,
        { name: 'format', in: 'query', schema: { type: 'string', enum: ['html'] }, description: 'Return the markup instead of a PDF.' },
      ],
      responses: {
        200: {
          description: 'The statement as a PDF, or as HTML when format=html.',
          content: {
            'application/pdf': { schema: { type: 'string', format: 'binary' } },
            'text/html': { schema: { type: 'string' } },
          },
        },
        404: err('Enrolment not found.'),
        ...guarded,
      },
    },
  },

  // ------------------------------------------------- student certificates
  '/api/student-certificates': {
    get: {
      tags: ['Students'],
      summary: 'Course certificates',
      description:
        'Not the gemstone certificates in /api/reports. These are numbered IIGL-C-YYYY-NNNN-XXXX so the two cannot be mistaken for one another across a desk.',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'per_page', in: 'query', schema: { type: 'integer', maximum: 200 } },
        { name: 'student_id', in: 'query', schema: { type: 'integer' } },
        { name: 'q', in: 'query', schema: { type: 'string' } },
      ],
      responses: { 200: ok('A page of certificates.'), ...guarded },
    },
    post: {
      tags: ['Students'],
      summary: 'Issue a certificate',
      description:
        'Against a completed enrolment, not against a student: two courses earn two certificates. Refused while the course is unfinished.',
      requestBody: body(
        { student_course_id: int, issued_on: str, grade: str, remark: str, file: str },
        ['student_course_id'],
      ),
      responses: {
        201: ok('The certificate.'),
        400: err('The course is not finished.'),
        404: err('Enrolment not found.'),
        409: err('Already issued for that enrolment.'),
        ...guarded,
      },
    },
  },

  '/api/student-certificates/pending': {
    get: {
      tags: ['Students'],
      summary: 'Completed courses with no certificate yet',
      description: 'What the issuing screen works from.',
      responses: { 200: ok('Enrolments awaiting a certificate.'), ...guarded },
    },
  },

  '/api/student-certificates/{id}/print': {
    get: {
      tags: ['Students'],
      summary: 'Print the certificate',
      description:
        "Printed on the artwork the **course** carries, in `courses.certificate_template` — the design belongs to the course, because every student finishing it takes away the same sheet with a different name on it. The student name, course, grade, certificate number and issue date are laid over that image.\n\nA course with no design uploaded returns 404 naming the course rather than printing an invented layout: the fix is an upload, not a retry. Landscape unless `?orientation=portrait`. `?format=html` returns the markup the PDF is rendered from.",
      parameters: [
        idParam,
        { name: 'orientation', in: 'query', schema: { type: 'string', enum: ['portrait', 'landscape'] }, description: 'Page orientation. Landscape by default.' },
        { name: 'format', in: 'query', schema: { type: 'string', enum: ['html'] }, description: 'Return the markup instead of a PDF.' },
      ],
      responses: {
        200: {
          description: 'The certificate as a PDF, or as HTML when format=html.',
          content: {
            'application/pdf': { schema: { type: 'string', format: 'binary' } },
            'text/html': { schema: { type: 'string' } },
          },
        },
        404: err('Certificate not found, or the course has no design uploaded.'),
        ...guarded,
      },
    },
  },

  '/api/student-certificates/{id}': {
    patch: {
      tags: ['Students'],
      summary: 'Update a certificate',
      description: 'The number is not editable: it identifies a document somebody else is holding.',
      parameters: [idParam],
      requestBody: body({ issued_on: str, grade: str, remark: str, file: str }),
      responses: {
        200: ok('Updated.'),
        400: err('Nothing to update.'),
        404: err('Certificate not found.'),
        ...guarded,
      },
    },
    delete: {
      tags: ['Students'],
      summary: 'Delete a certificate',
      parameters: [idParam],
      responses: { 200: ok('Deleted.'), 404: err('Certificate not found.'), ...guarded },
    },
  },

  // ------------------------------------------------------------ enquiries
  '/api/enquiries': {
    get: {
      tags: ['Enquiries'],
      summary: 'List enquiries',
      description:
        'Administrators only. Ordered so anything still open outranks anything closed — the list is a queue of work, not an archive.',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'per_page', in: 'query', schema: { type: 'integer', maximum: 200 } },
        {
          name: 'kind',
          in: 'query',
          schema: { type: 'string', enum: ['ask', 'visit', 'lead', 'complaint', 'laboratory'] },
          description: "The old menu's four entries: Ask Me, Visitor's Diary, Lead followup, Complain.",
        },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['new', 'open', 'closed'] } },
        { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Name, mobile, email or subject.' },
      ],
      responses: { 200: ok('A page of enquiries.'), ...guarded },
    },
    post: {
      tags: ['Enquiries'],
      summary: 'Record an enquiry',
      description:
        'Not public. The website form does not post here yet: an unauthenticated write endpoint needs a rate limit and a captcha decision of its own.',
      requestBody: body(
        {
          kind: { type: 'string', enum: ['ask', 'visit', 'lead', 'complaint', 'laboratory'] },
          name: { type: 'string' },
          mobile: { type: 'string' },
          email: str,
          subject: str,
          course_id: { type: ['integer', 'null'] },
          course_interested: str,
          message: str,
          source: str,
          enquiry_date: {
            type: ['string', 'null'],
            format: 'date',
            description:
              'When the enquiry came in, which is not when the row was typed. Absent, `created_at` answers it.',
          },
          follow_up_on: {
            type: ['string', 'null'],
            format: 'date',
            description:
              'When the next attempt is due. Also written by the follow-up endpoint, from the newest attempt.',
          },
          status: { type: 'string', enum: ['new', 'open', 'closed'] },
          assigned_to: { type: ['integer', 'null'] },
          lab_id: { type: ['integer', 'null'] },
          remark: str,
        },
        ['name', 'mobile'],
      ),
      responses: { 201: ok('Enquiry recorded.'), 400: err('A required field is missing.'), ...guarded },
    },
  },

  '/api/enquiries/summary': {
    get: {
      tags: ['Enquiries'],
      summary: 'Counts per kind and per status',
      responses: { 200: ok('Counts, and how many are still waiting.'), ...guarded },
    },
  },

  '/api/enquiries/{id}': {
    get: {
      tags: ['Enquiries'],
      summary: 'One enquiry',
      parameters: [idParam],
      responses: { 200: ok('The enquiry.'), 404: err('Enquiry not found.'), ...guarded },
    },
    patch: {
      tags: ['Enquiries'],
      summary: 'Update an enquiry',
      description:
        'Closing stamps `closed_at`; reopening clears it, so the column answers "when was this finished" rather than "when was it last closed".',
      parameters: [idParam],
      requestBody: body({
        kind: { type: 'string', enum: ['ask', 'visit', 'lead', 'complaint', 'laboratory'] },
        name: { type: 'string' },
        mobile: { type: 'string' },
        email: str,
        subject: str,
        course_id: { type: ['integer', 'null'] },
        course_interested: str,
        message: str,
        source: str,
        enquiry_date: { type: ['string', 'null'], format: 'date' },
        follow_up_on: { type: ['string', 'null'], format: 'date' },
        status: { type: 'string', enum: ['new', 'open', 'closed'] },
        assigned_to: { type: ['integer', 'null'] },
        remark: str,
      }),
      responses: {
        200: ok('Updated.'),
        400: err('Nothing to update, or a value is invalid.'),
        404: err('Enquiry not found.'),
        ...guarded,
      },
    },
    delete: {
      tags: ['Enquiries'],
      summary: 'Delete an enquiry',
      parameters: [idParam],
      responses: { 200: ok('Deleted.'), 404: err('Enquiry not found.'), ...guarded },
    },
  },

  '/api/enquiries/{id}/followups': {
    get: {
      tags: ['Enquiries'],
      summary: 'The follow-up history of one enquiry',
      description:
        'Newest first, each entry naming who made the attempt and how it went. Kept as a log rather than folded into `remark`, which every attempt used to overwrite. One log serves both enquiry books, keyed by `enquiry_type`.',
      parameters: [idParam],
      responses: { 200: ok('The history.'), 404: err('Enquiry not found.'), ...guarded },
    },
    post: {
      tags: ['Enquiries'],
      summary: 'Record a follow-up',
      description:
        'Writes three things in step: the log row, the enquiry\'s next follow-up date, and — when one is asked for and it differs — the enquiry\'s status. The move is recorded on the log row as well as applied, so the history says how the enquiry reached its status rather than only what that status is. Closing stamps `closed_at`.',
      parameters: [idParam],
      requestBody: body({
        note: str,
        outcome: {
          type: 'string',
          enum: ['reached', 'no_answer', 'interested', 'not_interested', 'converted', 'pending', 'in_progress', 'resolved'],
        },
        next_follow_up_on: { type: ['string', 'null'], format: 'date' },
        status: { type: 'string', enum: ['new', 'open', 'closed'] },
      }),
      responses: {
        201: ok('Recorded.'),
        400: err('Unknown outcome, or a date that is not YYYY-MM-DD.'),
        404: err('Enquiry not found.'),
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

  '/api/customers/all': {
    get: {
      tags: ['Customers'],
      summary: 'Every customer, registered or not',
      description:
        'The registered and unregistered lists in one. Head office’s list spans the network and the GST split is not how it reads it — "who has ordered from us" is one question, and answering it meant paging two screens and adding them up. Scoped like the other two: a laboratory sees its own.\n\nEach row carries `laboratories`, every franchise the number has ordered from, named and comma-separated — a mobile number is all that groups these rows, and the same person can walk into two.',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'per_page', in: 'query', schema: { type: 'integer', maximum: 200 } },
        { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Matches name, mobile, email or GST on any of the customer’s orders.' },
      ],
      responses: { 200: ok('A page of customers, most orders first.'), ...guarded },
    },
  },

  '/api/customers/accounts': {
    get: {
      tags: ['Customers'],
      summary: 'Registered customers',
      description:
        'Every stored registered customer, and every GST customer known only from an order who has not been registered yet — both are real, and dropping either would make the list wrong in a different direction. Matched on mobile. A stored row carries `account_id`, company, owner, city, `logo`, `discounts` and `show_on_site` (listed on the website); an order-derived row has `account_id: null`, no logo, no terms and `show_on_site: null`. Order totals are joined by mobile. A laboratory sees its own; head office sees all.',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'per_page', in: 'query', schema: { type: 'integer', maximum: 200 } },
        { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Matches company, owner, name, mobile, email, city or GST.' },
      ],
      responses: { 200: ok('A page of registered customers.'), ...guarded },
    },
    post: {
      tags: ['Customers'],
      summary: 'Register a customer',
      description:
        'A laboratory registers its own customers and its staff register them for it. Head office may send `lab_id`, or leave it out for a customer of its own that belongs to no laboratory — only head office sees those. A GST number is required: registered has always meant one here. The discount is stored per category and **not yet applied to an order** — pricing is ported behaviour verified against Laravel, and billing a discount is its own change.',
      requestBody: body(
        {
          lab_id: { type: ['integer', 'null'], description: 'Head office only, and optional: none is head office’s own customer.' },
          company_name: { type: 'string' },
          owner_name: { type: 'string' },
          mobile: { type: 'string', pattern: '^\\d{10}$' },
          email: str,
          area: { type: ['string', 'null'], description: 'Locality shown before the city on the website, e.g. Salkia.' },
          city: str,
          state: str,
          logo: { type: ['string', 'null'], description: 'An uploaded path, shown on the website.' },
          gst_no: { type: 'string' },
          show_name_in_card: { type: 'boolean', description: 'Print the customer’s name on their certificates. The same field an order carries, so an order can copy it.' },
          show_name_input: { type: ['string', 'null'], description: 'The name to print. Cleared when show_name_in_card is off.' },
          show_image_in_card: { type: 'boolean', description: 'Print an image on their certificates.' },
          show_image_in_card_file: { type: ['string', 'null'], description: 'The uploaded image path. Cleared when show_image_in_card is off.' },
          discounts: { type: 'array', items: { type: 'object', properties: { category_id: int, discount_type: { type: 'string', enum: ['percent', 'per_pc'] }, value: { type: 'number', minimum: 0 } } }, description: 'One row per category. A value of 0 removes that category’s discount; a percentage over 100 is refused. Absent on PATCH leaves the terms alone, and a list replaces them whole.' },
        },
        ['company_name', 'owner_name', 'mobile', 'gst_no'],
      ),
      responses: {
        201: ok('Registered.'),
        400: err('A required field is missing or invalid.'),
        409: err('That contact number is already a registered customer of this laboratory.'),
        ...guarded,
      },
    },
  },

  '/api/customers/accounts/{id}': {
    get: {
      tags: ['Customers'],
      summary: 'One registered customer, with their discounts',
      parameters: [idParam],
      responses: { 200: ok('The customer.'), 404: err('Customer not found.'), ...guarded },
    },
    patch: {
      tags: ['Customers'],
      summary: 'Update a registered customer',
      description: 'Only the fields present are changed. `discounts`, when sent, replaces the terms whole.',
      parameters: [idParam],
      requestBody: body({
        company_name: { type: 'string' },
        owner_name: { type: 'string' },
        mobile: { type: 'string' },
        email: str,
        area: { type: ['string', 'null'] },
        city: str,
        state: str,
        logo: { type: ['string', 'null'] },
        show_on_site: { type: 'boolean', description: 'List this customer in the website’s Our Registered Customers section.' },
        gst_no: { type: 'string' },
        show_name_in_card: { type: 'boolean', description: 'Print the customer’s name on their certificates. The same field an order carries, so an order can copy it.' },
        show_name_input: { type: ['string', 'null'], description: 'The name to print. Cleared when show_name_in_card is off.' },
        show_image_in_card: { type: 'boolean', description: 'Print an image on their certificates.' },
        show_image_in_card_file: { type: ['string', 'null'], description: 'The uploaded image path. Cleared when show_image_in_card is off.' },
        discounts: { type: 'array', items: { type: 'object', properties: { category_id: int, discount_type: { type: 'string', enum: ['percent', 'per_pc'] }, value: { type: 'number', minimum: 0 } } }, description: 'One row per category. A value of 0 removes that category’s discount; a percentage over 100 is refused. Absent on PATCH leaves the terms alone, and a list replaces them whole.' },
      }),
      responses: {
        200: ok('Updated.'),
        404: err('Customer not found.'),
        409: err('That contact number is already registered here.'),
        ...guarded,
      },
    },
    delete: {
      tags: ['Customers'],
      summary: 'Remove a registered customer',
      description: 'The record and its terms. Their orders are untouched: removing the registration does not unbill anybody.',
      parameters: [idParam],
      responses: { 200: ok('Removed.'), 404: err('Customer not found.'), ...guarded },
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

  '/api/customers/{mobile}/orders': {
    get: {
      tags: ['Customers'],
      summary: "One customer's orders, and what they come to",
      description:
        'Keyed by mobile number, because that is what a customer is here: there is no customer table, and the list groups the orders by it. Every order the caller may see under that number, newest first, with `totals` — how many, billed, paid, and due.\n\nThe money is read from the orders rather than re-priced from the weight bands: this is a history of what was billed and collected, and re-pricing it today would answer what the same work would cost now. `due` is billed less paid rather than a sum of `dues_amount`, which is written at settlement and says nothing about an order billed and not yet paid at all.\n\nScoped as the customer list is: a laboratory sees its own orders, a team member without the collection right sees only the ones they took or were assigned, and head office sees them all.',
      parameters: [
        {
          name: 'mobile',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'The customer’s mobile number, as the orders hold it.',
        },
      ],
      responses: {
        200: ok('The orders under that number, with their totals.'),
        400: err('A mobile number is required.'),
        ...guarded,
      },
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
                        url: {
                          type: 'string',
                          description:
                            "The object's public URL, or an empty string when no public " +
                            'domain is configured. Empty means read it through /api/files.',
                          examples: ['https://pub-….r2.dev/uploads/report/8f3c….png'],
                        },
                        original_name: { type: 'string' },
                        bytes: int,
                        mime: { type: 'string' },
                        storage: {
                          type: 'string',
                          enum: ['r2', 'disk'],
                          description: 'Which store took the bytes.',
                        },
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
      description:
        'Your own by default. A laboratory or administrator can read one of their people with emp_id. `from` and `to` are inclusive dates, either given alone: a calendar asks for a month that way, because paging newest-first can split one across two pages and a calendar that pages to fill itself in draws holes.',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'per_page', in: 'query', schema: { type: 'integer', maximum: 200 } },
        { name: 'emp_id', in: 'query', schema: { type: 'integer' } },
        { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
      ],
      responses: {
        200: ok('A page of days, newest first.'),
        400: err('Not permitted to read that person, or a date that is not YYYY-MM-DD.'),
        ...guarded,
      },
    },
    post: {
      tags: ['Attendance'],
      summary: 'Record a day that was never punched',
      description:
        'The employer only, as correcting is. The clock can only record now, so a day nobody punched at all — the machine was down, they were at a fair, somebody forgot — has no row to correct, and this writes one.\n\nRefused for a day that has not happened: a row dated forward would count in the month’s hours before it was worked. Refused too where the day is already recorded, which is `PATCH /api/attendance/{id}`.\n\nA blank `clock_out` leaves the day open, the same `00:00:00` sentinel the rest of this table uses. Breaks are not taken here: a day reconstructed after the fact is reconstructed from arrival and departure.',
      requestBody: body(
        {
          emp_id: { type: 'integer' },
          date: { type: 'string', examples: ['2026-09-03'] },
          clock_in: { type: 'string', examples: ['09:30'] },
          clock_out: { type: ['string', 'null'], examples: ['18:30'] },
        },
        ['emp_id', 'date', 'clock_in'],
      ),
      responses: {
        201: ok('The day, as written.'),
        400: err('No employee, a malformed date or time, a day in the future, or a clock-out at or before the clock-in.'),
        409: err('That day is already recorded.'),
        ...guarded,
        403: err('That account is not one of your employees.'),
      },
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

  '/api/attendance/{id}': {
    patch: {
      tags: ['Attendance'],
      summary: 'Correct a day',
      description:
        'The employer only — head office for anyone, a laboratory for the people it employs, and a member of staff for nobody, including themselves: a person editing their own attendance is a person writing their own timesheet.\n\nFor the days the clock in the bar cannot fix, because it only ever records now: somebody who forgot to punch out and left the day open, or punched in an hour after they arrived.\n\nTimes are `HH:MM` or `HH:MM:SS`. `clock_out: null` reopens the day — the column is NOT NULL and `00:00:00` is the sentinel for "still working" — and a break is cleared the same way. The break columns are datetimes, so a time is stamped onto the day the record belongs to rather than onto today.',
      parameters: [idParam],
      requestBody: body({
        clock_in: { type: 'string', examples: ['09:05'] },
        clock_out: { type: ['string', 'null'], examples: ['18:30'] },
        break_begin: { type: ['string', 'null'], examples: ['13:00'] },
        break_end: { type: ['string', 'null'], examples: ['13:30'] },
      }),
      responses: {
        200: ok('The corrected day.'),
        400: err('Nothing to change, a time that is not a time, or a clock-out at or before the clock-in.'),
        404: err('That attendance record does not exist.'),
        ...guarded,
        403: err('That account is not one of your employees.'),
      },
    },
  },

  // ------------------------------------------------------------- messages
  '/api/messages': {
    get: {
      tags: ['Messages'],
      summary: 'Inbox, or one person’s messages',
      description:
        'Without `from`, what has been written to you. With it, what one person has written — the employee page asks that way, and the employer check decides whether they are yours to read. Anybody may pass their own id to read what they sent.',
      parameters: [
        { name: 'from', in: 'query', schema: { type: 'integer' }, description: 'One writer: yourself, or somebody you employ.' },
        { name: 'box', in: 'query', schema: { type: 'string', enum: ['in', 'all'], default: 'in' }, description: '`all` is both directions for this account — the whole conversation with whoever they write to and hear from. A reply read apart from what it replies to is half a sentence.' },
        { name: 'open', in: 'query', schema: { type: 'string', enum: ['1'] }, description: 'Only what has not been dealt with.' },
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'per_page', in: 'query', schema: { type: 'integer', maximum: 200 } },
      ],
      responses: {
        200: ok('A page of messages, newest first.'),
        ...guarded,
        403: err('That account is not one of your employees.'),
      },
    },
    post: {
      tags: ['Messages'],
      summary: 'Write a message, to one person or several',
      description:
        'The Laravel sidebars drew a Message menu and never built it — both entries are `href="#"`. This is the whole of it, in both directions.\n\n**Upward**, from staff: no recipient in the body. They have exactly one employer, and a field for it would be a field to get wrong; an account nobody employs is told there is nobody to write to rather than having the message go nowhere.\n\n**Downward**, from an employer: `to` names them. Head office may write to any laboratory or employee, a laboratory to its own staff, and nobody sideways — checked here rather than trusted from the body. `GET /api/messages/recipients` is the same rule, asked in advance.\n\nOne row is written per recipient, so each is dealt with — or not — on its own: a single row addressed to nine people is one that eight of them cannot answer. At most 100 at a time.\n\nA `request` expects something to happen — a correction, a day off — and a `message` does not. The reader’s list is coloured by the difference, so it is asked rather than guessed from the words.',
      requestBody: body(
        {
          body: { type: 'string', maxLength: 2000, description: 'May be empty when a file is attached.' },
          attachment: {
            type: ['string', 'null'],
            description: 'A photograph or PDF, uploaded first to POST /api/uploads/message and named here by the path it returned. Only a path in uploads/message is accepted.',
          },
          kind: { type: 'string', enum: ['message', 'request'], default: 'message' },
          topic: {
            type: ['string', 'null'],
            enum: ['leave', 'punch', null],
            description:
              'Which template a request was written from. Leave and a punch to correct are both requests naming a day and differ only in prose the writer can rewrite, so the Employee list cannot read one back — this is what lets it say somebody is on leave today. Absent for anything typed from scratch, which claims nothing about which kind it is.',
          },
          about_date: { type: ['string', 'null'], description: 'The day it concerns, as YYYY-MM-DD, when it concerns one.' },
          to: {
            type: 'array',
            items: { type: 'integer' },
            description: 'Who it is for. Omit it and it goes to your employer, which is what staff do.',
          },
          reply_to: {
            type: ['integer', 'null'],
            description:
              'Answer a message written to you. It goes back to whoever wrote that message — `to` is ignored — and is folded under it in both inboxes. No other permission is needed: this is how a laboratory writes back to head office.',
          },
        },
        ['body'],
      ),
      responses: {
        201: ok('Written. `sent` is how many rows that came to.'),
        400: err('Nothing written, too long, an unknown kind, a malformed date, too many recipients, nobody to write to, or a reply_to that is not a message id.'),
        ...guarded,
        403: err('That account is not one of your employees, or the message replied to was not written to you.'),
        404: err('The message replied to is no longer there.'),
      },
    },
  },

  '/api/messages/{id}/resolve': {
    patch: {
      tags: ['Messages'],
      summary: 'Answer one: approve, decline, or simply close it',
      description:
        'The reader’s, not the writer’s: they asked, you answer. `resolved: false` reopens it, and reopening drops the decision with the timestamp — a request that is open again has not been answered, whatever was said before.\n\n**A decision is optional.** A plain message has nothing to approve and closing it works exactly as it did; a request without one reads as "Dealt with", which is all that was ever recorded before this existed and all that is known about the rows written then.\n\n**A reply is a message, not a field.** Given, it is written back to whoever asked — as a `message`, so nothing lands in anybody\u2019s open list, and carrying the request\u2019s own `about_date` so the answer sits on the same day of their calendar as the thing it answers. A note that lived only on the row it answers is a note nobody is told about.',
      parameters: [idParam],
      requestBody: body({
        resolved: { type: 'boolean', default: true },
        decision: {
          type: ['string', 'null'],
          enum: ['approved', 'declined', null],
          description:
            'How the request was answered. "Dealt with" is true of an approval and of a refusal alike, which is the one distinction the person who asked came to find.',
        },
        reply: {
          type: 'string',
          maxLength: 2000,
          description: 'Sent to them as a message. Ignored when answering your own.',
        },
      }),
      responses: {
        200: ok('Marked.'),
        404: err('That message does not exist.'),
        ...guarded,
        403: err('That message was not written to you.'),
      },
    },
  },

  '/api/messages/recipients': {
    get: {
      tags: ['Messages'],
      summary: 'Everybody this account may write to',
      description:
        'Head office: every laboratory and everybody they employ. A laboratory: its own staff. Staff: the one person who employs them, which the panel names rather than lists.\n\nThe same rule `POST /api/messages` enforces on the way in, asked in advance so the compose box has something to select from.',
      responses: { 200: ok('The people, with their employee ID and employer where there is one.'), ...guarded },
    },
  },

  '/api/messages/employer': {
    get: {
      tags: ['Messages'],
      summary: 'Who this account writes to',
      description: 'The employer a message would go to, so the form can say so before anybody types. Null when nobody employs this account.',
      responses: { 200: ok('The employer, or null.'), ...guarded },
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
      thumbnail: { type: ['string', 'null'], description: 'The card picture, a path in uploads/website.' },
      excerpt: { type: ['string', 'null'], maxLength: 255, description: 'The line under the title on the card.' },
      category: { type: ['string', 'null'], maxLength: 60 },
      author: { type: ['string', 'null'], maxLength: 100 },
      published_on: { type: ['string', 'null'], format: 'date', description: 'Shown on the card; blank shows the date added.' },
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
      thumbnail: { type: ['string', 'null'], description: 'The card picture, a path in uploads/website.' },
      excerpt: { type: ['string', 'null'], maxLength: 255, description: 'The line under the title on the card.' },
      category: { type: ['string', 'null'], maxLength: 60 },
      author: { type: ['string', 'null'], maxLength: 100 },
      published_on: { type: ['string', 'null'], format: 'date', description: 'Shown on the card; blank shows the date added.' },
      banner: str,
      meta_title: str,
      meta_description: str,
      meta_keywords: str,
    },
    {
      '/api/content/blogs': {
        get: {
          tags: ['Content'],
          summary: 'List every article, with its body',
          description: 'For the editor. The public list leaves the body out.',
          responses: { 200: ok('Articles.'), ...guarded },
        },
      },
    },
  ),

  ...crud(
    'Content',
    'branch page',
    '/api/content/branches',
    { city: { type: 'string' }, ...BRANCH_CARD, pageURL: { type: 'string' }, h1: str, content: str, img: str, title: str, description: str, keywords: str },
    ['city'],
    { city: str, ...BRANCH_CARD, pageURL: { type: 'string' }, h1: str, content: str, img: str, title: str, description: str, keywords: str },
    {
      '/api/content/branches': {
        get: {
          tags: ['Content'],
          summary: 'List every branch page, whole',
          description: 'For the editor. The public list carries only what the website lists.',
          responses: { 200: ok('Branch pages.'), ...guarded },
        },
      },
    },
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
    { path: { type: 'string', description: 'An uploaded path from POST /api/uploads/banner.' }, img_type: BANNER_TYPE, name: str, url: str, mobile_slider: MOBILE_SLIDER, status: bool },
    ['path', 'img_type'],
    { path: { type: 'string' }, img_type: BANNER_TYPE, name: str, url: str, mobile_slider: MOBILE_SLIDER, status: bool },
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

  ...crud(
    'Content',
    'review',
    '/api/content/reviews',
    { kind: REVIEW_KIND, name: { type: 'string' }, trade: str, quote: { type: 'string' }, rating: REVIEW_RATING, status: bool },
    ['name', 'quote'],
    { kind: REVIEW_KIND, name: { type: 'string' }, trade: str, quote: { type: 'string' }, rating: REVIEW_RATING, status: bool },
    {
      '/api/content/reviews': {
        get: {
          tags: ['Content'],
          summary: 'List every review',
          description: 'Clients’ for the home page’s Our Reviews and students’ for the Education page’s testimonials, inactive ones included. The public endpoint returns only active ones.',
          parameters: [{ name: 'kind', in: 'query', schema: REVIEW_KIND, description: 'Only this kind; both when left out.' }],
          responses: { 200: ok('Reviews.'), ...guarded },
        },
      },
      '/api/content/reviews/{id}': {
        delete: {
          tags: ['Content'],
          summary: 'Delete a review',
          parameters: [idParam],
          responses: { 200: ok('Deleted.'), 404: err('Review not found.'), ...guarded },
        },
      },
    },
  ),

  ...crud(
    'Content',
    'gallery picture',
    '/api/content/education-gallery',
    { title: str, image: CERTIFICATE_IMAGE, status: bool },
    ['image'],
    { title: str, image: CERTIFICATE_IMAGE, status: bool },
    {
      '/api/content/education-gallery': {
        get: {
          tags: ['Content'],
          summary: 'List every Course Gallery picture',
          description: 'The Education page’s Course Gallery, inactive pictures included. The public endpoint returns only active ones.',
          responses: { 200: ok('Pictures.'), ...guarded },
        },
      },
      '/api/content/education-gallery/{id}': {
        delete: {
          tags: ['Content'],
          summary: 'Delete a Course Gallery picture',
          parameters: [idParam],
          responses: { 200: ok('Deleted.'), 404: err('Picture not found.'), ...guarded },
        },
      },
    },
  ),

  ...crud(
    'Content',
    'company certificate',
    '/api/content/company-certificates',
    { title: { type: 'string' }, subtitle: str, icon: CERTIFICATE_ICON, image: CERTIFICATE_IMAGE, status: bool },
    ['image'],
    { title: { type: 'string' }, subtitle: str, icon: CERTIFICATE_ICON, image: CERTIFICATE_IMAGE, status: bool },
    {
      '/api/content/company-certificates': {
        get: {
          tags: ['Content'],
          summary: 'List every company certificate',
          description: 'For the website’s Our Company Certificates section, inactive ones included. The public endpoint returns only active ones.',
          responses: { 200: ok('Company certificates.'), ...guarded },
        },
      },
      '/api/content/company-certificates/{id}': {
        delete: {
          tags: ['Content'],
          summary: 'Delete a company certificate',
          parameters: [idParam],
          responses: { 200: ok('Deleted.'), 404: err('Certificate not found.'), ...guarded },
        },
      },
    },
  ),

  '/api/content/branch-laboratories': {
    get: {
      tags: ['Content'],
      summary: 'List laboratories with their website visibility',
      description: 'Every laboratory, active or not, with show_on_site and map_location: city (placed on its city), state (city not found — check its spelling), pending (not looked up yet) or none (no city). Head office only.',
      responses: { 200: ok('Laboratories.'), ...guarded },
    },
  },

  '/api/content/branch-laboratories/{id}': {
    patch: {
      tags: ['Content'],
      summary: 'Show or hide a laboratory on the website',
      parameters: [idParam],
      requestBody: body({ show_on_site: { type: 'boolean' } }, ['show_on_site']),
      responses: { 200: ok('Saved.'), 400: err('show_on_site must be true or false.'), 404: err('Laboratory not found.'), ...guarded },
    },
  },

  '/api/content/website-customers': {
    get: {
      tags: ['Content'],
      summary: 'List registered customers with their website visibility',
      description: 'Every registered customer with company, owner, mobile, area, city, state, logo, laboratory and show_on_site. Head office only.',
      responses: { 200: ok('Customers.'), ...guarded },
    },
  },

  '/api/content/website-customers/{id}': {
    patch: {
      tags: ['Content'],
      summary: 'Show or hide a registered customer on the website',
      parameters: [idParam],
      requestBody: body({ show_on_site: { type: 'boolean' } }, ['show_on_site']),
      responses: { 200: ok('Saved.'), 400: err('show_on_site must be true or false.'), 404: err('Customer not found.'), ...guarded },
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

  // --------------------------------------------------------------- payments
  '/api/payments/config': {
    get: {
      tags: ['Payments'],
      summary: 'Whether online payment is available',
      description: '`enabled` is false until the Cashfree keys are set; `mode` is sandbox (test) or production.',
      responses: { 200: ok('{ enabled, mode, gateway }'), ...guarded },
    },
  },

  '/api/payments/commission': {
    post: {
      tags: ['Payments'],
      summary: 'Pay commission to head office online',
      description:
        'A laboratory account only. Makes a Cashfree order for the amount and returns `payment_session_id` for the checkout. Once confirmed paid, an **approved** commission remittance is recorded (pay mode online, the Cashfree payment id as its reference) — the gateway has already confirmed the money.',
      requestBody: body({ amount: { type: 'number', minimum: 1 }, remark: str }, ['amount']),
      responses: { 201: ok('{ order_id, payment_session_id, amount, mode }'), 400: err('Invalid amount, or online payment not set up.'), ...guarded },
    },
  },

  '/api/payments/student-registration': {
    post: {
      tags: ['Payments'],
      summary: 'Register a student and take the course fee online',
      description:
        'Head office only. The registration details (and optional photo, id_proof, qualification_doc upload paths) with `course_id`; priced on the server as fee plus GST. Nothing is registered until the payment is confirmed.',
      requestBody: body({ course_id: int, name: { type: 'string' }, mobile: { type: 'string' }, email: { type: 'string' } }, ['course_id', 'name', 'mobile', 'email']),
      responses: { 201: ok('{ order_id, payment_session_id, amount, mode, course, fee, gst_amount }'), 400: err('Invalid details, no fee, or online payment not set up.'), 409: err('Already registered for this course.'), ...guarded },
    },
  },

  '/api/payments/enrolment-fee': {
    post: {
      tags: ['Payments'],
      summary: 'Take a course fee payment online',
      description:
        'Head office only. A Cashfree order for part or all of what is still due on an enrolment (never more). Once confirmed paid, the amount is added to the enrolment’s fee paid, as a cash payment is, with the Cashfree reference noted.',
      requestBody: body({ enrolment_id: int, amount: { type: 'number', minimum: 1 } }, ['enrolment_id', 'amount']),
      responses: { 201: ok('{ order_id, payment_session_id, amount, mode }'), 400: err('Invalid amount, more than is due, or online payment not set up.'), 404: err('Enrolment not found.'), ...guarded },
    },
  },

  '/api/payments/{orderId}/confirm': {
    post: {
      tags: ['Payments'],
      summary: 'Check a payment with Cashfree and fulfil it',
      description:
        'Head office, or the account that started it. Reads the order back from Cashfree; once PAID, makes what it pays for exactly once (the commission remittance, or the student and enrolment) and returns it in `result`.',
      parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: ok('{ order_id, purpose, status, amount, mode, result }'), 404: err('Payment not found.'), ...guarded },
    },
  },

  // ---------------------------------------------------------- permissions
  '/api/users/me/permissions': {
    get: {
      tags: ['Permissions'],
      summary: 'What you may do',
      description:
        'Head office and laboratories are granted everything. An employee gets their own grant, else their role’s, limited to the permissions their side can have and the flags each uses — the same answer the API checks on every request. `staff_of` is `laboratory`, `head_office`, or null for head office and laboratory accounts.',
      responses: { 200: ok('One entry per action type, and staff_of.'), ...guarded },
    },
  },

  // -------------------------------------------------------------- accounts
  '/api/users/laboratories/{id}/agreement': {
    get: {
      tags: ['Users'],
      summary: 'The Franchise Agreement, the four pages after the form',
      description:
        'The rest of the printed pack: the equipment a franchise must hold before it opens, what is charged for and what is free, the refund position, and the order the establishment runs in with its deadlines. Only the header block is the laboratory’s — owner, contact, company, email, address, form number; the offer is the same for every franchise and lives in the template. Returns a PDF inline. `?format=html` returns the markup, `?blank=1` prints it with the header empty for handing across a counter. Administrators only.',
      parameters: [
        idParam,
        { name: 'format', in: 'query', schema: { type: 'string', enum: ['html'] } },
        {
          name: 'blank',
          in: 'query',
          description: 'Print the agreement with an empty header block.',
          schema: { type: 'string', enum: ['1', 'true'] },
        },
      ],
      responses: {
        200: { description: 'The agreement, as a PDF or as HTML.' },
        404: err('Laboratory not found.'),
        ...guarded,
      },
    },
  },

  '/api/users/laboratories/{id}/registration': {
    get: {
      tags: ['Users'],
      summary: 'The Franchisee Form, filled from the laboratory',
      description:
        'The paper registration form head office hands a new franchisee, typeset and pre-filled: name, owner, contact, address, GST, KYC, commission, registration fee and bank details come from the account. What is decided at the counter — the sponsor and the acknowledgement stub — is deliberately left blank to be written in. Returns a PDF inline, so a browser opens it to read and print rather than filing it in a downloads folder. `?format=html` returns the markup it is rendered from, for working on the layout. `?blank=1` prints the same form with nothing filled in, for handing out at a counter — one template, so the sheet given away and the sheet printed back from the account cannot drift apart. Administrators only.',
      parameters: [
        idParam,
        { name: 'format', in: 'query', schema: { type: 'string', enum: ['html'] } },
        {
          name: 'blank',
          in: 'query',
          description: 'Print the empty form: every label and box, no values.',
          schema: { type: 'string', enum: ['1', 'true'] },
        },
      ],
      responses: {
        200: { description: 'The form, as a PDF or as HTML.' },
        404: err('Laboratory not found.'),
        ...guarded,
      },
    },
  },

  '/api/users/laboratories/{id}/detail': {
    get: {
      tags: ['Users'],
      summary: 'One laboratory, with its payments, staff and certificates',
      description:
        'The laboratory page: the laboratory with its commission accrued, paid and due, the payments it has sent, who works there, and the certificates it has issued — three lists in one reply, because the page opens all three tabs at once. The money is computed here rather than carried from the list row, so the page stands on its own when opened from a bookmark or a reload. Each list is capped at the 50 most recent and `counts` carries the real totals, which are not the length of the lists. The full history lives on the screens that own it: Account for transactions, Employee Management for staff, Certificates for reports. Administrators only.\n\n`q` searches the certificate numbers of this laboratory. It is applied in the query rather than to the capped list, so it reaches every certificate the laboratory has issued and not just the fifty on the page; `counts.reports` is then how many matched, and the list is still the fifty most recent of those.',
      parameters: [
        idParam,
        {
          name: 'q',
          in: 'query',
          schema: { type: 'string' },
          description: 'Part of a certificate number. Filters the certificate list and its count; the payments and staff lists are unaffected.',
          examples: { partial: { value: '042600' } },
        },
      ],
      responses: {
        200: ok('The laboratory, its recent payments, its staff and its certificates.'),
        404: err('Laboratory not found.'),
        ...guarded,
      },
    },
  },

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
        office_tel: str,
        email: str,
        address: str,
        city: str,
        state: str,
        pincode: str,
        gst_no: str,
        bank_name: str,
        account_holder: str,
        bank_branch: str,
        ifsc_code: str,
        account_no: str,
        account_type: str,
        adhar_no: str,
        adhar_photo: str,
        pan_no: str,
        pan_photo: str,
        passport_no: str,
        passport_photo: str,
        dl_no: str,
        dl_photo: str,
        voter_id: str,
        voter_photo: str,
        id_proof_type: {
          type: ['string', 'null'],
          description:
            'The documents produced as proof of identity, comma separated — "PAN,AADHAR". The top row of tick boxes on the printed form; PAN, AADHAR and PASSPORT are what it offers.',
        },
        address_proof_type: {
          type: ['string', 'null'],
          description:
            'The documents produced as proof of address, comma separated. The second row on the printed form — AADHAR, D.L.NO. and VOTER ID. Its own answer, not derived from `id_proof_type`: a PAN card proves identity and not an address. A card named in both rows is still one card, with one number column and one scan.',
        },
        documents: {
          type: ['array', 'null'],
          description:
            'The attachment list. At most 25 entries; each has a `title` and a `path`, and the path must be a key inside the uploads area — anything else is refused rather than stored and rendered back as a link. `added_at` is kept when it is a valid date and stamped by the server otherwise. Sending null clears the list.',
          items: {
            type: 'object',
            required: ['path'],
            properties: {
              title: { type: 'string', maxLength: 191 },
              path: { type: 'string', examples: ['public/uploads/documentation/x.pdf'] },
              added_at: { type: 'string' },
            },
          },
        },
        profile_photo: str,
        company_logo: str,
        signature: str,
      }),
      responses: {
        200: ok('The updated record.'),
        400: err('Nothing to update, the name is blank, or a mobile change was attempted by somebody other than head office.'),
        409: err('That mobile number or email address is on another active account.'),
        ...guarded,
      },
    },
  },

  '/api/users/{id}': {
    get: {
      tags: ['Users'],
      summary: 'Read one account',
      description:
        'Head office reads any account; a laboratory reads the people it employs, and nobody else — the same rule `PATCH /api/users/{id}` applies, because whoever may change an account may read it. Everyone else reads themselves at /api/users/me. Carries `employment` — the current posting with its joining date, salary and employer, resolved to a user id and a name — or null when nobody employs them, which is the case for a laboratory and for somebody whose employment was ended.',
      parameters: [idParam],
      responses: {
        200: ok('Account, with its current employment.'),
        404: err('Account not found.'),
        // After the spread, or the shared 403 overwrites this one.
        ...guarded,
        403: err('That account is not one of your employees.'),
      },
    },
    patch: {
      tags: ['Users'],
      summary: 'Update any account',
      description:
        'Administrators only. A mobile number is checked against every other account first: the column carries no unique constraint, and duplicates are what locked three staff out of the old system. `empid` is a key as well as a label — employments name their employer by it — so one that anybody still works under cannot be changed.',
      parameters: [idParam],
      requestBody: body({
        fullname: { type: 'string' },
        mobile: { type: 'string' },
        email: str,
        role_id: int,
        is_active: bool,
        commision: { type: 'number' },
        commission_type: { type: 'string', enum: ['percent', 'per_pc'], description: 'How `commision` reads: a percentage of what the laboratory collects, or rupees for each piece it certifies. Decides the arithmetic on every commission figure and the wording on the printed franchisee form.' },
        registration_fee: { type: ['number', 'string', 'null'] },
        empid: str,
        address: str,
        city: str,
        state: str,
        // The rest of the franchisee form: everything on SELF_EDITABLE is
        // writable here too, these being the ones the laboratory screens send.
        owner_name: str,
        alt_mobile: str,
        office_tel: str,
        pincode: str,
        country: str,
        gst_no: str,
        fax: str,
        bank_name: str,
        account_holder: str,
        bank_branch: str,
        ifsc_code: str,
        account_no: str,
        account_type: str,
        adhar_no: str,
        adhar_photo: str,
        pan_no: str,
        pan_photo: str,
        passport_no: str,
        passport_photo: str,
        dl_no: str,
        dl_photo: str,
        voter_id: str,
        voter_photo: str,
        id_proof_type: str,
        address_proof_type: str,
        documents: {
          type: ['array', 'null'],
          description:
            'The attachment list. At most 25 entries; each has a `title` and a `path`, and the path must be a key inside the uploads area — anything else is refused rather than stored and rendered back as a link. `added_at` is kept when it is a valid date and stamped by the server otherwise. Sending null clears the list.',
          items: {
            type: 'object',
            required: ['path'],
            properties: {
              title: { type: 'string', maxLength: 191 },
              path: { type: 'string', examples: ['public/uploads/documentation/x.pdf'] },
              added_at: { type: 'string' },
            },
          },
        },
        profile_photo: str,
        signature: str,
        documentation: str,
      }),
      responses: {
        200: ok('Updated.'),
        400: err('Nothing to update, or a blank mobile number.'),
        409: err('Another active account already uses that mobile number, or employments still point at this empid.'),
        404: err('Account not found.'),
        ...guarded,
      },
    },
    delete: {
      tags: ['Users'],
      summary: 'Delete an account',
      description:
        'Administrators only. Refused while anybody’s work still points at the account — students or orders under a laboratory, staff employed under its empid — because this schema has no foreign keys and would leave those rows belonging to nobody. Deactivate instead: `PATCH /api/users/{id}/active` keeps the history readable. Grants in `user_permissions` go with the account.',
      parameters: [idParam],
      responses: {
        200: ok('Deleted.'),
        400: err('That is your own account.'),
        404: err('Account not found.'),
        409: err('Students, orders or staff still point at this account.'),
        ...guarded,
      },
    },
  },

  '/api/users/staff/salary': {
    get: {
      tags: ['Users'],
      summary: 'What each employee is owed for a month',
      description:
        'There is no payroll in this schema — no payslip, no payment, no deduction — and this does not invent one. It puts two facts the panel already holds side by side: the salary agreed on the employment, and the days their attendance recorded for the month.\n\n`payable` is arithmetic, not a payslip: the monthly salary over the days in the month, times the days present. Whether a Sunday counts, whether a half day is half, what an absence costs — none of it is recorded anywhere, so none of it is assumed here.\n\nA day punched into and never out of counts as present and contributes no minutes, which is the reading the calendar and the attendance tiles use. Scoped as the staff list is: a laboratory sees its own people, head office its own or one laboratory’s with `lab_id`.',
      parameters: [
        { name: 'month', in: 'query', schema: { type: 'string' }, description: 'YYYY-MM. Defaults to the current month.' },
        { name: 'lab_id', in: 'query', schema: { type: 'integer' }, description: 'Head office only: one laboratory’s staff.' },
      ],
      responses: {
        200: ok('One row per employee, with `month` and `days_in_month`.'),
        400: err('The month must be YYYY-MM.'),
        ...guarded,
      },
    },
  },

  '/api/users/staff/salary/pay': {
    post: {
      tags: ['Users'],
      summary: "Record a salary payment",
      description:
        'One row per payment, not per month. A month is often paid in parts, and a record that assumed one payment would have to be overwritten to hold the second — which is how a part payment quietly becomes the only payment.\n\n`month` is the month it is *for*, as YYYY-MM; `paid_on` is when it changed hands, and the two are often in different months. The agreed monthly salary and the days attended are copied onto the row as they stand now: attendance can be corrected afterwards, and a payslip that changes when somebody edits a punch is not a receipt.\n\nThe employer’s, like everything else that writes about their staff.',
      requestBody: body(
        {
          emp_id: int,
          month: { type: 'string', description: 'YYYY-MM, the month it is for.' },
          amount: { type: 'number' },
          paid_on: { type: 'string', format: 'date' },
          pay_mode: { type: 'string', enum: ['cash', 'upi', 'bank', 'cheque'] },
          reference: str,
          note: str,
        },
        ['emp_id', 'month', 'amount'],
      ),
      responses: {
        201: ok('Recorded.'),
        400: err('No employee, a month that is not YYYY-MM, or an amount at or below zero.'),
        ...guarded,
        403: err('Not your employee.'),
      },
    },
  },

  '/api/users/staff/salary/payments': {
    get: {
      tags: ['Users'],
      summary: 'What has been paid, and to whom',
      description:
        '`emp_id` narrows it to one person — their own page asks that way, and a person may read their own — and `month` to one month. With neither, it is everything this employer has paid, newest first, which is the history screen. Anybody else’s payroll is not yours to read.',
      parameters: [
        { name: 'emp_id', in: 'query', schema: { type: 'integer' }, description: 'One person’s history.' },
        { name: 'month', in: 'query', schema: { type: 'string' }, description: 'YYYY-MM.' },
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'per_page', in: 'query', schema: { type: 'integer', maximum: 200 } },
      ],
      responses: { 200: ok('Payments, newest first.'), ...guarded, 403: err('Not your employee.') },
    },
  },

  '/api/users/staff/{id}/payslip': {
    get: {
      tags: ['Users'],
      summary: 'A payslip for one month',
      description:
        'The payments recorded against that month, with the days and the monthly salary that were stored on them rather than read back today — attendance can be corrected afterwards, and a receipt that changes is not a receipt. There are no deductions, allowances or tax lines in this system, so there are none on the slip. Returns a PDF inline; `?format=html` returns the markup it is rendered from. The employer’s, or their own.',
      parameters: [
        idParam,
        { name: 'month', in: 'query', schema: { type: 'string' }, description: 'YYYY-MM. Defaults to the current month.' },
        { name: 'format', in: 'query', schema: { type: 'string', enum: ['html'] } },
      ],
      responses: {
        200: { description: 'The payslip, as a PDF or as HTML.' },
        400: err('The month must be YYYY-MM.'),
        ...guarded,
        403: err('Not your employee.'),
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
      summary: 'Attach a person to an employer',
      description:
        'Moves somebody onto an employer’s books. POST /api/users already does this for an account it creates, so this is for the ones that arrived without an employment — a Laravel-era row, or a person moving between laboratories after their old employment was ended. The employer is head office or a laboratory: head office employs its own staff too. `lab_id` is a **user id**; the employment stores that employer’s `empid`, so an employer without one is refused. `users.parent_id` is written at the same time, from the same value.',
      parameters: [idParam],
      requestBody: body(
        {
          lab_id: int,
          joining_date: { type: 'string' },
          salary: { type: 'string' },
          remark: str,
        week_off: {
          type: ['string', 'array', 'null'],
          items: { type: 'integer', minimum: 0, maximum: 6 },
          description:
            'The days of the week this posting is off, as 0 Sunday through 6 Saturday — the numbering Date.getDay() and MySQL both count in, so nothing translates. A list or a comma-separated string; sorted and de-duplicated on the way in. Empty means no fixed day off, which is what every employment said before the column existed. On the posting rather than the account: somebody moving to a laboratory that closes on a different day has a new week off, and the old row should keep saying what was true while it ran.',
        },
        working_hours: {
          type: ['number', 'string', 'null'],
          description: 'Hours in a full day for this posting, e.g. 9 or 8.5; more than 0 and at most 24. A closed day with fewer hours worked is marked short on the calendar. Blank or null is not set.',
        },
        late_after: {
          type: ['string', 'null'],
          description: 'HH:MM. A punch-in after this time is marked late on the calendar, and an empty day counts as absent once it has passed. Stored as HH:MM:00. Blank or null is not set.',
        },
        shift_start: {
          type: ['string', 'null'],
          description: 'HH:MM, when the day starts. Sent with shift_end — both or neither. When either is given, working_hours is written from the two (a shift ending at or before its start runs past midnight), overruling any working_hours in the same body. Both blank or null clears the shift and the hours.',
        },
        shift_end: {
          type: ['string', 'null'],
          description: 'HH:MM, when the day ends. See shift_start.',
        },
        },
        ['lab_id'],
      ),
      responses: {
        201: ok('Employed.'),
        400: err('Not an employer, not a staff account, or the employer has no empid.'),
        409: err('Already employed somewhere. End that first.'),
        404: err('Account not found.'),
        ...guarded,
      },
    },
    patch: {
      tags: ['Users'],
      summary: 'Change the terms of a posting',
      description:
        'The salary, the joining date, the week off, the working hours and the late time live on the employment, not on the account, so PATCH /api/users/{id} cannot reach them. Moving somebody to another employer is not this — that is ending one employment and starting another, which keeps the history.',
      parameters: [idParam],
      requestBody: body({
        salary: { type: 'number' },
        joining_date: { type: 'string', format: 'date' },
        remark: str,
        week_off: {
          type: ['string', 'array', 'null'],
          items: { type: 'integer', minimum: 0, maximum: 6 },
          description:
            'The days of the week this posting is off, as 0 Sunday through 6 Saturday — the numbering Date.getDay() and MySQL both count in, so nothing translates. A list or a comma-separated string; sorted and de-duplicated on the way in. Empty means no fixed day off, which is what every employment said before the column existed. On the posting rather than the account: somebody moving to a laboratory that closes on a different day has a new week off, and the old row should keep saying what was true while it ran.',
        },
        working_hours: {
          type: ['number', 'string', 'null'],
          description: 'Hours in a full day for this posting, e.g. 9 or 8.5; more than 0 and at most 24. A closed day with fewer hours worked is marked short on the calendar. Blank or null is not set.',
        },
        late_after: {
          type: ['string', 'null'],
          description: 'HH:MM. A punch-in after this time is marked late on the calendar, and an empty day counts as absent once it has passed. Stored as HH:MM:00. Blank or null is not set.',
        },
        shift_start: {
          type: ['string', 'null'],
          description: 'HH:MM, when the day starts. Sent with shift_end — both or neither. When either is given, working_hours is written from the two (a shift ending at or before its start runs past midnight), overruling any working_hours in the same body. Both blank or null clears the shift and the hours.',
        },
        shift_end: {
          type: ['string', 'null'],
          description: 'HH:MM, when the day ends. See shift_start.',
        },
      }),
      responses: {
        200: ok('Saved.'),
        400: err('Nothing to update, or a salary, date, working hours or late time that is not valid.'),
        404: err('Not currently employed anywhere.'),
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

  // ------------------------------------------------------ discount coupons
  '/api/coupons': {
    get: {
      tags: ['Coupons'],
      summary: 'List coupons',
      description:
        'Head office only, like every course route. Each row names its course (null is any course) and carries `spent` — the usage limit is reached — and `expired`, so a list never shows a coupon as usable when nobody can use it.',
      parameters: [
        { name: 'page', in: 'query', schema: int },
        { name: 'per_page', in: 'query', schema: int },
        { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Matches the code or the title.' },
        { name: 'course_id', in: 'query', schema: int },
        { name: 'active', in: 'query', schema: { type: 'string', enum: ['0', '1'] } },
      ],
      responses: { 200: ok('A page of coupons.'), ...guarded },
    },
    post: {
      tags: ['Coupons'],
      summary: 'Write a coupon',
      description:
        'A coupon is money off a **course fee** and nothing else. The code is upper-cased and stripped of spaces: it is read off a printout and typed back in. `course_id` ties it to one course; null is any course we run.',
      requestBody: body(
        {
          code: { type: 'string', examples: ['NEWYEAR25'] },
          title: str,
          description: str,
          discount_type: { type: 'string', enum: ['percent', 'fixed'] },
          discount_value: { type: 'number', examples: [20] },
          max_discount: { type: ['number', 'null'], description: 'Caps a percentage. Null is no cap.' },
          min_amount: { type: 'number', description: 'The course fee has to reach this first.' },
          course_id: { type: ['integer', 'null'] },
          valid_from: { type: ['string', 'null'], format: 'date' },
          valid_to: { type: ['string', 'null'], format: 'date' },
          usage_limit: { type: ['integer', 'null'], description: 'Total uses. Null is unlimited.' },
          per_student_limit: { type: ['integer', 'null'] },
          is_active: bool,
        },
        ['code', 'discount_value'],
      ),
      responses: {
        201: ok('Coupon written.'),
        400: err('A required field is missing, a percentage above 100, an unknown course, or a date that is not YYYY-MM-DD.'),
        409: err('That code is already a coupon.'),
        ...guarded,
      },
    },
  },

  '/api/coupons/validate': {
    post: {
      tags: ['Coupons'],
      summary: 'What a coupon would take off an enrolment',
      description:
        'Changes nothing. Type the code against an enrolment and see the figure before committing to it. A coupon that cannot be used comes back as a 400 naming the reason \u2014 switched off, not yet valid, expired on a date, for another course, fee below the minimum, used up, or already used by this student, already part-paid \u2014 because "not valid" sends somebody to the telephone and "expired on 2026-08-31" does not.',
      requestBody: body(
        { code: { type: 'string' }, enrolment_id: int },
        ['code', 'enrolment_id'],
      ),
      responses: {
        200: ok('The discount, and what the student then owes.'),
        400: err('The coupon cannot be used, with the reason.'),
        404: err('No such coupon, or no such enrolment.'),
        ...guarded,
      },
    },
  },

  '/api/coupons/redeem': {
    post: {
      tags: ['Coupons'],
      summary: 'Spend a coupon on an enrolment',
      description:
        'Writes the enrolment\u2019s own discount columns \u2014 the same ones PATCH /api/courses/enrolments/{id}/discount writes, with `final_fee` computed here and never taken from the request \u2014 records the redemption and moves the coupon\u2019s count, in one transaction. `discount_reason` becomes "Coupon CODE", so the discount screen explains itself without a join. Everything /api/coupons/validate checks is checked again: the two calls are minutes apart, and a coupon with one use left can be presented twice in that gap.',
      requestBody: body(
        { code: { type: 'string' }, enrolment_id: int, note: str },
        ['code', 'enrolment_id'],
      ),
      responses: {
        201: ok('Spent, and the enrolment discounted.'),
        400: err('A field is missing or invalid.'),
        404: err('No such coupon, or no such enrolment.'),
        409: err('The coupon cannot be used, or it would take the fee below what is already paid.'),
        ...guarded,
      },
    },
  },

  '/api/coupons/{id}': {
    get: {
      tags: ['Coupons'],
      summary: 'Read one coupon',
      parameters: [idParam],
      responses: { 200: ok('Coupon.'), 404: err('Coupon not found.'), ...guarded },
    },
    patch: {
      tags: ['Coupons'],
      summary: 'Change a coupon',
      description: 'Only the fields present in the body change.',
      parameters: [idParam],
      requestBody: body({
        code: { type: 'string' },
        title: str,
        description: str,
        discount_type: { type: 'string', enum: ['percent', 'fixed'] },
        discount_value: { type: 'number' },
        max_discount: { type: ['number', 'null'] },
        min_amount: { type: 'number' },
        course_id: { type: ['integer', 'null'] },
        valid_from: { type: ['string', 'null'], format: 'date' },
        valid_to: { type: ['string', 'null'], format: 'date' },
        usage_limit: { type: ['integer', 'null'] },
        per_student_limit: { type: ['integer', 'null'] },
      }),
      responses: {
        200: ok('Saved.'),
        400: err('Nothing to update, or a value that is not allowed.'),
        409: err('That code is already a coupon.'),
        ...guarded,
      },
    },
    delete: {
      tags: ['Coupons'],
      summary: 'Delete a coupon',
      description:
        'Only one that has never been spent. A coupon with redemptions is switched off instead \u2014 deleting it would take the record of money already taken off a student\u2019s fee with it.',
      parameters: [idParam],
      responses: {
        200: ok('Deleted.'),
        409: err('It has been used. Switch it off instead.'),
        404: err('Coupon not found.'),
        ...guarded,
      },
    },
  },

  '/api/coupons/{id}/active': {
    patch: {
      tags: ['Coupons'],
      summary: 'Switch a coupon on or off',
      description: 'How a coupon is withdrawn once it has been spent at least once.',
      parameters: [idParam],
      requestBody: body({ is_active: bool }, ['is_active']),
      responses: { 200: ok('Saved.'), 404: err('Coupon not found.'), ...guarded },
    },
  },

  '/api/coupons/{id}/redemptions': {
    get: {
      tags: ['Coupons'],
      summary: 'Where a coupon went',
      description:
        'One enrolment per row, newest first: the student, the course, the fee before, the discount, what was left, and who applied it. The row keeps the code as it stood at the time \u2014 a coupon can be renamed, what a student was charged cannot.',
      parameters: [
        idParam,
        { name: 'page', in: 'query', schema: int },
        { name: 'per_page', in: 'query', schema: int },
      ],
      responses: { 200: ok('A page of redemptions.'), 404: err('Coupon not found.'), ...guarded },
    },
  },

};
