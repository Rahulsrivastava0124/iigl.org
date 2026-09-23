import { useEffect, useState } from 'react';
import { BookOpen, Wallet, Award, User, LogOut, Loader2, CreditCard, FileText, X } from 'lucide-react';
import { getPublic, getStudent, postStudent, studentUrl, fileUrl } from '../../lib/api.js';
import { payStudentEnrolment, payStudentRegistration } from '../../lib/cashfree.js';

const rupee = (v) => `₹ ${Number(v ?? 0).toLocaleString('en-IN')}`;
const date = (v) => (v ? String(v).slice(0, 10) : '—');

/**
 * The student portal at /student.
 *
 * Signed out, it is a sign-in: a student enters the mobile number they
 * registered with, is mailed a code, and enters it. Signed in, it is their own
 * page — courses, fees and certificates — read from `/api/public/student/*`,
 * which is scoped to them by the `iigl.student` cookie.
 */
export default function StudentPortal() {
  const [student, setStudent] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getStudent('/me')
      .then((data) => setStudent(data))
      .catch(() => setStudent(null))
      .finally(() => setChecking(false));
  }, []);

  // Tells the header, which shows the signed-in name, to look again.
  useEffect(() => {
    if (!checking) window.dispatchEvent(new Event('iigl:student'));
  }, [student, checking]);

  if (checking) {
    return (
      <main className="grid min-h-[60vh] place-items-center bg-[#f8f9fb]">
        <Loader2 className="h-6 w-6 animate-spin text-[#061948]" />
      </main>
    );
  }

  return student ? (
    <Panel student={student} onSignOut={() => setStudent(null)} />
  ) : (
    <SignIn onSignedIn={(s) => setStudent(s)} />
  );
}

/* ------------------------------------------------------------------ sign in */

