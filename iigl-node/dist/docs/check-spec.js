import { openApiDocument } from './openapi.js';
import { authRoutes } from '../routes/auth.routes.js';
import { publicRoutes } from '../routes/public.routes.js';
import { catalogRoutes } from '../routes/catalog.routes.js';
import { orderRoutes } from '../routes/order.routes.js';
import { reportRoutes } from '../routes/report.routes.js';
import { transactionRoutes } from '../routes/transaction.routes.js';
import { userRoutes } from '../routes/user.routes.js';
import { dashboardRoutes } from '../routes/dashboard.routes.js';
import { cardRoutes } from '../routes/card.routes.js';
import { adminRoutes } from '../routes/admin.routes.js';
import { uploadRoutes } from '../routes/upload.routes.js';
import { attendanceRoutes } from '../routes/attendance.routes.js';
import { contentRoutes } from '../routes/content.routes.js';
import { customerRoutes } from '../routes/customer.routes.js';
import { roleRoutes } from '../routes/role.routes.js';
import { studentRoutes } from '../routes/student.routes.js';
import { courseRoutes } from '../routes/course.routes.js';
import { studentCertificateRoutes } from '../routes/student-certificate.routes.js';
import { enquiryRoutes } from '../routes/enquiry.routes.js';
import { couponRoutes } from '../routes/coupon.routes.js';
import { masterRoutes } from '../routes/master.routes.js';
import { settingsRoutes } from '../routes/settings.routes.js';
import { db } from '../db/index.js';
const MOUNTS = [
    ['/api/auth', authRoutes],
    ['/api/public', publicRoutes],
    ['/api/catalog', catalogRoutes],
    ['/api/orders', orderRoutes],
    ['/api/reports', reportRoutes],
    ['/api/transactions', transactionRoutes],
    ['/api/users', userRoutes],
    ['/api/dashboard', dashboardRoutes],
    ['/api/cards', cardRoutes],
    ['/api/admin', adminRoutes],
    ['/api/uploads', uploadRoutes],
    ['/api/attendance', attendanceRoutes],
    ['/api/content', contentRoutes],
    ['/api/customers', customerRoutes],
    ['/api/roles', roleRoutes],
    ['/api/students', studentRoutes],
    ['/api/courses', courseRoutes],
    ['/api/student-certificates', studentCertificateRoutes],
    ['/api/enquiries', enquiryRoutes],
    ['/api/coupons', couponRoutes],
    ['/api/master', masterRoutes],
    ['/api/settings', settingsRoutes],
];
/** Routes registered directly on the app rather than through a router. */
const STANDALONE = ['GET /health', 'GET /openapi.json'];
function routesOf(prefix, router) {
    const stack = router.stack;
    const out = [];
    for (const layer of stack) {
        if (!layer.route)
            continue;
        const path = (prefix + layer.route.path).replace(/\/$/, '') || prefix;
        for (const method of Object.keys(layer.route.methods)) {
            out.push(`${method.toUpperCase()} ${path}`);
        }
    }
    return out;
}
const implemented = new Set([...STANDALONE, ...MOUNTS.flatMap(([prefix, router]) => routesOf(prefix, router))]
    // Express writes :param, OpenAPI writes {param}.
    .map((r) => r.replace(/:(\w+)/g, '{$1}')));
const documented = new Set();
for (const [path, ops] of Object.entries(openApiDocument.paths)) {
    for (const method of Object.keys(ops)) {
        documented.add(`${method.toUpperCase()} ${path}`);
    }
}
const undocumented = [...implemented].filter((r) => !documented.has(r)).sort();
const phantom = [...documented].filter((r) => !implemented.has(r)).sort();
console.log(`routes implemented: ${implemented.size}`);
console.log(`routes documented:  ${documented.size}`);
if (undocumented.length) {
    console.log('\nImplemented but not documented:');
    for (const r of undocumented)
        console.log(`  ${r}`);
}
if (phantom.length) {
    console.log('\nDocumented but not implemented:');
    for (const r of phantom)
        console.log(`  ${r}`);
}
await db.destroy();
if (undocumented.length || phantom.length)
    process.exit(1);
console.log('\nSpec matches the routers.');
