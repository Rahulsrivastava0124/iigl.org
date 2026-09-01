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
        'Head office creates a shared role; a laboratory creates one of its own, which only its staff can be given. The name must be unique among the roles the creator can see — two laboratories may both have a "Front desk".',
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
      description: 'Refused while anybody holds it, and never for the five that shipped.',
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
        'From `permission_actions`. `enforced` is false for a name the API does not yet check — it appears on the permission screens but grants nothing until a check is written against it.',
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
      parameters: [idParam],
      responses: { 200: ok('One row per permission.'), 404: err('Role not found.'), ...guarded },
    },
    put: {
      tags: ['Permissions'],
      summary: 'Set one permission on one role',
      parameters: [idParam],
      requestBody: body(
        { action_type: { type: 'string' }, view: bool, create: bool, update: bool, delete: bool },
        ['action_type'],
      ),
      responses: {
        200: ok('Saved.'),
        400: err('Not a permission.'),
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
        'Separate from their role. Head office may read anybody; a laboratory only its own staff.\n\nEvery action comes back, so a screen can list them all, with `own` saying which of them this person actually has a row for. A filled gap and a stored row of four zeros are not the same thing — the first is “whatever the role says”, the second is “not this, whatever the role says” — and both look like four unticked boxes, so `own` is what tells them apart.',
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
        'An individual grant **replaces** the role\'s answer for that action rather than adding to it, so it can take away as well as give — all four flags off means "not this, whatever the role says". It is also how a user with no role gets anything at all.',
      parameters: [idParam],
      requestBody: body(
        { action_type: { type: 'string' }, view: bool, create: bool, update: bool, delete: bool },
        ['action_type'],
      ),
      responses: {
        200: ok('Saved.'),
        400: err('Not a permission.'),
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
      responses: { 200: ok('Courses, by name.'), ...guarded },
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
          description: str,
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
      description: 'Added to what is already paid rather than replacing it, and refused above the amount due.',
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
        'Not the gemstone certificates in /api/reports. These are numbered IIGL-C-YYYY-NNNN so the two cannot be mistaken for one another across a desk.',
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
          schema: { type: 'string', enum: ['ask', 'visit', 'lead', 'complaint'] },
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
          kind: { type: 'string', enum: ['ask', 'visit', 'lead', 'complaint'] },
          name: { type: 'string' },
          mobile: { type: 'string' },
          email: str,
          subject: str,
          message: str,
          source: str,
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
        kind: { type: 'string', enum: ['ask', 'visit', 'lead', 'complaint'] },
        name: { type: 'string' },
        mobile: { type: 'string' },
        email: str,
        subject: str,
        message: str,
        source: str,
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
        adhar_no: str,
        adhar_photo: str,
        pan_no: str,
        pan_photo: str,
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
      description:
        'Administrators only. Everyone else reads themselves at /api/users/me. Carries `employment` — the current posting with its joining date, salary and employer, resolved to a user id and a name — or null when nobody employs them, which is the case for a laboratory and for somebody whose employment was ended.',
      parameters: [idParam],
      responses: {
        200: ok('Account, with its current employment.'),
        404: err('Account not found.'),
        ...guarded,
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
        empid: str,
        address: str,
        city: str,
        state: str,
      }),
      responses: {
        200: ok('Updated.'),
        400: err('Nothing to update, or a blank mobile number.'),
        409: err('Another account already uses that mobile number, or employments still point at this empid.'),
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
      summary: 'Attach a person to an employer',
      description:
        'Moves somebody onto an employer’s books. POST /api/users already does this for an account it creates, so this is for the ones that arrived without an employment — a Laravel-era row, or a person moving between laboratories after their old employment was ended. The employer is head office or a laboratory: head office employs its own staff too. `lab_id` is a **user id**; the employment stores that employer’s `empid`, so an employer without one is refused. `users.parent_id` is written at the same time, from the same value.',
      parameters: [idParam],
      requestBody: body(
        { lab_id: int, joining_date: { type: 'string' }, salary: { type: 'string' }, remark: str },
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
        'The salary and the joining date live on the employment, not on the account, so PATCH /api/users/{id} cannot reach them. Moving somebody to another employer is not this — that is ending one employment and starting another, which keeps the history.',
      parameters: [idParam],
      requestBody: body({
        salary: { type: 'number' },
        joining_date: { type: 'string', format: 'date' },
        remark: str,
      }),
      responses: {
        200: ok('Saved.'),
        400: err('Nothing to update, or a salary or date that is not valid.'),
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