function SignIn({ onSignedIn }) {
  // 'mobile' asks for the number, then 'code' asks for the emailed code.
  const [step, setStep] = useState('mobile');
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const requestCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await postStudent('/otp', { mobile });
      // Not on record: say so rather than move to a code screen for a code that
      // is never coming.
      if (!data.registered) {
        setError('This mobile number is not registered. Please register first, or check the number.');
        return;
      }
      // Registered, but no email to send the code to.
      if (!data.sent) {
        setError('No email address is on file for this number, so a code cannot be sent. Please contact the office.');
        return;
      }
      setSentTo(data.to);
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await postStudent('/verify', { mobile, code });
      onSignedIn(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-[70vh] place-items-center bg-[#f8f9fb] px-4 py-16">
      <div className="w-full max-w-[420px] rounded-2xl border border-[#e6e8ee] bg-white p-8 shadow-sm">
        <h1 className="m-0 font-['Playfair_Display',Georgia,serif] text-[28px] font-medium text-[#061948]">
          Student sign in
        </h1>
        <p className="m-0 mt-2 text-[14px] text-[#4a5265]">
          {step === 'mobile'
            ? 'Enter the mobile number you registered with. We will email you a sign-in code.'
            : sentTo
              ? `We emailed a 6-digit code to ${sentTo}. Enter it below.`
              : 'If that number is registered, a code has been emailed to the address on file.'}
        </p>

        {error && (
          <p className="m-0 mt-4 rounded-lg bg-[#fdecea] px-3 py-2 text-[13px] text-[#b3261e]">{error}</p>
        )}

        {step === 'mobile' ? (
          <form onSubmit={requestCode} className="mt-6 flex flex-col gap-3">
            <input
              className="rounded-lg border border-[#d6d9e2] px-3 py-2.5 text-[15px] text-[#061948] outline-none focus:border-[#061948]"
              type="tel"
              inputMode="numeric"
              placeholder="Mobile number"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              required
            />
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#061948] px-4 py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-[#0b2a6b] disabled:opacity-60"
              type="submit"
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Send code
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-6 flex flex-col gap-3">
            <input
              className="rounded-lg border border-[#d6d9e2] px-3 py-2.5 text-center text-[20px] tracking-[6px] text-[#061948] outline-none focus:border-[#061948]"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
            />
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#061948] px-4 py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-[#0b2a6b] disabled:opacity-60"
              type="submit"
              disabled={busy || code.length !== 6}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </button>
            <button
              type="button"
              className="text-[13px] text-[#bd7724] hover:underline"
              onClick={() => {
                setStep('mobile');
                setCode('');
                setError('');
              }}
            >
              Use a different number
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------- panel */

const TABS = [
  { id: 'courses', label: 'My Courses', icon: BookOpen },
  { id: 'fees', label: 'Fees', icon: Wallet },
  { id: 'certificates', label: 'Certificates', icon: Award },
  { id: 'profile', label: 'Profile', icon: User },
];

function Panel({ student, onSignOut }) {
  const [tab, setTab] = useState('courses');

  const signOut = async () => {
    try {
      await postStudent('/logout');
    } catch {
      /* clearing the cookie is best-effort; the page returns to sign-in regardless */
    }
    onSignOut();
  };

  return (
    <main className="bg-[#f8f9fb] px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-[960px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="m-0 text-[12px] font-medium uppercase tracking-wide text-[#bd7724]">Welcome</p>
            <h1 className="m-0 font-['Playfair_Display',Georgia,serif] text-[30px] font-medium text-[#061948]">
              {student.name}
            </h1>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-[#e6e8ee] bg-white px-3 py-2 text-[14px] text-[#061948] hover:border-[#061948]"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 border-b border-[#e6e8ee]">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-[14px] font-medium transition-colors ${
                  active
                    ? 'border-[#061948] text-[#061948]'
                    : 'border-transparent text-[#4a5265] hover:text-[#061948]'
                }`}
              >
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          {tab === 'courses' && <Courses />}
          {tab === 'fees' && <Fees />}
          {tab === 'certificates' && <Certificates />}
          {tab === 'profile' && <Profile />}
        </div>
      </div>
    </main>
  );
}

/** A small data hook for the panel pages, with a reload for after a payment. */
function usePortal(path) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    getStudent(path)
      .then((data) => live && setState({ loading: false, data, error: '' }))
      .catch((err) => live && setState({ loading: false, data: null, error: err.message }));
    return () => {
      live = false;
    };
  }, [path, nonce]);
  return { ...state, reload: () => setNonce((n) => n + 1) };
}

function Card({ children }) {
  return <div className="rounded-xl border border-[#e6e8ee] bg-white p-5">{children}</div>;
}

function Loading() {
  return (
    <div className="grid place-items-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-[#061948]" />
    </div>
  );
}

function Empty({ children }) {
  return <p className="py-8 text-center text-[14px] text-[#4a5265]">{children}</p>;
}

function Courses() {
  const { loading, data, reload } = usePortal('/enrolments');
  // The course registered for. Until head office enrols the student (or the
  // fee is paid online) there is no enrolment, only this.
  const profile = usePortal('/profile');
  // Whether online payment is offered, read once.
  const [pay, setPay] = useState({ enabled: false, mode: 'sandbox' });
  useEffect(() => {
    getStudent('/payments/config')
      .then((c) => setPay(c))
      .catch(() => {});
  }, []);

  if (loading || profile.loading) return <Loading />;
  const reg = profile.data;
  const unenrolled =
    reg?.course_name && reg.status !== 'cancelled' && !data?.some((e) => e.course_name === reg.course_name);
  if (!data?.length && !unenrolled) return <Empty>You are not enrolled on any course yet.</Empty>;
  return (
    <div className="grid gap-3">
      {unenrolled && (
        <RegistrationCard
          reg={reg}
          payEnabled={pay.enabled}
          onChange={() => {
            reload();
            profile.reload();
          }}
        />
      )}
      {data.map((e) => (
        <CourseCard key={e.id} e={e} payEnabled={pay.enabled} onPaid={reload} />
      ))}
    </div>
  );
}

const REG_STATE = {
  pending: ['Pending', 'bg-[#fdf3e3] text-[#b26a00]', 'Our team will call you to confirm the batch, the fees and admission.'],
  registered: ['Registered', 'bg-[#eef1f7] text-[#061948]', 'Your batch and fees will appear here once you are enrolled.'],
  active: ['Active', 'bg-[#e8f5ee] text-[#1a7f4b]', 'Your batch and fees will appear here once you are enrolled.'],
};

/**
 * A registration not yet turned into an enrolment: the course, its fee, and the
 * two things the student can do about it — pay (which enrols them) or cancel.
 */
function RegistrationCard({ reg, payEnabled, onChange }) {
  const [label, tone, next] = REG_STATE[reg.status] ?? [reg.status || 'Pending', 'bg-[#eef1f7] text-[#061948]', REG_STATE.pending[2]];
  const [course, setCourse] = useState(null);
  const [busy, setBusy] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    getPublic('/public/courses')
      .then((all) => setCourse((all ?? []).find((c) => String(c.id) === String(reg.course_id)) ?? null))
      .catch(() => {});
  }, [reg.course_id]);

  const total = Number(course?.fee_total ?? 0);
  const facts = [course?.code, course?.level, course?.duration].filter(Boolean);

  const pay = async () => {
    setBusy('pay');
    setNote('');
    try {
      const outcome = await payStudentRegistration();
      if (outcome.status === 'paid') onChange();
      else setNote('Payment not completed. If money was debited it will be confirmed shortly.');
    } catch (err) {
      setNote(err.message);
    } finally {
      setBusy('');
    }
  };

  const cancel = async () => {
    setBusy('cancel');
    setNote('');
    try {
      await postStudent('/registration/cancel');
      onChange();
    } catch (err) {
      setNote(err.message);
      setBusy('');
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="m-0 text-[17px] font-semibold text-[#061948]">{reg.course_name}</h3>
          {facts.length > 0 && <p className="m-0 mt-1 text-[13px] text-[#4a5265]">{facts.join(' · ')}</p>}
          <p className="m-0 mt-1 text-[13px] text-[#4a5265]">
            Registration No. <span className="font-mono font-medium text-[#061948]">{reg.registration_no}</span> · Registered {date(reg.registration_date)}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[12px] font-medium capitalize ${tone}`}>{label}</span>
      </div>

      {total > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-[#4a5265]">
          <span>
            Course fee: <b className="text-[#061948]">{rupee(total)}</b>
            {total > Number(course.fee) ? ' incl. GST' : ''}
          </span>
          <span className="font-medium text-[#b3261e]">Not paid</span>
        </div>
      )}
      <p className="m-0 mt-3 text-[13px] text-[#4a5265]">{next}</p>

      {reg.status === 'pending' && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {payEnabled && total > 0 && (
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-[#061948] px-3 py-2 text-[13px] font-medium text-white hover:bg-[#0b2a6b] disabled:opacity-60"
              onClick={pay}
              disabled={Boolean(busy)}
            >
              {busy === 'pay' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Pay {rupee(total)}
            </button>
          )}
          {confirming ? (
            <span className="inline-flex flex-wrap items-center gap-2 text-[13px] text-[#4a5265]">
              Cancel this registration?
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-[#b3261e] px-3 py-2 text-[13px] font-medium text-white hover:bg-[#8f1e18] disabled:opacity-60"
                onClick={cancel}
                disabled={Boolean(busy)}
              >
                {busy === 'cancel' && <Loader2 className="h-4 w-4 animate-spin" />}
                Yes, cancel
              </button>
              <button
                className="rounded-lg border border-[#e6e8ee] px-3 py-2 text-[13px] font-medium text-[#061948] hover:border-[#061948]"
                onClick={() => setConfirming(false)}
                disabled={Boolean(busy)}
              >
                Keep it
              </button>
            </span>
          ) : (
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-[#e6e8ee] px-3 py-2 text-[13px] font-medium text-[#b3261e] hover:border-[#b3261e] disabled:opacity-60"
              onClick={() => setConfirming(true)}
              disabled={Boolean(busy)}
            >
              <X className="h-4 w-4" /> Cancel registration
            </button>
          )}
        </div>
      )}

      {note && <p className="m-0 mt-3 text-[13px] text-[#4a5265]">{note}</p>}
    </Card>
  );
}

function CourseCard({ e, payEnabled, onPaid }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const pay = async () => {
    setBusy(true);
    setNote('');
    try {
      const outcome = await payStudentEnrolment(e.id);
      if (outcome.status === 'paid') {
        setNote('Payment received. Thank you.');
        onPaid();
      } else {
        setNote('Payment not completed. If money was debited it will be confirmed shortly.');
      }
    } catch (err) {
      setNote(err.message);
    } finally {
      setBusy(false);
    }
  };

  const settled = e.due <= 0;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="m-0 text-[17px] font-semibold text-[#061948]">{e.course_name ?? 'Course'}</h3>
          <p className="m-0 mt-1 text-[13px] text-[#4a5265]">
            {e.batch ? `Batch ${e.batch} · ` : ''}
            {date(e.start_date)} — {e.completed_on ? date(e.completed_on) : date(e.end_date)}
          </p>
        </div>
        <span className="rounded-full bg-[#eef1f7] px-3 py-1 text-[12px] font-medium capitalize text-[#061948]">
          {e.status || 'active'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-[#4a5265]">
        <span>Payable: <b className="text-[#061948]">{rupee(e.payable)}</b></span>
        <span>Paid: <b className="text-[#061948]">{rupee(e.fee_paid)}</b></span>
        <span>Due: <b className={e.due > 0 ? 'text-[#b3261e]' : 'text-[#061948]'}>{rupee(e.due)}</b></span>
        <span className={settled ? 'font-medium text-[#1a7f4b]' : 'font-medium text-[#b3261e]'}>
          {settled ? 'Fully paid' : 'Payment due'}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a
          className="inline-flex items-center gap-2 rounded-lg border border-[#e6e8ee] px-3 py-2 text-[13px] font-medium text-[#061948] hover:border-[#061948]"
          href={studentUrl(`/enrolments/${e.id}/statement`)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <FileText className="h-4 w-4" /> Receipt
        </a>
        {!settled && payEnabled && (
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-[#061948] px-3 py-2 text-[13px] font-medium text-white hover:bg-[#0b2a6b] disabled:opacity-60"
            onClick={pay}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Pay {rupee(e.due)}
          </button>
        )}
      </div>

      {note && <p className="m-0 mt-3 text-[13px] text-[#4a5265]">{note}</p>}
    </Card>
  );
}

function Fees() {
  const { loading, data } = usePortal('/fees');
  if (loading) return <Loading />;
  if (!data?.lines?.length) return <Empty>No fees on record yet.</Empty>;
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Payable', data.payable, '#061948'],
          ['Paid', data.paid, '#1a7f4b'],
          ['Due', data.due, data.due > 0 ? '#b3261e' : '#061948'],
        ].map(([label, value, color]) => (
          <Card key={label}>
            <p className="m-0 text-[12px] uppercase tracking-wide text-[#4a5265]">{label}</p>
            <p className="m-0 mt-1 text-[20px] font-semibold" style={{ color }}>
              {rupee(value)}
            </p>
          </Card>
        ))}
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="text-left text-[#4a5265]">
                <th className="border-b border-[#e6e8ee] py-2 pr-3 font-medium">Course</th>
                <th className="border-b border-[#e6e8ee] py-2 pr-3 text-right font-medium">Payable</th>
                <th className="border-b border-[#e6e8ee] py-2 pr-3 text-right font-medium">Paid</th>
                <th className="border-b border-[#e6e8ee] py-2 pr-3 text-right font-medium">Due</th>
                <th className="border-b border-[#e6e8ee] py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l) => (
                <tr key={l.id} className="text-[#061948]">
                  <td className="border-b border-[#f0f1f5] py-2 pr-3">
                    {l.course_name ?? 'Course'}
                    {l.batch ? <span className="text-[#4a5265]"> · {l.batch}</span> : null}
                  </td>
                  <td className="border-b border-[#f0f1f5] py-2 pr-3 text-right">{rupee(l.payable)}</td>
                  <td className="border-b border-[#f0f1f5] py-2 pr-3 text-right">{rupee(l.paid)}</td>
                  <td className={`border-b border-[#f0f1f5] py-2 pr-3 text-right ${l.due > 0 ? 'text-[#b3261e]' : ''}`}>
                    {rupee(l.due)}
                  </td>
                  <td className="border-b border-[#f0f1f5] py-2 text-right">
                    <a
                      className="text-[13px] font-medium text-[#bd7724] hover:underline"
                      href={studentUrl(`/enrolments/${l.id}/statement`)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Statement
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Certificates() {
  const { loading, data } = usePortal('/certificates');
  if (loading) return <Loading />;
  if (!data?.length) return <Empty>No certificates have been issued to you yet.</Empty>;
  return (
    <div className="grid gap-3">
      {data.map((c) => (
        <Card key={c.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="m-0 text-[16px] font-semibold text-[#061948]">{c.course_name ?? 'Course'}</h3>
              <p className="m-0 mt-1 text-[13px] text-[#4a5265]">
                No. {c.certificate_no} · Issued {date(c.issued_on)}
                {c.grade ? ` · Grade ${c.grade}` : ''}
              </p>
            </div>
            <a
              className="inline-flex items-center gap-2 rounded-lg bg-[#061948] px-3 py-2 text-[13px] font-medium text-white hover:bg-[#0b2a6b]"
              href={studentUrl(`/certificates/${c.id}/download`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Award className="h-4 w-4" /> Download
            </a>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Profile() {
  const { loading, data } = usePortal('/profile');
  if (loading) return <Loading />;
  if (!data) return <Empty>Could not load your details.</Empty>;
  const rows = [
    ['Registration No.', data.registration_no],
    ['Registered on', date(data.registration_date)],
    ['Course applied for', data.course_name],
    ['Mobile', data.mobile],
    ['Alternate mobile', data.alt_mobile],
    ['Email', data.email],
    ["Father's name", data.father_name],
    ['Gender', data.gender],
    ['Date of birth', date(data.dob)],
    ['Address', [data.address, data.city, data.state, data.pincode].filter(Boolean).join(', ')],
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-4">
        {data.photo && (
          <img
            className="h-20 w-20 rounded-full border border-[#e6e8ee] object-cover"
            src={fileUrl(data.photo)}
            alt=""
          />
        )}
        <div>
          <h3 className="m-0 text-[18px] font-semibold text-[#061948]">{data.name}</h3>
          <p className="m-0 mt-0.5 text-[13px] capitalize text-[#4a5265]">{data.status || 'registered'}</p>
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-[#f0f1f5] py-1.5 text-[14px]">
            <dt className="text-[#4a5265]">{k}</dt>
            <dd className="m-0 text-right font-medium text-[#061948]">{v || '—'}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
